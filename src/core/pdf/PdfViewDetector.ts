import { Workspace } from 'obsidian'

import { MentionableImage } from '../../types/mentionable'

import { PdfSelectionOverlay } from './PdfSelectionOverlay'

export class PdfViewDetector {
  private overlays: Map<HTMLElement, PdfSelectionOverlay> = new Map()
  private cleanupFns: (() => void)[] = []

  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

  constructor(
    private workspace: Workspace,
    private onCapture: (image: MentionableImage) => void,
    private onTextSelection: (text: string) => void,
    private onMathConversion: (imageDataUrl: string) => Promise<string>,
  ) {
    const layoutCb = () => this.scan()
    const leafCb = () => this.scan()

    this.workspace.on('layout-change', layoutCb)
    this.workspace.on('active-leaf-change', leafCb)

    // Listen in capture phase so we intercept before Obsidian's "Save" handler
    document.addEventListener('keydown', this.boundKeyDown, true)

    this.cleanupFns.push(() => {
      this.workspace.off('layout-change', layoutCb)
      this.workspace.off('active-leaf-change', leafCb)
      document.removeEventListener('keydown', this.boundKeyDown, true)
    })

    // Initial scan
    this.scan()
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    this.overlays.forEach((overlay) => overlay.destroy())
    this.overlays.clear()
  }

  /** Returns true if the active leaf is a PDF with an overlay. */
  hasActivePdfOverlay(): boolean {
    return this.getActiveOverlay() !== null
  }

  /** Toggle screenshot/text mode on the active PDF overlay. */
  toggleActiveMode() {
    this.getActiveOverlay()?.toggleMode()
  }

  private onKeyDown(e: KeyboardEvent) {
    // Cmd+S (Mac) or Ctrl+S (Windows/Linux), no shift, no alt
    if (e.key === 's' && e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const overlay = this.getActiveOverlay()
      if (overlay) {
        e.preventDefault()
        e.stopPropagation()
        overlay.toggleMode()
      }
    }
  }

  private getActiveOverlay(): PdfSelectionOverlay | null {
    const activeLeaf = this.workspace.activeLeaf
    if (!activeLeaf || activeLeaf.view.getViewType() !== 'pdf') return null

    const container =
      activeLeaf.view.containerEl.querySelector('.pdf-container')
    if (!(container instanceof HTMLElement)) return null

    return this.overlays.get(container) ?? null
  }

  private scan() {
    // Find all PDF view containers currently in the workspace
    const pdfContainers = new Set<HTMLElement>()
    this.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === 'pdf') {
        // The leaf's content element contains the PDF viewer
        const container =
          leaf.view.containerEl.querySelector('.pdf-container')
        if (container instanceof HTMLElement) {
          pdfContainers.add(container)
        }
      }
    })

    // Remove overlays for containers that no longer exist
    for (const [container, overlay] of this.overlays) {
      if (!pdfContainers.has(container)) {
        overlay.destroy()
        this.overlays.delete(container)
      }
    }

    // Add overlays for new containers
    for (const container of pdfContainers) {
      if (!this.overlays.has(container)) {
        const overlay = new PdfSelectionOverlay(
          container,
          this.onCapture,
          this.onTextSelection,
          this.onMathConversion,
        )
        this.overlays.set(container, overlay)
      }
    }
  }
}
