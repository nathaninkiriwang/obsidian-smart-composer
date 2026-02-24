import { MentionableImage } from '../../types/mentionable'

import { containsMathContent } from './mathDetection'
import { SelectionRect, captureCanvasRegion } from './PdfRegionCapture'

const MIN_SELECTION_SIZE = 10
const PAGE_SELECTOR = '.page'
const PADDING = 4

export type PdfInteractionMode = 'screenshot' | 'text'

export class PdfSelectionOverlay {
  private selectionRectEl: HTMLDivElement | null = null
  private isDragging = false
  private isTextSelecting = false
  private dragStart: { x: number; y: number } | null = null
  private activePage: HTMLElement | null = null
  private activeCanvas: HTMLCanvasElement | null = null
  private captureCount = 0
  private loadingIndicator: HTMLDivElement | null = null
  private mode: PdfInteractionMode = 'screenshot'
  private modeBadge: HTMLDivElement | null = null

  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e)
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e)
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e)
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)
  private boundTextMouseUp = (e: MouseEvent) => this.onTextSelectionEnd(e)
  private boundToggleKey = (e: KeyboardEvent) => this.onToggleKey(e)

  constructor(
    private container: HTMLElement,
    private onCapture: (image: MentionableImage) => void,
    private onTextSelection: (text: string) => void,
    private onMathConversion: (imageDataUrl: string) => Promise<string>,
  ) {
    this.container.classList.add('smtcmp-pdf-capture-active')
    this.container.addEventListener('mousedown', this.boundMouseDown)
    this.container.addEventListener('keydown', this.boundToggleKey)
    this.showModeBadge()
  }

  destroy() {
    this.cancelSelection()
    this.removeLoadingIndicator()
    this.removeModeBadge()
    this.container.classList.remove('smtcmp-pdf-capture-active')
    this.container.classList.remove('smtcmp-pdf-text-mode')
    this.container.removeEventListener('mousedown', this.boundMouseDown)
    this.container.removeEventListener('keydown', this.boundToggleKey)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('mouseup', this.boundMouseUp)
    document.removeEventListener('mouseup', this.boundTextMouseUp)
    document.removeEventListener('keydown', this.boundKeyDown)
  }

  toggleMode() {
    this.setMode(this.mode === 'screenshot' ? 'text' : 'screenshot')
  }

  private setMode(mode: PdfInteractionMode) {
    this.mode = mode
    if (mode === 'text') {
      this.container.classList.add('smtcmp-pdf-text-mode')
    } else {
      this.container.classList.remove('smtcmp-pdf-text-mode')
    }
    this.updateModeBadge()
  }

  private onToggleKey(e: KeyboardEvent) {
    // Cmd+S (Mac) or Ctrl+S (Windows/Linux) to toggle mode
    if (e.key === 's' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      e.stopPropagation()
      this.toggleMode()
    }
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return

    const target = e.target
    if (!(target instanceof Element)) return

    const page =
      target.closest(PAGE_SELECTOR) ?? target.closest('.pdf-page')
    if (!(page instanceof HTMLElement)) return

    const canvas = page.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return

    // In text mode, allow native text selection
    if (this.mode === 'text') {
      this.isTextSelecting = true
      this.activePage = page
      this.activeCanvas = canvas
      // Do NOT call e.preventDefault() — let native text selection work
      document.addEventListener('mouseup', this.boundTextMouseUp)
      return
    }

    // Screenshot mode: start region capture
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

    // Attach document-level listeners for tracking
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('mouseup', this.boundMouseUp)
    document.addEventListener('keydown', this.boundKeyDown)
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.dragStart || !this.selectionRectEl) return

    let endX = e.clientX
    let endY = e.clientY

    // Clamp to page bounds
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

    // Clamp to page bounds
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

    // Convert viewport coordinates to canvas-relative coordinates
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
      this.onCapture(image)
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

    const range = selection.getRangeAt(0)
    void this.handleTextSelection(text, range)
  }

  private async handleTextSelection(text: string, range: Range) {
    if (containsMathContent(text)) {
      // Capture the selection region from the canvas for math conversion
      const imageDataUrl = this.getSelectionCanvasCapture(range)
      if (imageDataUrl) {
        this.showLoadingIndicator(range)
        try {
          const convertedText = await this.onMathConversion(imageDataUrl)
          this.onTextSelection(convertedText)
        } catch (err) {
          console.error('Math conversion failed, sending raw text:', err)
          this.onTextSelection(text)
        } finally {
          this.removeLoadingIndicator()
        }
      } else {
        // Fallback: send raw text if canvas capture fails
        this.onTextSelection(text)
      }
    } else {
      this.onTextSelection(text)
    }

    // Revert to screenshot mode after text selection completes
    this.setMode('screenshot')
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

  private showModeBadge() {
    this.removeModeBadge()

    const badge = document.createElement('div')
    badge.className = 'smtcmp-pdf-mode-badge'
    this.container.appendChild(badge)
    this.modeBadge = badge
    this.updateModeBadge()
  }

  private updateModeBadge() {
    if (!this.modeBadge) return
    if (this.mode === 'screenshot') {
      this.modeBadge.textContent = 'Screenshot mode (Cmd+S to select text)'
    } else {
      this.modeBadge.textContent = 'Text select mode (Cmd+S for screenshot)'
    }
  }

  private removeModeBadge() {
    if (this.modeBadge) {
      this.modeBadge.remove()
      this.modeBadge = null
    }
  }

  private resetTextSelectionState() {
    this.activePage = null
    this.activeCanvas = null
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
