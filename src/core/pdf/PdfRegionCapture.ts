import { Notice } from 'obsidian'

export type SelectionRect = {
  x: number
  y: number
  width: number
  height: number
}


export function captureCanvasRegion(
  canvas: HTMLCanvasElement,
  rect: SelectionRect,
): string | null {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      new Notice('Failed to capture PDF region: could not get canvas context')
      return null
    }

    // Map CSS pixels to canvas pixels (handles high-DPI displays)
    const scaleX = canvas.width / canvas.clientWidth
    const scaleY = canvas.height / canvas.clientHeight

    const sx = Math.round(rect.x * scaleX)
    const sy = Math.round(rect.y * scaleY)
    const sw = Math.round(rect.width * scaleX)
    const sh = Math.round(rect.height * scaleY)

    if (sw <= 0 || sh <= 0) return null

    const imageData = ctx.getImageData(sx, sy, sw, sh)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = sw
    tempCanvas.height = sh
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return null

    tempCtx.putImageData(imageData, 0, 0)
    return tempCanvas.toDataURL('image/png')
  } catch (e) {
    new Notice('Failed to capture PDF region: canvas may be tainted')
    console.error('PDF region capture failed:', e)
    return null
  }
}
