import { Editor, MarkdownView, Notice, Platform, Plugin } from 'obsidian'

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { InstallerUpdateRequiredModal } from './components/modals/InstallerUpdateRequiredModal'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE, LIBRARY_VIEW_TYPE } from './constants'
import { getChatModelClient } from './core/llm/manager'
import { McpManager } from './core/mcp/mcpManager'
import { PaperSelectionStore } from './core/paper-selection/store'
import { PdfViewDetector } from './core/pdf/PdfViewDetector'
import { RAGEngine } from './core/rag/ragEngine'
import { ZoteroClient } from './core/zotero/zoteroClient'
import { ZoteroSync } from './core/zotero/zoteroSync'
import { DatabaseManager } from './database/DatabaseManager'
import { PGLiteAbortedException } from './database/exception'
import { migrateToJsonDatabase } from './database/json/migrateToJsonDatabase'
import { LibraryView } from './LibraryView'
import {
  SmartComposerSettings,
  smartComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseSmartComposerSettings } from './settings/schema/settings'
import { SmartComposerSettingTab } from './settings/SettingTab'
import { MentionableImage } from './types/mentionable'
import { getMentionableBlockData } from './utils/obsidian'

export default class SmartComposerPlugin extends Plugin {
  settings: SmartComposerSettings
  initialChatProps?: ChatProps // TODO: change this to use view state like ApplyView
  settingsChangeListeners: ((newSettings: SmartComposerSettings) => void)[] = []
  mcpManager: McpManager | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null
  zoteroClient: ZoteroClient | null = null
  zoteroSync: ZoteroSync | null = null
  paperSelection: PaperSelectionStore = new PaperSelectionStore()
  private pdfViewDetector: PdfViewDetector | null = null
  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null
  private timeoutIds: ReturnType<typeof setTimeout>[] = [] // Use ReturnType instead of number

