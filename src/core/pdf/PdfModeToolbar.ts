import { setIcon, setTooltip } from 'obsidian'

import { PDF_MODE_META, PDF_MODE_ORDER, PdfMode } from './PdfMode'

const SWITCHER_CLASS = 'smtcmp-pdf-mode-switcher'
const CONTROLS_CLASS = 'smtcmp-pdf-toolbar-controls'

/**
 * The PDF toolbar controls Smart Composer injects, placed right after PDF++'s
 * color palette so the whole bar reads as one family:
 *   - a segmented mode switcher (Read / Highlight / Screenshot / Text)
 *   - an annotation-file toggle (open/close `<citekey>.md` in a new window)
 *
 * The detector calls {@link mount} repeatedly (on layout / active-leaf changes)
 * — it is idempotent and re-anchors after the palette if PDF++ rebuilds it.
 */
export class PdfModeToolbar {
  private rootEl: HTMLElement | null = null
  private buttons = new Map<PdfMode, HTMLElement>()
  private annotationBtn: HTMLElement | null = null

  constructor(
    private onSelectMode: (mode: PdfMode) => void,
    private onToggleAnnotation: () => void,
  ) {}

  /** Ensure the controls exist in `toolbarLeftEl`, anchored after the palette. */
  mount(toolbarLeftEl: HTMLElement, currentMode: PdfMode) {
    if (!this.rootEl) {
      this.rootEl = this.build()
    }
    this.anchor(toolbarLeftEl)
    this.update(currentMode)
  }

  update(mode: PdfMode) {
    for (const [m, btn] of this.buttons) {
      const active = m === mode
      btn.toggleClass('is-active', active)
      btn.setAttribute('aria-checked', active ? 'true' : 'false')
      btn.setAttribute('tabindex', active ? '0' : '-1')
    }
  }

  setAnnotationOpen(open: boolean) {
    this.annotationBtn?.toggleClass('is-active', open)
    this.annotationBtn?.setAttribute('aria-pressed', open ? 'true' : 'false')
  }

  destroy() {
    this.rootEl?.remove()
    this.rootEl = null
    this.buttons.clear()
    this.annotationBtn = null
  }

  private anchor(toolbarLeftEl: HTMLElement) {
    if (!this.rootEl) return
    const palette = toolbarLeftEl.querySelector('.pdf-plus-color-palette')
    // insertAdjacentElement / appendChild move the node if already attached, so
    // repeated calls simply re-position our existing controls.
    if (palette && palette.parentElement === toolbarLeftEl) {
      if (palette.nextElementSibling !== this.rootEl) {
        palette.insertAdjacentElement('afterend', this.rootEl)
      }
    } else if (this.rootEl.parentElement !== toolbarLeftEl) {
      toolbarLeftEl.appendChild(this.rootEl)
    }
  }

  private build(): HTMLElement {
    const root = createDiv({ cls: CONTROLS_CLASS })

    const switcher = root.createDiv({ cls: SWITCHER_CLASS })
    switcher.setAttribute('role', 'radiogroup')
    switcher.setAttribute('aria-label', 'PDF interaction mode')

    for (const mode of PDF_MODE_ORDER) {
      const meta = PDF_MODE_META[mode]
      const btn = switcher.createDiv({ cls: 'smtcmp-pdf-mode-btn' })
      btn.dataset.mode = mode
      btn.setAttribute('role', 'radio')
      setIcon(btn, meta.icon)
      setTooltip(btn, meta.tooltip, { placement: 'bottom' })

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        this.onSelectMode(mode)
      })
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.onSelectMode(mode)
        }
      })

      this.buttons.set(mode, btn)
    }

    const annotGroup = root.createDiv({ cls: 'smtcmp-pdf-annotation-toggle' })
    const annotBtn = annotGroup.createDiv({
      cls: 'smtcmp-pdf-mode-btn smtcmp-pdf-annotation-btn',
    })
    annotBtn.setAttribute('role', 'button')
    annotBtn.setAttribute('tabindex', '0')
    setIcon(annotBtn, 'file-text')
    setTooltip(annotBtn, 'Open/close annotation file in a new window', {
      placement: 'bottom',
    })
    annotBtn.addEventListener('click', (e) => {
      e.preventDefault()
      this.onToggleAnnotation()
    })
    annotBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.onToggleAnnotation()
      }
    })
    this.annotationBtn = annotBtn

    return root
  }
}
