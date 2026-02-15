import fs from 'fs'
import path from 'path'

import { App, Notice, Platform, TFile, TFolder, normalizePath } from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'
import { CollectionTreeNode, ZoteroItem } from '../../types/zotero.types'

import { buildPdfFilename } from './pdfNaming'
import {
  ZoteroClient,
  buildCollectionTree,
  extractYear,
  flattenCollectionTree,
  getAuthorLastNames,
} from './zoteroClient'

function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
    return path.join(home, filepath.slice(1))
  }
  return filepath
}

export class ZoteroSync {
  private client: ZoteroClient
  private app: App
  private settings: SmartComposerSettings
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private syncing = false

  constructor(app: App, settings: SmartComposerSettings, client: ZoteroClient) {
    this.app = app
    this.settings = settings
    this.client = client
  }

  updateSettings(settings: SmartComposerSettings) {
    this.settings = settings
    this.client.setBaseUrl(settings.zotero.apiBaseUrl)
    this.restartWatcher()
  }

  private getZoteroStoragePath(): string {
    const configured = this.settings.zotero.zoteroStoragePath
    if (configured) {
      return resolveHome(configured)
    }
    // Default Zotero storage path
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
    return path.join(home, 'Zotero', 'storage')
  }

  private getLibraryVaultPath(): string {
    return this.settings.zotero.libraryVaultPath || 'Library'
  }