  async onload() {
    await this.loadSettings()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))
    this.registerView(LIBRARY_VIEW_TYPE, (leaf) => new LibraryView(leaf, this))

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('wand-sparkles', 'Open smart composer', () =>
      this.openChatView(),
    )
    this.addRibbonIcon('library', 'Open library', () =>
      this.activateLibraryView(),
    )

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-new-chat',
      name: 'Open chat',
      callback: () => this.openChatView(true),
    })

    this.addCommand({
      id: 'open-library',
      name: 'Open library',
      callback: () => this.activateLibraryView(),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: 'Add selection to chat',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addSelectionToChat(editor, view)
      },
    })

    this.addCommand({
      id: 'rebuild-vault-index',
      name: 'Rebuild entire vault index',
      callback: async () => {
        const notice = new Notice('Rebuilding vault index...', 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: true },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  `Indexing chunks: ${completedChunks} / ${totalChunks}${
                    queryProgress.indexProgress.waitingForRateLimit
                      ? '\n(waiting for rate limit to reset)'
                      : ''
                  }`,
                )
              }
            },
          )
          notice.setMessage('Rebuilding vault index complete')
        } catch (error) {
          console.error(error)
          notice.setMessage('Rebuilding vault index failed')
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    this.addCommand({
      id: 'update-vault-index',
      name: 'Update index for modified files',
      callback: async () => {
        const notice = new Notice('Updating vault index...', 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: false },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  `Indexing chunks: ${completedChunks} / ${totalChunks}${
                    queryProgress.indexProgress.waitingForRateLimit
                      ? '\n(waiting for rate limit to reset)'
                      : ''
                  }`,
                )
              }
            },
          )
          notice.setMessage('Vault index updated')
        } catch (error) {
          console.error(error)
          notice.setMessage('Vault index update failed')
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    this.addCommand({
      id: 'sync-zotero-library',
      name: 'Sync Zotero library',
      callback: async () => {
        if (!this.zoteroSync) return
        const notice = new Notice('Syncing Zotero library...', 0)
        try {
          const result = await this.zoteroSync.sync((msg) => {
            notice.setMessage(msg)
          })
          notice.setMessage(
            `Sync complete: ${result.synced}/${result.total} papers synced`,
          )
        } catch (error) {
          console.error('Zotero sync failed:', error)
          notice.setMessage('Zotero sync failed')
        } finally {
          this.registerTimeout(() => notice.hide(), 3000)
        }
      },
    })

    // Initialize Zotero sync
    if (Platform.isDesktop) {
      this.zoteroClient = new ZoteroClient(this.settings.zotero.apiBaseUrl)
      this.zoteroSync = new ZoteroSync(
        this.app,
        this.settings,
        this.zoteroClient,
      )
      this.zoteroSync.startWatcher()

      this.addSettingsChangeListener((newSettings) => {
        this.zoteroSync?.updateSettings(newSettings)
      })
    }

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

    // Initialize PDF region capture overlay
    this.app.workspace.onLayoutReady(() => {
      this.pdfViewDetector = new PdfViewDetector(
        this.app.workspace,
        (image) => this.captureRegionToChat(image),
        (text) => this.addPdfTextToChat(text),
        (imageDataUrl) => this.convertMathImage(imageDataUrl),
      )
    })

    void this.migrateToJsonStorage()
  }

  onunload() {
    // clear all timers
    this.timeoutIds.forEach((id) => clearTimeout(id))
    this.timeoutIds = []

    // RagEngine cleanup
    this.ragEngine?.cleanup()
    this.ragEngine = null

    // Promise cleanup
    this.dbManagerInitPromise = null
    this.ragEngineInitPromise = null

    // DatabaseManager cleanup
    this.dbManager?.cleanup()
    this.dbManager = null

    // McpManager cleanup
    this.mcpManager?.cleanup()
    this.mcpManager = null

    // PDF overlay cleanup
    this.pdfViewDetector?.destroy()
    this.pdfViewDetector = null

    // Zotero cleanup
    this.zoteroSync?.cleanup()
    this.zoteroSync = null
    this.zoteroClient = null
  }

  async loadSettings() {
    this.settings = parseSmartComposerSettings(await this.loadData())
    await this.saveData(this.settings) // Save updated settings
  }

  async setSettings(newSettings: SmartComposerSettings) {
    const validationResult = smartComposerSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(`Invalid settings:
${validationResult.error.issues.map((v) => v.message).join('\n')}`)
      return
    }

    this.settings = newSettings
    await this.saveData(newSettings)
    this.ragEngine?.setSettings(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: SmartComposerSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    // chatProps is consumed in ChatView.tsx
    this.initialChatProps = chatProps

    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async activateLibraryView() {
    const existing = this.app.workspace.getLeavesOfType(LIBRARY_VIEW_TYPE)[0]
    if (existing) {
      this.app.workspace.revealLeaf(existing)
      return
    }

    const leaf = this.app.workspace.getLeftLeaf(false)
    await leaf?.setViewState({
      type: LIBRARY_VIEW_TYPE,
      active: true,
    })
    if (leaf) {
      this.app.workspace.revealLeaf(leaf)
    }
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    // bring leaf to foreground (uncollapse sidebar if it's collapsed)
    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }

  async captureRegionToChat(image: MentionableImage) {
    // Ensure the chat view is open
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView()
    }

    // Wait a tick for the view to mount
    await new Promise((resolve) => setTimeout(resolve, 50))

    const chatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (chatLeaves.length > 0 && chatLeaves[0].view instanceof ChatView) {
      const chatView = chatLeaves[0].view
      chatView.addImageToChat(image)
      this.app.workspace.revealLeaf(chatLeaves[0])
      chatView.focusMessage()
    }
  }

  async convertMathImage(imageDataUrl: string): Promise<string> {
    const modelId =
      this.settings.zotero.pdfExtractionModelId || this.settings.chatModelId
    const { providerClient, model } = getChatModelClient({
      modelId,
      settings: this.settings,
      setSettings: (newSettings) => this.setSettings(newSettings),
    })

    const response = await providerClient.generateResponse(model, {
      model: model.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a specialist at reading images of mathematical equations and scientific text from PDF documents. Convert the image content to text, using LaTeX notation (wrapped in $ or $$) for any mathematical expressions. Output ONLY the converted text, nothing else.',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            {
              type: 'text',
              text: 'Convert this PDF selection to text with LaTeX math notation.',
            },
          ],
        },
      ],
    })

    return response.choices[0]?.message?.content ?? ''
  }

  async addPdfTextToChat(text: string) {
    // Ensure the chat view is open
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView()
    }

    // Wait a tick for the view to mount
    await new Promise((resolve) => setTimeout(resolve, 50))

    const chatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (chatLeaves.length > 0 && chatLeaves[0].view instanceof ChatView) {
      const chatView = chatLeaves[0].view
      chatView.addPdfTextToChat(text)
      this.app.workspace.revealLeaf(chatLeaves[0])
      chatView.focusMessage()
    }
  }

  async getDbManager(): Promise<DatabaseManager> {
    if (this.dbManager) {
      return this.dbManager
    }

    if (!this.dbManagerInitPromise) {
      this.dbManagerInitPromise = (async () => {
        try {
          this.dbManager = await DatabaseManager.create(this.app)
          return this.dbManager
        } catch (error) {
          this.dbManagerInitPromise = null
          if (error instanceof PGLiteAbortedException) {
            new InstallerUpdateRequiredModal(this.app).open()
          }
          throw error
        }
      })()
    }

    // if initialization is running, wait for it to complete instead of creating a new initialization promise
    return this.dbManagerInitPromise
  }

  async getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) {
      return this.ragEngine
    }

    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = (async () => {
        try {
          const dbManager = await this.getDbManager()
          this.ragEngine = new RAGEngine(
            this.app,
            this.settings,
            dbManager.getVectorManager(),
          )
          return this.ragEngine
        } catch (error) {
          this.ragEngineInitPromise = null
          throw error
        }
      })()
    }

    return this.ragEngineInitPromise
  }

  async getMcpManager(): Promise<McpManager> {
    if (this.mcpManager) {
      return this.mcpManager
    }

    try {
      this.mcpManager = new McpManager({
        settings: this.settings,
        registerSettingsListener: (
          listener: (settings: SmartComposerSettings) => void,
        ) => this.addSettingsChangeListener(listener),
      })
      await this.mcpManager.initialize()
      return this.mcpManager
    } catch (error) {
      this.mcpManager = null
      throw error
    }
  }

  private registerTimeout(callback: () => void, timeout: number): void {
    const timeoutId = setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }

  private async migrateToJsonStorage() {
    try {
      const dbManager = await this.getDbManager()
      await migrateToJsonDatabase(this.app, dbManager, async () => {
        await this.reloadChatView()
        console.log('Migration to JSON storage completed successfully')
      })
    } catch (error) {
      console.error('Failed to migrate to JSON storage:', error)
      new Notice(
        'Failed to migrate to JSON storage. Please check the console for details.',
      )
    }
  }

  private async reloadChatView() {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      return
    }
    new Notice('Reloading "smart-composer" due to migration', 1000)
    leaves[0].detach()
    await this.activateChatView()
  }
}
