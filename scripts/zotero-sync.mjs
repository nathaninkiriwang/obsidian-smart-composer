#!/usr/bin/env node

/**
 * Standalone Zotero PDF Sync
 *
 * Watches ~/Zotero/storage for changes and syncs PDFs to your vault's Library
 * folder, mirroring Zotero's collection structure.
 *
 * Usage:
 *   node scripts/zotero-sync.mjs                    # watch mode (default)
 *   node scripts/zotero-sync.mjs --once              # sync once and exit
 *   node scripts/zotero-sync.mjs --library ~/vault/Library  # custom library path
 *   node scripts/zotero-sync.mjs --storage ~/Zotero/storage # custom storage path
 *
 * Requires: Zotero running with local API enabled (port 23119)
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

// ─── Configuration (override via CLI args) ──────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag) {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return null
}

const ZOTERO_API = getArg('--api') || 'http://localhost:23119'
const ZOTERO_STORAGE = getArg('--storage') || path.join(homedir(), 'Zotero', 'storage')
const VAULT_LIBRARY = getArg('--library') || path.join(homedir(), 'vault', 'Library')
const DEBOUNCE_MS = parseInt(getArg('--debounce') || '5000', 10)
const ONCE = args.includes('--once')

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        })
      })
    })
    req.on('error', reject)
  })
}

async function httpGetJson(url) {
  const res = await httpGet(url)
  if (res.status !== 200) {
    throw new Error(`Zotero API error: HTTP ${res.status} for ${url}`)
  }
  return JSON.parse(res.body)
}

// ─── Zotero API ─────────────────────────────────────────────────────────────

async function fetchCollections() {
  return httpGetJson(`${ZOTERO_API}/api/users/0/collections?format=json`)
}

async function fetchAllItemsRaw() {
  const all = []
  let start = 0
  const limit = 100

  while (true) {
    const params = new URLSearchParams({
      format: 'json',
      limit: String(limit),
      start: String(start),
    })
    const batch = await httpGetJson(
      `${ZOTERO_API}/api/users/0/items?${params.toString()}`
    )
    all.push(...batch)
    if (batch.length < limit) break
    start += limit
  }

  return all
}

// ─── Collection tree ────────────────────────────────────────────────────────

function sanitizeFolderName(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

function buildCollectionTree(collections, rootPath) {
  const childrenMap = new Map()
  const roots = []

  for (const c of collections) {
    if (c.data.parentCollection === false) {
      roots.push(c)
    } else {
      const parentKey = c.data.parentCollection
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, [])
      childrenMap.get(parentKey).push(c)
    }
  }

  function buildNode(col, parentPath) {
    const folderName = sanitizeFolderName(col.data.name)
    const nodePath = path.join(parentPath, folderName)
    const children = (childrenMap.get(col.key) ?? [])
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .map((child) => buildNode(child, nodePath))
    return { key: col.key, name: col.data.name, path: nodePath, children }
  }

  return roots
    .sort((a, b) => a.data.name.localeCompare(b.data.name))
    .map((r) => buildNode(r, rootPath))
}

function flattenTree(nodes) {
  const result = []
  function walk(node) {
    result.push(node)
    for (const child of node.children) walk(child)
  }
  for (const n of nodes) walk(n)
  return result
}

// ─── Sync logic ─────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    log(`  Created folder: ${dirPath}`)
  }
}

function log(msg) {
  const ts = new Date().toLocaleTimeString()
  console.log(`[${ts}] ${msg}`)
}

async function sync() {
  log('Starting sync...')

  // 1. Fetch collections and build tree
  const collections = await fetchCollections()
  const tree = buildCollectionTree(collections, VAULT_LIBRARY)
  const flatNodes = flattenTree(tree)

  const collectionPathMap = new Map()
  for (const node of flatNodes) {
    collectionPathMap.set(node.key, node.path)
  }

  // 2. Fetch all items (including attachments) in one pass
  const allRaw = await fetchAllItemsRaw()

  const items = []
  const attachmentMap = new Map() // parentKey -> attachment

  for (const raw of allRaw) {
    if (raw.data.itemType === 'attachment') {
      if (
        raw.data.contentType === 'application/pdf' &&
        raw.data.filename &&
        raw.data.parentItem
      ) {
        attachmentMap.set(raw.data.parentItem, raw)
      }
    } else if (raw.data.itemType !== 'note') {
      items.push(raw)
    }
  }

  log(`Found ${items.length} items, ${attachmentMap.size} PDF attachments`)

  // 3. Ensure all folders exist
  ensureDir(VAULT_LIBRARY)
  for (const node of flatNodes) {
    ensureDir(node.path)
  }
  ensureDir(path.join(VAULT_LIBRARY, '_Unsorted'))

  // 4. Sync each item's PDF
  let synced = 0
  let skipped = 0
  let missing = 0

  for (const item of items) {
    const attachment = attachmentMap.get(item.key)
    if (!attachment || !attachment.data.filename) {
      missing++
      continue
    }

    // Source PDF in Zotero storage
    const sourcePath = path.join(
      ZOTERO_STORAGE,
      attachment.data.key,
      attachment.data.filename
    )

    if (!fs.existsSync(sourcePath)) {
      missing++
      continue
    }

    const sourceStats = fs.statSync(sourcePath)
    const filename = attachment.data.filename

    // Determine destination folder(s) based on collections
    const collectionKeys = item.data.collections ?? []
    const destFolders = []

    if (collectionKeys.length === 0) {
      destFolders.push(path.join(VAULT_LIBRARY, '_Unsorted'))
    } else {
      for (const key of collectionKeys) {
        const folderPath = collectionPathMap.get(key)
        if (folderPath) destFolders.push(folderPath)
      }
      if (destFolders.length === 0) {
        destFolders.push(path.join(VAULT_LIBRARY, '_Unsorted'))
      }
    }

    // Copy to each destination
    for (const folder of destFolders) {
      const destPath = path.join(folder, filename)

      // Skip if already exists with same size
      if (fs.existsSync(destPath)) {
        const destStats = fs.statSync(destPath)
        if (destStats.size === sourceStats.size) {
          skipped++
          continue
        }
      }

      fs.copyFileSync(sourcePath, destPath)
      synced++
      log(`  Synced: ${filename} -> ${path.relative(VAULT_LIBRARY, destPath)}`)
    }
  }

  log(`Sync complete: ${synced} copied, ${skipped} up-to-date, ${missing} no PDF`)
  return { synced, skipped, missing }
}

// ─── File watcher ───────────────────────────────────────────────────────────

let debounceTimer = null
let syncing = false

function debouncedSync() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    if (syncing) return
    syncing = true
    try {
      await sync()
    } catch (err) {
      log(`Sync error: ${err.message}`)
    } finally {
      syncing = false
    }
  }, DEBOUNCE_MS)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('Zotero PDF Sync')
  log(`  Zotero API:     ${ZOTERO_API}`)
  log(`  Zotero storage: ${ZOTERO_STORAGE}`)
  log(`  Vault library:  ${VAULT_LIBRARY}`)

  // Verify Zotero storage exists
  if (!fs.existsSync(ZOTERO_STORAGE)) {
    console.error(`Error: Zotero storage not found at ${ZOTERO_STORAGE}`)
    process.exit(1)
  }

  // Verify Zotero API is reachable
  try {
    await httpGetJson(`${ZOTERO_API}/api/users/0/items?limit=1&format=json`)
    log('Zotero API connected')
  } catch (err) {
    console.error(`Error: Cannot connect to Zotero API at ${ZOTERO_API}`)
    console.error('Make sure Zotero is running with local API enabled.')
    process.exit(1)
  }

  // Initial sync
  await sync()

  if (ONCE) {
    log('Done (--once mode)')
    process.exit(0)
  }

  // Watch for changes
  log(`Watching ${ZOTERO_STORAGE} for changes (debounce: ${DEBOUNCE_MS}ms)...`)

  fs.watch(ZOTERO_STORAGE, { recursive: true }, () => {
    debouncedSync()
  })

  // Keep process alive
  process.on('SIGINT', () => {
    log('Shutting down...')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
