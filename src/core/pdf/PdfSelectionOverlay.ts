import { setIcon, setTooltip } from 'obsidian'

import { MentionableImage } from '../../types/mentionable'

import { containsMathContent } from './mathDetection'
import { PdfMode } from './PdfMode'
import { SelectionRect, captureCanvasRegion } from './PdfRegionCapture'

const MIN_SELECTION_SIZE = 10
const PAGE_SELECTOR = '.page'
const PADDING = 4
const HIGHLIGHT_SELECTOR = '.pdf-plus-backlink-selection'
const DELETE_BUTTON_HIDE_DELAY = 220

const ALL_MODE_CLASSES = [
  'smtcmp-pdf-mode-read',
  'smtcmp-pdf-mode-highlight',
  'smtcmp-pdf-mode-screenshot',
  'smtcmp-pdf-mode-text',
]

export type PdfOverlayCallbacks = {
  /** Screenshot mode: a captured region is ready to send to chat. */
  onCapture: (image: MentionableImage) => void
  /** Text mode: selected text is ready to send to chat. */
  onTextSelection: (text: string) => void
  /** Text mode: convert a math image selection to LaTeX text. */
  onMathConversion: (imageDataUrl: string) => Promise<string>
  /** Highlight mode: highlight the live selection and save the annotation. */
  onHighlight: () => void
  /** Highlight mode: delete the hovered highlight from the annotation file. */
  onDeleteHighlight: (page: number, selectionId: string) => void
  /** Fired whenever the active mode changes, so the toolbar can repaint. */
  onModeChange: (mode: PdfMode) => void
}

/**
 * Per-PDF-container interaction layer. Owns the current {@link PdfMode} and
 * routes mouse selection to the right behavior:
 *   - read:       no interception (scroll only; text layer is inert)
 *   - highlight:  native selection → onHighlight (PDF++ link → annotation file)
 *   - screenshot: drag a region → onCapture (image to chat)
 *   - text:       native selection → onTextSelection (text/LaTeX to chat)
 *
 * Modes are sticky — they only change when the toolbar or a command asks.
 */
export class PdfSelectionOverlay {
  private selectionRectEl: HTMLDivElement | null = null
  private isDragging = false
  private isTextSelecting = false
  private dragStart: { x: number; y: number } | null = null
  private activePage: HTMLElement | null = null
  private activeCanvas: HTMLCanvasElement | null = null
  private captureCount = 0
  private loadingIndicator: HTMLDivElement | null = null
  private mode: PdfMode

