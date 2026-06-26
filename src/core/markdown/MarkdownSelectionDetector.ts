import { App, FileView } from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'

/**
 * Listens for native text selection (mouseup) within markdown views that
 * correspond to pre-extracted paper markdown files
 * (markdownVaultPath/<citekey>/<citekey>.md) and fires onTextSelection with
 * the selected text and the citekey as the sourceName.
 *
 * Mirrors the PDF text-select flow in PdfSelectionOverlay — automatic on
 * mouseup, no mode toggle required since markdown has no competing screenshot
 * mode. Only active when pdfNamingScheme is 'citekey' and markdownVaultPath
 * is configured.
 */
export class MarkdownSelectionDetector {
  private handlers: Map<HTMLElement, () => void> = new Map()
  private cleanupFns: (() => void)[] = []

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
    this.scan()
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    for (const [container, handler] of this.handlers) {
      container.removeEventListener('mouseup', handler)
    }
    this.handlers.clear()
  }

  private scan() {
    const liveContainers = new Set<HTMLElement>()

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (!(view instanceof FileView) || view.getViewType() !== 'markdown') return
      const container = view.containerEl
      liveContainers.add(container)
      if (this.handlers.has(container)) return

      // Attach once per container; gate on matching file at event time so
      // navigating away to a non-paper note silently skips without a leak.
      const handler = () => this.handleMouseUp(view)
      container.addEventListener('mouseup', handler)
      this.handlers.set(container, handler)
    })

    // Remove listeners for containers no longer in the workspace
    for (const [container, handler] of this.handlers) {
      if (!liveContainers.has(container)) {
        container.removeEventListener('mouseup', handler)
        this.handlers.delete(container)
      }
    }
  }

  private handleMouseUp(view: FileView) {
    const settings = this.getSettings()
    const mdFolder = settings.zotero.markdownVaultPath
    if (settings.zotero.pdfNamingScheme !== 'citekey' || !mdFolder) return

    const file = view.file
    if (!file || file.extension !== 'md') return
    if (file.parent?.path !== `${mdFolder}/${file.basename}`) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const anchorNode = selection.anchorNode
    if (!anchorNode || !view.containerEl.contains(anchorNode)) return

    const text = selection.toString().trim()
    if (!text) return

    this.onTextSelection(text, file.basename)
  }
}
