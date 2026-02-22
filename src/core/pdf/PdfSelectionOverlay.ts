import { MentionableImage } from '../../types/mentionable'

import { SelectionRect, captureCanvasRegion } from './PdfRegionCapture'

const MIN_SELECTION_SIZE = 10
const PAGE_SELECTOR = '.page'

export class PdfSelectionOverlay {
  private selectionRectEl: HTMLDivElement | null = null
  private isDragging = false
  private dragStart: { x: number; y: number } | null = null
  private activePage: HTMLElement | null = null
  private activeCanvas: HTMLCanvasElement | null = null
  private captureCount = 0

  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e)
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e)
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e)
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)

  constructor(
    private container: HTMLElement,
    private onCapture: (image: MentionableImage) => void,
  ) {
    this.container.classList.add('smtcmp-pdf-capture-active')
    this.container.addEventListener('mousedown', this.boundMouseDown)
  }

  destroy() {
    this.cancelSelection()
    this.container.classList.remove('smtcmp-pdf-capture-active')
    this.container.removeEventListener('mousedown', this.boundMouseDown)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('mouseup', this.boundMouseUp)
    document.removeEventListener('keydown', this.boundKeyDown)
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
