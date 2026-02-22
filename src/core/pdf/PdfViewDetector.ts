import { Workspace } from 'obsidian'

import { MentionableImage } from '../../types/mentionable'

import { PdfSelectionOverlay } from './PdfSelectionOverlay'

export class PdfViewDetector {
  private overlays: Map<HTMLElement, PdfSelectionOverlay> = new Map()
  private cleanupFns: (() => void)[] = []

  constructor(
    private workspace: Workspace,
    private onCapture: (image: MentionableImage) => void,
  ) {
    const layoutCb = () => this.scan()
    const leafCb = () => this.scan()

    this.workspace.on('layout-change', layoutCb)
    this.workspace.on('active-leaf-change', leafCb)

    this.cleanupFns.push(() => {
      this.workspace.off('layout-change', layoutCb)
      this.workspace.off('active-leaf-change', leafCb)
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
        const overlay = new PdfSelectionOverlay(container, this.onCapture)
        this.overlays.set(container, overlay)
      }
    }
  }
}