  // Hover-to-delete affordance for existing highlights (highlight mode). A
  // highlight that spans multiple lines is several DOM rects sharing one
  // backlink id; we treat them as a single group.
  private deleteButtonEl: HTMLDivElement | null = null
  private deleteTarget: { page: number; selectionId: string } | null = null
  private hoverGroupEls: HTMLElement[] = []
  private hideDeleteTimer: ReturnType<typeof setTimeout> | null = null

  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e)
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e)
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e)
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)
  private boundTextMouseUp = (e: MouseEvent) => this.onTextSelectionEnd(e)
  private boundHighlightOver = (e: MouseEvent) => this.onHighlightOver(e)
  private boundHighlightOut = (e: MouseEvent) => this.onHighlightOut(e)

  constructor(
    private container: HTMLElement,
    private callbacks: PdfOverlayCallbacks,
    initialMode: PdfMode,
  ) {
    this.mode = initialMode
    this.container.classList.add('smtcmp-pdf-managed')
    this.container.addEventListener('mousedown', this.boundMouseDown)
    this.container.addEventListener('mouseover', this.boundHighlightOver)
    this.container.addEventListener('mouseout', this.boundHighlightOut)
    this.applyModeClasses()
  }

  destroy() {
    this.cancelSelection()
    this.removeLoadingIndicator()
    this.removeDeleteButton()
    this.container.classList.remove('smtcmp-pdf-managed', ...ALL_MODE_CLASSES)
    this.container.removeEventListener('mousedown', this.boundMouseDown)
    this.container.removeEventListener('mouseover', this.boundHighlightOver)
    this.container.removeEventListener('mouseout', this.boundHighlightOut)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('mouseup', this.boundMouseUp)
    document.removeEventListener('mouseup', this.boundTextMouseUp)
    document.removeEventListener('keydown', this.boundKeyDown)
  }

  getMode(): PdfMode {
    return this.mode
  }

  setMode(mode: PdfMode) {
    if (mode === this.mode) {
      this.callbacks.onModeChange(this.mode)
      return
    }
    // Abandon any in-progress interaction when switching modes.
    this.cancelSelection()
    this.resetTextSelectionState()
    this.isTextSelecting = false
    document.removeEventListener('mouseup', this.boundTextMouseUp)
    this.removeDeleteButton()

    this.mode = mode
    this.applyModeClasses()
    this.callbacks.onModeChange(this.mode)
  }

  private applyModeClasses() {
    const cls = this.container.classList
    cls.remove(...ALL_MODE_CLASSES)
    cls.add(`smtcmp-pdf-mode-${this.mode}`)
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return
    // Read mode never intercepts — only scrolling is allowed.
    if (this.mode === 'read') return

    const target = e.target
    if (!(target instanceof Element)) return

    const page = target.closest(PAGE_SELECTOR) ?? target.closest('.pdf-page')
    if (!(page instanceof HTMLElement)) return

    const canvas = page.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return

    // Highlight & text modes rely on native text selection.
    if (this.mode === 'text' || this.mode === 'highlight') {
      this.isTextSelecting = true
      this.activePage = page
      this.activeCanvas = canvas
      // Do NOT preventDefault — let native text selection happen.
      document.addEventListener('mouseup', this.boundTextMouseUp)
      return
    }

    // Screenshot mode: start region capture.
    e.preventDefault()

    this.activePage = page
    this.activeCanvas = canvas
    this.dragStart = { x: e.clientX, y: e.clientY }
    this.isDragging = true

    // Create selection rectangle (fixed position so scroll doesn't move it)
    this.selectionRectEl = document.createElement('div')
    this.selectionRectEl.className = 'smtcmp-pdf-selection-rect'
    this.selectionRectEl.style.left = `${e.clientX}px`
    this.selectionRectEl.style.top = `${e.clientY}px`
    this.selectionRectEl.style.width = '0px'
    this.selectionRectEl.style.height = '0px'
    document.body.appendChild(this.selectionRectEl)

    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('mouseup', this.boundMouseUp)
    document.addEventListener('keydown', this.boundKeyDown)
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.dragStart || !this.selectionRectEl) return

    let endX = e.clientX
    let endY = e.clientY

    if (this.activePage) {
      const pageRect = this.activePage.getBoundingClientRect()
      endX = Math.max(pageRect.left, Math.min(pageRect.right, endX))
      endY = Math.max(pageRect.top, Math.min(pageRect.bottom, endY))
    }

    const x = Math.min(this.dragStart.x, endX)
    const y = Math.min(this.dragStart.y, endY)
    const width = Math.abs(endX - this.dragStart.x)
    const height = Math.abs(endY - this.dragStart.y)

    this.selectionRectEl.style.left = `${x}px`
    this.selectionRectEl.style.top = `${y}px`
    this.selectionRectEl.style.width = `${width}px`
    this.selectionRectEl.style.height = `${height}px`
  }

  private onMouseUp(e: MouseEvent) {
    if (!this.isDragging || !this.dragStart || !this.activeCanvas) {
      this.cancelSelection()
      return
    }

    let endX = e.clientX
    let endY = e.clientY

    if (this.activePage) {
      const pageRect = this.activePage.getBoundingClientRect()
      endX = Math.max(pageRect.left, Math.min(pageRect.right, endX))
      endY = Math.max(pageRect.top, Math.min(pageRect.bottom, endY))
    }

    const width = Math.abs(endX - this.dragStart.x)
    const height = Math.abs(endY - this.dragStart.y)

    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      this.cancelSelection()
      return
    }

    const canvasRect = this.activeCanvas.getBoundingClientRect()
    const selX = Math.min(this.dragStart.x, endX)
    const selY = Math.min(this.dragStart.y, endY)

    const rect: SelectionRect = {
      x: selX - canvasRect.left,
      y: selY - canvasRect.top,
      width,
      height,
    }

    const dataUrl = captureCanvasRegion(this.activeCanvas, rect)

    if (dataUrl && this.selectionRectEl) {
      this.selectionRectEl.classList.add('smtcmp-pdf-selection-rect--captured')
      setTimeout(() => {
        this.cancelSelection()
      }, 200)

      this.captureCount++
      const image: MentionableImage = {
        type: 'image',
        name: `pdf-capture-${this.captureCount}.png`,
        mimeType: 'image/png',
        data: dataUrl,
      }
      this.callbacks.onCapture(image)
    } else {
      this.cancelSelection()
    }
  }

  private onTextSelectionEnd(_e: MouseEvent) {
    document.removeEventListener('mouseup', this.boundTextMouseUp)

    if (!this.isTextSelecting) return
    this.isTextSelecting = false

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      this.resetTextSelectionState()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.resetTextSelectionState()
      return
    }

    // Highlight mode: hand off to PDF++ (it reads the live selection itself).
    if (this.mode === 'highlight') {
      this.callbacks.onHighlight()
      this.resetTextSelectionState()
      return
    }

    // Text-to-AI mode.
    const range = selection.getRangeAt(0)
    void this.handleTextSelection(text, range)
  }

  private async handleTextSelection(text: string, range: Range) {
    if (containsMathContent(text)) {
      const imageDataUrl = this.getSelectionCanvasCapture(range)
      if (imageDataUrl) {
        this.showLoadingIndicator(range)
        try {
          const convertedText =
            await this.callbacks.onMathConversion(imageDataUrl)
          this.callbacks.onTextSelection(convertedText)
        } catch (err) {
          console.error('Math conversion failed, sending raw text:', err)
          this.callbacks.onTextSelection(text)
        } finally {
          this.removeLoadingIndicator()
        }
      } else {
        this.callbacks.onTextSelection(text)
      }
    } else {
      this.callbacks.onTextSelection(text)
    }

    this.resetTextSelectionState()
  }

  private getSelectionCanvasCapture(range: Range): string | null {
    if (!this.activeCanvas) return null

    const rangeRect = range.getBoundingClientRect()
    const canvasRect = this.activeCanvas.getBoundingClientRect()

    const rect: SelectionRect = {
      x: rangeRect.left - canvasRect.left - PADDING,
      y: rangeRect.top - canvasRect.top - PADDING,
      width: rangeRect.width + PADDING * 2,
      height: rangeRect.height + PADDING * 2,
    }

    return captureCanvasRegion(this.activeCanvas, rect)
  }

  private showLoadingIndicator(range: Range) {
    this.removeLoadingIndicator()

    const rangeRect = range.getBoundingClientRect()
    const indicator = document.createElement('div')
    indicator.className = 'smtcmp-pdf-math-loading'
    indicator.textContent = 'Converting math...'
    indicator.style.left = `${rangeRect.left}px`
    indicator.style.top = `${rangeRect.bottom + 4}px`
    document.body.appendChild(indicator)
    this.loadingIndicator = indicator
  }

  private removeLoadingIndicator() {
    if (this.loadingIndicator) {
      this.loadingIndicator.remove()
      this.loadingIndicator = null
    }
  }

  private resetTextSelectionState() {
    this.activePage = null
    this.activeCanvas = null
  }

  // === Hover-to-delete for existing highlights (highlight mode) ===

  private onHighlightOver(e: MouseEvent) {
    if (this.mode !== 'highlight') return
    const target = e.target
    if (!(target instanceof Element)) return
    const highlight = target.closest(HIGHLIGHT_SELECTOR)
    if (!(highlight instanceof HTMLElement)) return

    const selectionId = highlight.dataset.backlinkId
    const pageEl = highlight.closest(PAGE_SELECTOR)
    const page =
      pageEl instanceof HTMLElement ? Number(pageEl.dataset.pageNumber) : NaN
    if (
      !selectionId ||
      !(pageEl instanceof HTMLElement) ||
      !Number.isFinite(page)
    ) {
      return
    }

    this.cancelHideDeleteButton()

    // Already hovering this exact highlight group — nothing to recompute.
    if (
      this.deleteTarget?.selectionId === selectionId &&
      this.deleteTarget.page === page
    ) {
      return
    }

    this.setHoverGroup(selectionId, page, pageEl)
  }

  private onHighlightOut(e: MouseEvent) {
    if (this.mode !== 'highlight' || !this.deleteButtonEl) return
    const related = e.relatedTarget
    // Keep the button while moving onto it.
    if (related instanceof Node && this.deleteButtonEl.contains(related)) return
    // Keep it while moving onto another rect of the *same* highlight group.
    if (related instanceof Element) {
      const relHighlight = related.closest(HIGHLIGHT_SELECTOR)
      if (
        relHighlight instanceof HTMLElement &&
        relHighlight.dataset.backlinkId === this.deleteTarget?.selectionId
      ) {
        return
      }
    }
    this.scheduleHideDeleteButton()
  }

  /** Treat all rects sharing this backlink id (on this page) as one highlight. */
  private setHoverGroup(
    selectionId: string,
    page: number,
    pageEl: HTMLElement,
  ) {
    this.clearHoverGroupStyle()

    const els = Array.from(
      pageEl.querySelectorAll(
        `${HIGHLIGHT_SELECTOR}[data-backlink-id="${selectionId}"]`,
      ),
    ).filter((el): el is HTMLElement => el instanceof HTMLElement)
    if (els.length === 0) return

    els.forEach((el) => el.classList.add('smtcmp-hl-group-hover'))
    this.hoverGroupEls = els
    this.deleteTarget = { page, selectionId }
    this.positionDeleteButton(els)
  }

  /** Position one delete button at the top-right of the whole group's bounds. */
  private positionDeleteButton(els: HTMLElement[]) {
    const btn = this.ensureDeleteButton()
    let top = Infinity
    let right = -Infinity
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      top = Math.min(top, rect.top)
      right = Math.max(right, rect.right)
    }
    btn.style.left = `${right - 10}px`
    btn.style.top = `${top - 10}px`
    requestAnimationFrame(() => btn.classList.add('is-visible'))
  }

  private clearHoverGroupStyle() {
    this.hoverGroupEls.forEach((el) =>
      el.classList.remove('smtcmp-hl-group-hover'),
    )
    this.hoverGroupEls = []
  }

  private ensureDeleteButton(): HTMLDivElement {
    if (this.deleteButtonEl) return this.deleteButtonEl

    const btn = document.createElement('div')
    btn.className = 'smtcmp-pdf-highlight-delete'
    setIcon(btn, 'trash-2')
    setTooltip(btn, 'Delete highlight', { placement: 'top' })
    btn.addEventListener('mouseenter', () => this.cancelHideDeleteButton())
    btn.addEventListener('mouseleave', () => this.scheduleHideDeleteButton())
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (this.deleteTarget) {
        this.callbacks.onDeleteHighlight(
          this.deleteTarget.page,
          this.deleteTarget.selectionId,
        )
      }
      this.removeDeleteButton()
    })

    document.body.appendChild(btn)
    this.deleteButtonEl = btn
    return btn
  }

  private scheduleHideDeleteButton() {
    this.cancelHideDeleteButton()
    this.hideDeleteTimer = setTimeout(
      () => this.hideDeleteButton(),
      DELETE_BUTTON_HIDE_DELAY,
    )
  }

  private cancelHideDeleteButton() {
    if (this.hideDeleteTimer) {
      clearTimeout(this.hideDeleteTimer)
      this.hideDeleteTimer = null
    }
  }

  private hideDeleteButton() {
    this.deleteTarget = null
    this.clearHoverGroupStyle()
    this.deleteButtonEl?.classList.remove('is-visible')
  }

  private removeDeleteButton() {
    this.cancelHideDeleteButton()
    this.hideDeleteButton()
    if (this.deleteButtonEl) {
      this.deleteButtonEl.remove()
      this.deleteButtonEl = null
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.isDragging) {
      this.cancelSelection()
    }
  }

  private cancelSelection() {
    this.isDragging = false
    this.dragStart = null
    this.activePage = null
    this.activeCanvas = null
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('mouseup', this.boundMouseUp)
    document.removeEventListener('keydown', this.boundKeyDown)
    if (this.selectionRectEl) {
      this.selectionRectEl.remove()
      this.selectionRectEl = null
    }
  }
}
