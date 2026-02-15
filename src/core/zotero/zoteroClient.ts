import http from 'http'

import { ZOTERO_DEFAULT_API_BASE_URL } from '../../constants'
import {
  CollectionTreeNode,
  PaperMetadata,
  ZoteroAttachment,
  ZoteroCollection,
  ZoteroCreator,
  ZoteroItem,
} from '../../types/zotero.types'

/** Make an HTTP GET request using Node.js http module (no CORS restrictions). */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
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

async function httpGetJson(url: string): Promise<{ status: number; json: unknown }> {
  const res = await httpGet(url)
  return { status: res.status, json: JSON.parse(res.body) }
}

export function getAuthorLastNames(creators: ZoteroCreator[]): string[] {
  return creators
    .filter((c) => c.creatorType === 'author')
    .map((c) => c.lastName ?? c.name ?? '')
    .filter(Boolean)
}

export function extractYear(dateStr: string): string {
  if (!dateStr) return ''
  const match = dateStr.match(/\d{4}/)
  return match ? match[0] : ''
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

export function buildCollectionTree(
  collections: ZoteroCollection[],
  rootPath: string,
): CollectionTreeNode[] {
  const byKey = new Map<string, ZoteroCollection>()
  for (const c of collections) {
    byKey.set(c.key, c)
  }

  const childrenMap = new Map<string, ZoteroCollection[]>()
  const roots: ZoteroCollection[] = []

  for (const c of collections) {
    if (c.data.parentCollection === false) {
      roots.push(c)
    } else {
      const parentKey = c.data.parentCollection
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, [])
      }
      childrenMap.get(parentKey)!.push(c)
    }
  }

  function buildNode(
    col: ZoteroCollection,
    parentPath: string,
  ): CollectionTreeNode {
    const folderName = sanitizeFolderName(col.data.name)
    const path = `${parentPath}/${folderName}`
    const children = (childrenMap.get(col.key) ?? [])
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .map((child) => buildNode(child, path))

    return {
      key: col.key,
      name: col.data.name,
      children,
      itemCount: col.meta.numItems,
      path,
    }
  }

  return roots
    .sort((a, b) => a.data.name.localeCompare(b.data.name))
    .map((r) => buildNode(r, rootPath))
}

export function flattenCollectionTree(
  nodes: CollectionTreeNode[],
): CollectionTreeNode[] {
  const result: CollectionTreeNode[] = []
  function walk(node: CollectionTreeNode) {
    result.push(node)
    for (const child of node.children) {
      walk(child)
    }
  }
  for (const n of nodes) {
    walk(n)
  }
  return result
}

export class ZoteroClient {
  private baseUrl: string

