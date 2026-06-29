/**
 * The four interaction modes Smart Composer layers onto an Obsidian PDF view.
 * These are mutually exclusive and apply to PDF views only — markdown views
 * (including a paper's extracted `.md`) are never affected.
 */
export type PdfMode = 'read' | 'highlight' | 'screenshot' | 'text'

export type PdfModeInfo = {
  /** Short label for the segmented control / command names. */
  label: string
  /** Lucide icon name passed to Obsidian's `setIcon`. */
  icon: string
  /** Tooltip shown on the toolbar segment. */
  tooltip: string
  /** Suffix used for the Obsidian command id (`pdf-mode-<id>`). */
  commandId: string
}

/** Order used by the segmented control and by mode cycling. */
export const PDF_MODE_ORDER: readonly PdfMode[] = [
  'read',
  'highlight',
  'screenshot',
  'text',
]

export const PDF_MODE_META: Record<PdfMode, PdfModeInfo> = {
  read: {
    label: 'Read',
    icon: 'book-open',
    tooltip: 'Read — scroll only, no selection or capture',
    commandId: 'read',
  },
  highlight: {
    label: 'Highlight',
    icon: 'highlighter',
    tooltip: 'Highlight — select text to highlight and save to annotations',
    commandId: 'highlight',
  },
  screenshot: {
    label: 'Screenshot',
    icon: 'camera',
    tooltip: 'Screenshot to AI — drag a region to send to chat',
    commandId: 'screenshot',
  },
  text: {
    label: 'Text to AI',
    icon: 'text-select',
    tooltip: 'Text to AI — select text to send to chat',
    commandId: 'text',
  },
}

/** Returns the next mode in the cycle order, wrapping around. */
export function nextPdfMode(mode: PdfMode): PdfMode {
  const idx = PDF_MODE_ORDER.indexOf(mode)
  return PDF_MODE_ORDER[(idx + 1) % PDF_MODE_ORDER.length]
}
