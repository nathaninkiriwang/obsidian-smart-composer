import { FileView, TFile, Workspace, WorkspaceLeaf } from 'obsidian'

import { MentionableImage } from '../../types/mentionable'

import { PdfHighlighter } from './PdfHighlighter'
import { PdfMode, nextPdfMode } from './PdfMode'
import { PdfModeToolbar } from './PdfModeToolbar'
import { PdfSelectionOverlay } from './PdfSelectionOverlay'

export type PdfDetectorCallbacks = {
  onCapture: (image: MentionableImage) => void
  onTextSelection: (text: string) => void
  onMathConversion: (imageDataUrl: string) => Promise<string>
}

type PdfViewEntry = {
  overlay: PdfSelectionOverlay
  toolbar: PdfModeToolbar
}

/**
 * Watches PDF views and attaches, to each, a {@link PdfSelectionOverlay} (the
 * interaction layer) plus a {@link PdfModeToolbar} (the segmented mode control
 * and annotation-file toggle). Mode state lives on the overlay; the toolbar is
 * kept in sync via the overlay's onModeChange callback. Highlight/delete/toggle
 * actions go through the {@link PdfHighlighter} service. PDF views only —
 * markdown views are untouched.
 */
export class PdfViewDetector {
  private entries = new Map<HTMLElement, PdfViewEntry>()
  private cleanupFns: (() => void)[] = []
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>()
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

  constructor(
    private workspace: Workspace,
    private callbacks: PdfDetectorCallbacks,
    private service: PdfHighlighter,
    private getDefaultMode: () => PdfMode,
  ) {
    const onChange = () => this.scheduleScan()
    this.workspace.on('layout-change', onChange)
    this.workspace.on('active-leaf-change', onChange)
    this.cleanupFns.push(() => {
      this.workspace.off('layout-change', onChange)
      this.workspace.off('active-leaf-change', onChange)
    })

    // Capture phase so Ctrl+S cycles modes before Obsidian's save handler.
    // Scoped to PDF views, so it never interferes with the markdown
    // selection toggle (which uses the same key on markdown views).
    document.addEventListener('keydown', this.boundKeyDown, true)
    this.cleanupFns.push(() =>
      document.removeEventListener('keydown', this.boundKeyDown, true),
    )

    this.scheduleScan()
  }

  private onKeyDown(e: KeyboardEvent) {
    // Ctrl+S (no Cmd/Shift/Alt) cycles modes when a PDF view is active.
    if (e.key !== 's' || !e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return
    }
    if (!this.hasActivePdfOverlay()) return
    e.preventDefault()
    e.stopPropagation()
    this.cycleActiveMode()
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    this.pendingTimeouts.forEach((id) => clearTimeout(id))
    this.pendingTimeouts.clear()
    this.entries.forEach((entry) => {
      entry.overlay.destroy()
      entry.toolbar.destroy()
    })
    this.entries.clear()
  }

  /** True if the active leaf is a PDF with an overlay. */
  hasActivePdfOverlay(): boolean {
    return this.getActiveOverlay() !== null
  }

  /** Set the mode of the active PDF view (used by commands). */
  setActiveMode(mode: PdfMode) {
    this.getActiveOverlay()?.setMode(mode)
  }

  /** Cycle the active PDF view to the next mode (used by the cycle command). */
  cycleActiveMode() {
    const overlay = this.getActiveOverlay()
    if (overlay) overlay.setMode(nextPdfMode(overlay.getMode()))
  }

  private getActiveOverlay(): PdfSelectionOverlay | null {
    const activeLeaf = this.workspace.activeLeaf
    if (!activeLeaf || activeLeaf.view.getViewType() !== 'pdf') return null

    const container =
      activeLeaf.view.containerEl.querySelector('.pdf-container')
    if (!(container instanceof HTMLElement)) return null

    return this.entries.get(container)?.overlay ?? null
  }

  /** Resolve the PDF leaf owning `container`. */
  private resolveLeaf(container: HTMLElement): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null
    this.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view.getViewType() !== 'pdf' || !(view instanceof FileView)) return
      if (view.containerEl.querySelector('.pdf-container') === container) {
        found = leaf
      }
    })
    return found
  }

  /** Resolve the PDF file currently shown in the leaf owning `container`. */
  private resolveFile(container: HTMLElement): TFile | null {
    const leaf = this.resolveLeaf(container)
    return leaf?.view instanceof FileView ? leaf.view.file : null
  }

  /**
   * Scan now, then again shortly after — the PDF++ color palette can mount a
   * tick or two after the leaf becomes active, and we anchor next to it.
   */
  private scheduleScan() {
    this.scan()
    for (const delay of [150, 500]) {
      const id = setTimeout(() => {
        this.pendingTimeouts.delete(id)
        this.scan()
      }, delay)
      this.pendingTimeouts.add(id)
    }
  }

  private scan() {
    const seen = new Set<HTMLElement>()

    this.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view.getViewType() !== 'pdf') return

      const container = view.containerEl.querySelector('.pdf-container')
      if (!(container instanceof HTMLElement)) return
      seen.add(container)

      let entry = this.entries.get(container)
      if (!entry) {
        entry = this.createEntry(container)
        this.entries.set(container, entry)
      }

      const toolbarLeft = view.containerEl.querySelector('.pdf-toolbar-left')
      if (toolbarLeft instanceof HTMLElement) {
        entry.toolbar.mount(toolbarLeft, entry.overlay.getMode())
      }

      const file = view instanceof FileView ? view.file : null
      entry.toolbar.setAnnotationOpen(
        file ? this.service.isAnnotationFileOpenForFile(file) : false,
      )
    })

    for (const [container, entry] of this.entries) {
      if (!seen.has(container)) {
        entry.overlay.destroy()
        entry.toolbar.destroy()
        this.entries.delete(container)
      }
    }
  }

  private createEntry(container: HTMLElement): PdfViewEntry {
    const holder: { toolbar?: PdfModeToolbar } = {}
    const overlay = new PdfSelectionOverlay(
      container,
      {
        onCapture: this.callbacks.onCapture,
        onTextSelection: this.callbacks.onTextSelection,
        onMathConversion: this.callbacks.onMathConversion,
        onHighlight: () => void this.service.highlightActiveSelection(),
        onDeleteHighlight: (page, selectionId) => {
          const file = this.resolveFile(container)
          if (file) {
            void this.service.deleteHighlightForFile(file, page, selectionId)
          }
        },
        onModeChange: (mode) => holder.toolbar?.update(mode),
      },
      this.getDefaultMode(),
    )
    const toolbar = new PdfModeToolbar(
      (mode) => overlay.setMode(mode),
      () => {
        const leaf = this.resolveLeaf(container)
        const file = leaf?.view instanceof FileView ? leaf.view.file : null
        if (leaf && file) {
          void this.service.toggleAnnotationFileForFile(file, leaf)
        }
      },
    )
    holder.toolbar = toolbar
    return { overlay, toolbar }
  }
}
