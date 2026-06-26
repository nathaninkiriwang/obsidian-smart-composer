import { App, FileView } from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'

type ViewState = {
  enabled: boolean
  badge: HTMLElement | null
}

/**
 * Listens for native text selection (mouseup) within paper markdown views
 * (markdownVaultPath/<citekey>/<citekey>.md) and fires onTextSelection.
 *
 * Selection-to-chat is OFF by default. Press Ctrl+S while a matching
 * markdown file is active to toggle it on/off — mirroring the PDF overlay's
 * Ctrl+S mode toggle. A mode badge is shown when active.
 *
 * Only operates when pdfNamingScheme is 'citekey' and markdownVaultPath is set.
 */
export class MarkdownSelectionDetector {
  private handlers: Map<HTMLElement, () => void> = new Map()
  private viewStates: Map<HTMLElement, ViewState> = new Map()
  private cleanupFns: (() => void)[] = []

  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

  constructor(
    private app: App,
    private getSettings: () => SmartComposerSettings,
    private onTextSelection: (text: string, sourceName: string) => void,
  ) {
    const scan = () => this.scan()
    this.app.workspace.on('layout-change', scan)
    this.app.workspace.on('active-leaf-change', scan)
    this.app.workspace.on('file-open', scan)
    this.cleanupFns.push(() => {
      this.app.workspace.off('layout-change', scan)
      this.app.workspace.off('active-leaf-change', scan)
      this.app.workspace.off('file-open', scan)
    })

    // Capture phase so we can intercept Ctrl+S before Obsidian's save handler
    document.addEventListener('keydown', this.boundKeyDown, true)
    this.cleanupFns.push(() =>
      document.removeEventListener('keydown', this.boundKeyDown, true),
    )

    this.scan()
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    for (const [container, handler] of this.handlers) {
      container.removeEventListener('mouseup', handler)
    }
    this.handlers.clear()
    for (const [, state] of this.viewStates) {
      state.badge?.remove()
    }
    this.viewStates.clear()
  }

  private scan() {
    const liveContainers = new Set<HTMLElement>()

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (!(view instanceof FileView) || view.getViewType() !== 'markdown') return
      const container = view.containerEl
      liveContainers.add(container)

      if (!this.handlers.has(container)) {
        const handler = () => this.handleMouseUp(view)
        container.addEventListener('mouseup', handler)
        this.handlers.set(container, handler)
        this.viewStates.set(container, { enabled: false, badge: null })
      }
    })

    // Remove listeners for containers no longer in the workspace
    for (const [container, handler] of this.handlers) {
      if (!liveContainers.has(container)) {
        container.removeEventListener('mouseup', handler)
        this.handlers.delete(container)
        const state = this.viewStates.get(container)
        state?.badge?.remove()
        this.viewStates.delete(container)
      }
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    // Ctrl+S (no Cmd, no Shift, no Alt) — same binding as PDF mode toggle
    if (e.key !== 's' || !e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return

    const activeLeaf = this.app.workspace.activeLeaf
    if (!activeLeaf) return

    const view = activeLeaf.view
    if (!(view instanceof FileView) || view.getViewType() !== 'markdown') return

    const settings = this.getSettings()
    const mdFolder = settings.zotero.markdownVaultPath
    if (settings.zotero.pdfNamingScheme !== 'citekey' || !mdFolder) return

    const file = view.file
    if (!file || file.parent?.path !== `${mdFolder}/${file.basename}`) return

    // This is a matching citekey markdown file — intercept Ctrl+S
    e.preventDefault()
    e.stopPropagation()

    const container = view.containerEl
    this.toggle(container, view.containerEl)
  }

  private toggle(container: HTMLElement, contentEl: HTMLElement) {
    const state = this.viewStates.get(container)
    if (!state) return
    state.enabled = !state.enabled
    this.updateBadge(state, contentEl)
  }

  private updateBadge(state: ViewState, contentEl: HTMLElement) {
    if (!state.badge) {
      state.badge = document.createElement('div')
      state.badge.className = 'smtcmp-pdf-mode-badge'
      contentEl.appendChild(state.badge)
    }
    if (state.enabled) {
      state.badge.textContent = 'Text select mode (Ctrl+S to disable)'
    } else {
      state.badge.textContent = 'Text select off (Ctrl+S to enable)'
      // Hide after a moment so user can see confirmation then it fades
      const badge = state.badge
      setTimeout(() => {
        if (badge.parentElement) badge.remove()
      }, 1500)
      state.badge = null
    }
  }

  private handleMouseUp(view: FileView) {
    const settings = this.getSettings()
    const mdFolder = settings.zotero.markdownVaultPath
    if (settings.zotero.pdfNamingScheme !== 'citekey' || !mdFolder) return

    const file = view.file
    if (!file || file.extension !== 'md') return
    if (file.parent?.path !== `${mdFolder}/${file.basename}`) return

    const state = this.viewStates.get(view.containerEl)
    if (!state?.enabled) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const anchorNode = selection.anchorNode
    if (!anchorNode || !view.containerEl.contains(anchorNode)) return

    const text = selection.toString().trim()
    if (!text) return

    this.onTextSelection(text, file.basename)
  }
}