  constructor(baseUrl: string = ZOTERO_DEFAULT_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await httpGetJson(
        `${this.baseUrl}/api/users/0/items?limit=1`,
      )
      return response.status === 200
    } catch {
      return false
    }
  }

  async fetchCollections(): Promise<ZoteroCollection[]> {
    const response = await httpGetJson(
      `${this.baseUrl}/api/users/0/collections?format=json`,
    )
    if (response.status !== 200) {
      throw new Error(`Zotero API error: ${response.status}`)
    }
    return response.json as ZoteroCollection[]
  }

  async fetchItems(query?: string): Promise<ZoteroItem[]> {
    const params = new URLSearchParams({
      format: 'json',
      limit: '100',
      itemType: '-attachment || -note',
    })
    if (query) {
      params.set('q', query)
      params.set('qmode', 'titleCreatorYear')
    }

    const response = await httpGetJson(
      `${this.baseUrl}/api/users/0/items?${params.toString()}`,
    )
    if (response.status !== 200) {
      throw new Error(`Zotero API error: ${response.status}`)
    }
    return response.json as ZoteroItem[]
  }

  async fetchAllItems(): Promise<ZoteroItem[]> {
    const allItems: ZoteroItem[] = []
    let start = 0
    const limit = 100

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        format: 'json',
        limit: String(limit),
        start: String(start),
        itemType: '-attachment || -note',
      })

      const response = await httpGetJson(
        `${this.baseUrl}/api/users/0/items?${params.toString()}`,
      )
      if (response.status !== 200) {
        throw new Error(`Zotero API error: ${response.status}`)
      }

      const items = response.json as ZoteroItem[]
      allItems.push(...items)

      if (items.length < limit) break
      start += limit
    }

    return allItems
  }

  async fetchCollectionItems(collectionKey: string): Promise<ZoteroItem[]> {
    const allItems: ZoteroItem[] = []
    let start = 0
    const limit = 100

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        format: 'json',
        limit: String(limit),
        start: String(start),
        itemType: '-attachment || -note',
      })

      const response = await httpGetJson(
        `${this.baseUrl}/api/users/0/collections/${collectionKey}/items?${params.toString()}`,
      )
      if (response.status !== 200) {
        throw new Error(`Zotero API error: ${response.status}`)
      }

      const items = response.json as ZoteroItem[]
      allItems.push(...items)

      if (items.length < limit) break
      start += limit
    }

    return allItems
  }

  async fetchItemsWithAttachments(collectionKey?: string): Promise<{
    items: ZoteroItem[]
    attachmentMap: Map<string, ZoteroAttachment>
  }> {
    const allRaw: Record<string, unknown>[] = []
    let start = 0
    const limit = 100

    const baseUrl = collectionKey
      ? `${this.baseUrl}/api/users/0/collections/${collectionKey}/items`
      : `${this.baseUrl}/api/users/0/items`

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        format: 'json',
        limit: String(limit),
        start: String(start),
      })

      const response = await httpGetJson(
        `${baseUrl}?${params.toString()}`,
      )
      if (response.status !== 200) {
        throw new Error(`Zotero API error: ${response.status}`)
      }

      const batch = response.json as Record<string, unknown>[]
      allRaw.push(...batch)

      if (batch.length < limit) break
      start += limit
    }

    const items: ZoteroItem[] = []
    const attachmentMap = new Map<string, ZoteroAttachment>()

    for (const raw of allRaw) {
      const data = raw.data as Record<string, unknown>
      if (data.itemType === 'attachment') {
        if (
          data.contentType === 'application/pdf' &&
          data.filename &&
          data.parentItem
        ) {
          attachmentMap.set(
            data.parentItem as string,
            raw as unknown as ZoteroAttachment,
          )
        }
      } else if (data.itemType !== 'note') {
        items.push(raw as unknown as ZoteroItem)
      }
    }

    return { items, attachmentMap }
  }

  async fetchAttachments(parentKey: string): Promise<ZoteroAttachment[]> {
    const params = new URLSearchParams({
      format: 'json',
      itemType: 'attachment',
    })
    const response = await httpGetJson(
      `${this.baseUrl}/api/users/0/items/${parentKey}/children?${params.toString()}`,
    )
    if (response.status !== 200) {
      throw new Error(`Zotero API error: ${response.status}`)
    }
    return response.json as ZoteroAttachment[]
  }

  async getItemBibtex(itemKey: string): Promise<string> {
    const response = await httpGet(
      `${this.baseUrl}/api/users/0/items/${itemKey}?format=bibtex`,
    )
    if (response.status !== 200) {
      throw new Error(`Zotero API error: ${response.status}`)
    }
    return response.body
  }

  buildPaperMetadata(
    item: ZoteroItem,
    pdfPath: string,
  ): PaperMetadata {
    return {
      zoteroKey: item.key,
      itemType: item.data.itemType,
      title: item.data.title,
      authors: getAuthorLastNames(item.data.creators),
      year: extractYear(item.data.date),
      abstract: item.data.abstractNote ?? '',
      pdfPath,
      hasCitation: true,
      collectionKeys: item.data.collections ?? [],
    }
  }
}
