import { MentionableImage } from '../../types/mentionable'

import { SelectionRect, captureCanvasRegion } from './PdfRegionCapture'

const MIN_SELECTION_SIZE = 10

export class PdfSelectionOverlay {
  private overlay: HTMLDivElement
  private selectionRect: HTMLDivElement | null = null
  private isDragging = false
  private dragStart: { x: number; y: number } | null = null
  private activePage: HTMLElement | null = null
  private activeCanvas: HTMLCanvasElement | null = null
  private captureCount = 0

  private boundMouseDown: (e: MouseEvent) => void
  private boundMouseMove: (e: MouseEvent) => void
  private boundMouseUp: (e: MouseEvent) => void
  private boundKeyDown: (e: KeyboardEvent) => void
  private boundWheel: (_e: WheelEvent) => void

  constructor(
    private container: HTMLElement,
    private onCapture: (image: MentionableImage) => void,
  ) {
    this.boundMouseDown = this.onMouseDown.bind(this)
    this.boundMouseMove = this.onMouseMove.bind(this)
    this.boundMouseUp = this.onMouseUp.bind(this)
    this.boundKeyDown = this.onKeyDown.bind(this)
    this.boundWheel = this.onWheel.bind(this)

    this.overlay = document.createElement('div')
    this.overlay.className = 'smtcmp-pdf-selection-overlay'
    this.container.appendChild(this.overlay)

    this.overlay.addEventListener('mousedown', this.boundMouseDown)
    this.overlay.addEventListener('mousemove', this.boundMouseMove)
    this.overlay.addEventListener('mouseup', this.boundMouseUp)
    this.overlay.addEventListener('wheel', this.boundWheel, { passive: true })
    document.addEventListener('keydown', this.boundKeyDown)
  }

  destroy() {
    this.cancelSelection()
    this.overlay.removeEventListener('mousedown', this.boundMouseDown)
    this.overlay.removeEventListener('mousemove', this.boundMouseMove)
    this.overlay.removeEventListener('mouseup', this.boundMouseUp)
    this.overlay.removeEventListener('wheel', this.boundWheel)
    document.removeEventListener('keydown', this.boundKeyDown)
    this.overlay.remove()
  }

  private onWheel(_e: WheelEvent) {
    // Pass through scroll events to the PDF container
    if (!this.isDragging) {
      this.overlay.style.pointerEvents = 'none'
      requestAnimationFrame(() => {
        this.overlay.style.pointerEvents = ''
      })
    }
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return // left click only
    e.preventDefault()

    // Find the PDF page canvas under the click point
    this.overlay.style.pointerEvents = 'none'
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
    this.overlay.style.pointerEvents = ''

    const page = elementBelow?.closest('.pdf-page')
    if (!(page instanceof HTMLElement)) return

    const canvas = page.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return

    this.activePage = page
    this.activeCanvas = canvas

    const overlayRect = this.overlay.getBoundingClientRect()
    this.dragStart = {
      x: e.clientX - overlayRect.left,
      y: e.clientY - overlayRect.top,
    }
    this.isDragging = true

    // Create selection rectangle
    this.selectionRect = document.createElement('div')
    this.selectionRect.className = 'smtcmp-pdf-selection-rect'
    this.selectionRect.style.left = `${this.dragStart.x}px`
    this.selectionRect.style.top = `${this.dragStart.y}px`
    this.selectionRect.style.width = '0px'
    this.selectionRect.style.height = '0px'
    this.overlay.appendChild(this.selectionRect)
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.dragStart || !this.selectionRect) return

    const overlayRect = this.overlay.getBoundingClientRect()
    const currentX = e.clientX - overlayRect.left
    const currentY = e.clientY - overlayRect.top

    // Clamp to page bounds if we have an active page
    let clampedX = currentX
    let clampedY = currentY
    if (this.activePage) {
      const pageRect = this.activePage.getBoundingClientRect()
      const pageLeft = pageRect.left - overlayRect.left
      const pageTop = pageRect.top - overlayRect.top
      const pageRight = pageLeft + pageRect.width
      const pageBottom = pageTop + pageRect.height
      clampedX = Math.max(pageLeft, Math.min(pageRight, currentX))
      clampedY = Math.max(pageTop, Math.min(pageBottom, currentY))
    }

    const x = Math.min(this.dragStart.x, clampedX)
    const y = Math.min(this.dragStart.y, clampedY)
    const width = Math.abs(clampedX - this.dragStart.x)
    const height = Math.abs(clampedY - this.dragStart.y)

    this.selectionRect.style.left = `${x}px`
    this.selectionRect.style.top = `${y}px`
    this.selectionRect.style.width = `${width}px`
    this.selectionRect.style.height = `${height}px`
  }

  private onMouseUp(e: MouseEvent) {
    if (!this.isDragging || !this.dragStart || !this.activeCanvas) {
      this.cancelSelection()
      return
    }

    const overlayRect = this.overlay.getBoundingClientRect()
    const endX = e.clientX - overlayRect.left
    const endY = e.clientY - overlayRect.top

    const width = Math.abs(endX - this.dragStart.x)
    const height = Math.abs(endY - this.dragStart.y)

    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      this.cancelSelection()
      return
    }

    // Convert overlay coordinates to canvas-relative coordinates
    const canvasRect = this.activeCanvas.getBoundingClientRect()
    const selX = Math.min(this.dragStart.x, endX)
    const selY = Math.min(this.dragStart.y, endY)

    const rect: SelectionRect = {
      x: selX + overlayRect.left - canvasRect.left,
      y: selY + overlayRect.top - canvasRect.top,
      width,
      height,
    }

    const dataUrl = captureCanvasRegion(this.activeCanvas, rect)

    // Flash animation on success
    if (dataUrl && this.selectionRect) {
      this.selectionRect.classList.add('smtcmp-pdf-selection-rect--captured')
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
    if (this.selectionRect) {
      this.selectionRect.remove()
      this.selectionRect = null
    }
  }
}