  async sync(
    onProgress?: (message: string) => void,
  ): Promise<{ synced: number; total: number }> {
    if (this.syncing) {
      return { synced: 0, total: 0 }
    }
    this.syncing = true

    try {
      onProgress?.('Fetching collections from Zotero...')
      const collections = await this.client.fetchCollections()
      const libraryPath = this.getLibraryVaultPath()
      const tree = buildCollectionTree(collections, libraryPath)
      const flatNodes = flattenCollectionTree(tree)

      // Build collectionKey → vaultPath map
      const collectionPathMap = new Map<string, string>()
      for (const node of flatNodes) {
        collectionPathMap.set(node.key, node.path)
      }

      onProgress?.('Fetching items from Zotero...')
      const items = await this.client.fetchAllItems()

      // Ensure base library folder exists
      await this.ensureFolder(libraryPath)

      // Ensure all collection folders exist
      for (const node of flatNodes) {
        await this.ensureFolder(node.path)
      }

      // Ensure _Unsorted folder
      await this.ensureFolder(`${libraryPath}/_Unsorted`)

      const storagePath = this.getZoteroStoragePath()
      let synced = 0
      const total = items.length

      // Pre-compute target filenames with collision handling
      const filenameMap = this.buildFilenameMap(items)

      // Track all expected PDF paths so we can remove orphans afterwards
      const expectedPaths = new Set<string>()

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        onProgress?.(
          `Syncing ${i + 1}/${total}: ${item.data.title.slice(0, 50)}...`,
        )

        const newFilename = filenameMap.get(item.key)
        if (!newFilename) continue

        try {
          const paths = await this.syncItem(item, storagePath, collectionPathMap, libraryPath, newFilename)
          for (const p of paths) {
            expectedPaths.add(p)
          }
          synced++
        } catch {
          // Skip items that fail to sync
        }
      }

      // Remove vault PDFs that are no longer in Zotero
      onProgress?.('Cleaning up removed papers...')
      const removed = await this.removeOrphanedFiles(libraryPath, expectedPaths)
      if (removed > 0) {
        onProgress?.(`Removed ${removed} orphaned PDF(s)`)
      }

      onProgress?.(`Sync complete: ${synced}/${total} papers synced`)
      return { synced, total }
    } finally {
      this.syncing = false
    }
  }

  /** Pre-compute unique filenames for all items, handling collisions. */
  private buildFilenameMap(items: ZoteroItem[]): Map<string, string> {
    const result = new Map<string, string>()
    const counts = new Map<string, number>()

    for (const item of items) {
      const authors = getAuthorLastNames(item.data.creators)
      const year = extractYear(item.data.date)
      const baseName = buildPdfFilename(authors, year, item.data.title)

      const prev = counts.get(baseName) ?? 0
      counts.set(baseName, prev + 1)

      if (prev === 0) {
        result.set(item.key, baseName)
      } else {
        // Append collision suffix: "Smith et al. 2024 (2).pdf"
        const ext = '.pdf'
        const stem = baseName.slice(0, -ext.length)
        result.set(item.key, `${stem} (${prev + 1})${ext}`)
      }
    }

    return result
  }

  /** Sync a single item's PDF to the vault. Returns the list of destination paths. */
  private async syncItem(
    item: ZoteroItem,
    storagePath: string,
    collectionPathMap: Map<string, string>,
    libraryPath: string,
    newFilename: string,
  ): Promise<string[]> {
    // Find PDF attachment
    const attachments = await this.client.fetchAttachments(item.key)
    const pdfAttachment = attachments.find(
      (a) =>
        a.data.contentType === 'application/pdf' && a.data.filename,
    )

    if (!pdfAttachment || !pdfAttachment.data.filename) {
      return []
    }

    // Resolve source file path
    const sourcePath = path.join(
      storagePath,
      pdfAttachment.data.key,
      pdfAttachment.data.filename,
    )

    if (!fs.existsSync(sourcePath)) {
      return []
    }

    const sourceStats = fs.statSync(sourcePath)
    const originalFilename = pdfAttachment.data.filename

    // Determine destination folders based on collections
    const collectionKeys = item.data.collections ?? []
    const destFolders: string[] = []

    if (collectionKeys.length === 0) {
      destFolders.push(`${libraryPath}/_Unsorted`)
    } else {
      for (const key of collectionKeys) {
        const folderPath = collectionPathMap.get(key)
        if (folderPath) {
          destFolders.push(folderPath)
        }
      }
      // If none of the collection keys mapped (orphaned), use _Unsorted
      if (destFolders.length === 0) {
        destFolders.push(`${libraryPath}/_Unsorted`)
      }
    }

    // Copy to each destination using the new friendly filename
    const destPaths: string[] = []
    for (const folder of destFolders) {
      const destPath = normalizePath(`${folder}/${newFilename}`)
      destPaths.push(destPath)

      // Check if already exists with same size (skip if so)
      const existingFile = this.app.vault.getAbstractFileByPath(destPath)
      if (existingFile) {
        const existingStat = await this.app.vault.adapter.stat(destPath)
        if (existingStat && existingStat.size === sourceStats.size) {
          continue // Already synced
        }
      }

      // Migration: if old-named file exists, rename it instead of re-copying
      if (!existingFile) {
        const oldPath = normalizePath(`${folder}/${originalFilename}`)
        const oldFile = this.app.vault.getAbstractFileByPath(oldPath)
        if (oldFile) {
          await this.app.vault.adapter.rename(oldPath, destPath)
          continue
        }
      }

      // Read source and write to vault
      const data = fs.readFileSync(sourcePath)
      await this.app.vault.adapter.writeBinary(
        destPath,
        data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer,
      )
    }

    return destPaths
  }

  /** Remove PDFs in the Library vault folder that are not in the expected set. */
  private async removeOrphanedFiles(
    libraryPath: string,
    expectedPaths: Set<string>,
  ): Promise<number> {
    const folder = this.app.vault.getAbstractFileByPath(libraryPath)
    if (!folder || !(folder instanceof TFolder)) return 0

    const orphans: TFile[] = []
    const collectPdfs = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === 'pdf') {
          if (!expectedPaths.has(child.path)) {
            orphans.push(child)
          }
        } else if (child instanceof TFolder) {
          collectPdfs(child)
        }
      }
    }
    collectPdfs(folder)

    for (const orphan of orphans) {
      await this.app.vault.delete(orphan)
    }

    return orphans.length
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath)
    if (!(await this.app.vault.adapter.exists(normalized))) {
      await this.app.vault.createFolder(normalized)
    }
  }

  async getCollectionTree(): Promise<CollectionTreeNode[]> {
    const collections = await this.client.fetchCollections()
    return buildCollectionTree(collections, this.getLibraryVaultPath())
  }

  startWatcher(): void {
    if (!Platform.isDesktop) return

    const storagePath = this.getZoteroStoragePath()
    if (!fs.existsSync(storagePath)) {
      console.warn(
        `Zotero storage path not found: ${storagePath}. File watcher not started.`,
      )
      return
    }

    try {
      this.watcher = fs.watch(storagePath, { recursive: true }, () => {
        this.debouncedSync()
      })
    } catch (e) {
      console.warn('Failed to start Zotero file watcher:', e)
    }

    // Poll every 30 seconds to catch deletions that fs.watch may miss
    this.pollInterval = setInterval(() => {
      void this.sync((msg) => {
        console.log(`[Zotero Sync] ${msg}`)
      })
    }, 30_000)
  }

  private restartWatcher(): void {
    this.stopWatcher()
    this.startWatcher()
  }

  stopWatcher(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private debouncedSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      void this.sync((msg) => {
        console.log(`[Zotero Sync] ${msg}`)
      })
    }, 5000)
  }

  cleanup(): void {
    this.stopWatcher()
  }
}
