import { App, normalizePath } from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'

import { buildCitekeyFilenameMap } from './pdfNaming'
import { ZoteroClient } from './zoteroClient'

export class ZoteroSync {
  private client: ZoteroClient
  private app: App
  private settings: SmartComposerSettings
  private syncing = false

  constructor(app: App, settings: SmartComposerSettings, client: ZoteroClient) {
    this.app = app
    this.settings = settings
    this.client = client
  }

  updateSettings(settings: SmartComposerSettings) {
    this.settings = settings
    this.client.setBaseUrl(settings.zotero.apiBaseUrl)
  }

  private getLibraryVaultPath(): string {
    return this.settings.zotero.libraryVaultPath || 'Library'
  }

  /**
   * Report how many Zotero items already have a matching citekey PDF in the
   * vault. PDFs are placed and kept up to date externally (ZotMoov →
   * raw/pdfs/<citekey>.pdf), so this is a read-only presence check — it never
   * copies, writes, or deletes anything.
   */
  async sync(
    onProgress?: (message: string) => void,
  ): Promise<{ synced: number; total: number }> {
    if (this.syncing) {
      return { synced: 0, total: 0 }
    }
    this.syncing = true

    try {
      const libraryPath = this.getLibraryVaultPath()
      onProgress?.('Fetching items from Zotero...')
      const items = await this.client.fetchAllItems()
      await this.ensureFolder(libraryPath)

      const filenameMap = await buildCitekeyFilenameMap(items, (keys) =>
        this.client.fetchCitekeys(keys),
      )

      let synced = 0
      const total = items.length
      for (const item of items) {
        const filename = filenameMap.get(item.key)
        if (!filename) continue
        const destPath = normalizePath(`${libraryPath}/${filename}`)
        if (this.app.vault.getAbstractFileByPath(destPath)) synced++
      }

      onProgress?.(`Sync complete: ${synced}/${total} papers present`)
      return { synced, total }
    } finally {
      this.syncing = false
    }
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath)
    if (!(await this.app.vault.adapter.exists(normalized))) {
      await this.app.vault.createFolder(normalized)
    }
  }
}
