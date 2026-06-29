import {
  App,
  FileView,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'

/**
 * Colored-callout entry written per highlight. PDF++ fills the template:
 *  - {{color}}           lowercase color name (drives the callout's color)
 *  - {{linkWithDisplay}} the selection link (includes &color=, which drives the
 *                        rendered highlight) plus the display text
 *  - {{text}}            the selected text
 */
const CALLOUT_TEMPLATE =
  '> [!quote|{{color}}] {{linkWithDisplay}}\n> {{text}}\n'

const DEFAULT_ANNOTATIONS_FOLDER = 'annotations'

/** Minimal shape of the PDF++ runtime API we depend on. */
type PdfPlusTemplateVars = {
  child: unknown
  file: TFile
  subpath: string
  page: number
  text: string
}

type PdfPlusCopyLink = {
  getTemplateVariables: (opts: { color?: string }) => PdfPlusTemplateVars | null
  getTextToCopy: (
    child: unknown,
    copyFormat: string,
    displayTextFormat: string | undefined,
    file: TFile,
    page: number,
    subpath: string,
    text: string,
    color: string,
  ) => string
}

type PdfPlusPlugin = { lib?: { copyLink?: PdfPlusCopyLink } }

/**
 * Turns the live PDF text selection into a PDF++ backlink and appends it to
 * `<annotationsVaultPath>/<citekey>.md`. PDF++ then renders the highlight from
 * that backlink — the PDF file itself is never modified (it stays in sync with
 * Zotero/ZotMoov).
 *
 * Link generation is fully synchronous (it reads the live selection up front),
 * so the only async work is the vault write that happens after the link string
 * has already been captured.
 */
export class PdfHighlighter {
  constructor(
    private app: App,
    private getSettings: () => SmartComposerSettings,
  ) {}

  /**
   * Highlight the current selection in the active PDF view. Returns true if a
   * highlight was written. Fails soft (Notice) if PDF++ is unavailable, its API
   * has changed, or there is no selection.
   */
  async highlightActiveSelection(): Promise<boolean> {
    const view = this.app.workspace.activeLeaf?.view
    if (!view || view.getViewType() !== 'pdf' || !(view instanceof FileView)) {
      return false
    }
    const file = view.file
    if (!file) return false
    const citekey = file.basename

    const copyLink = this.getPdfPlusCopyLink()
    if (!copyLink) {
      new Notice('Smart Composer: PDF++ is not available for highlighting')
      return false
    }

    // Read "the selected colour" from PDF++'s palette in this view's toolbar.
    const color =
      view.containerEl
        .querySelector('.pdf-plus-color-palette-item.is-active')
        ?.getAttribute('data-highlight-color') ?? undefined

    // Capture the link string synchronously while the selection still exists.
    let calloutText: string
    try {
      const vars = copyLink.getTemplateVariables(color ? { color } : {})
      if (!vars || !vars.text) {
        new Notice('Smart Composer: select some text to highlight')
        return false
      }
      calloutText = copyLink.getTextToCopy(
        vars.child,
        CALLOUT_TEMPLATE,
        undefined,
        vars.file,
        vars.page,
        vars.subpath,
        vars.text,
        color ?? '',
      )
    } catch (error) {
      console.error('PDF++ highlight link generation failed:', error)
      new Notice('Smart Composer: failed to build the highlight link')
      return false
    }

    if (!calloutText?.trim()) return false

    try {
      await this.appendToAnnotationFile(citekey, calloutText)
    } catch (error) {
      console.error('Failed to write annotation file:', error)
      new Notice('Smart Composer: failed to save the highlight')
      return false
    }

    return true
  }

  private getPdfPlusCopyLink(): PdfPlusCopyLink | null {
    const plugins = (
      this.app as unknown as {
        plugins?: { plugins?: Record<string, PdfPlusPlugin> }
      }
    ).plugins?.plugins
    const copyLink = plugins?.['pdf-plus']?.lib?.copyLink
    if (
      copyLink &&
      typeof copyLink.getTemplateVariables === 'function' &&
      typeof copyLink.getTextToCopy === 'function'
    ) {
      return copyLink
    }
    return null
  }

  /** Vault path of the annotation file for a PDF's citekey. */
  getAnnotationPath(citekey: string): string {
    const folder = this.getAnnotationFolder()
    return folder ? `${folder}/${citekey}.md` : `${citekey}.md`
  }

  /** True if the annotation file for this PDF is open in any leaf/window. */
  isAnnotationFileOpenForFile(pdfFile: TFile): boolean {
    const path = this.getAnnotationPath(pdfFile.basename)
    let open = false
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view instanceof FileView && view.file?.path === path) open = true
    })
    return open
  }

  /**
   * Toggle the PDF's annotation file: if open anywhere, close it; otherwise
   * open it beside the PDF (a vertical split), mirroring how PDF++ opens a
   * highlight's source note. No-op with a Notice if the file doesn't exist.
   */
  async toggleAnnotationFileForFile(
    pdfFile: TFile,
    pdfLeaf: WorkspaceLeaf,
  ): Promise<void> {
    const path = this.getAnnotationPath(pdfFile.basename)
    const open: WorkspaceLeaf[] = []
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view instanceof FileView && view.file?.path === path) open.push(leaf)
    })

    if (open.length > 0) {
      open.forEach((leaf) => leaf.detach())
      return
    }

    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      new Notice('Smart Composer: no annotations yet for this PDF')
      return
    }
    const leaf = this.app.workspace.createLeafBySplit(pdfLeaf, 'vertical')
    await leaf.openFile(file)
  }

  /**
   * Delete the highlight identified by (page, selectionId) from the PDF's
   * annotation file. selectionId is PDF++'s `data-backlink-id`
   * (`beginIndex,beginOffset,endIndex,endOffset`), matched against the callout's
   * link. Returns true if a block was removed. PDF++ un-renders the highlight on
   * the resulting file change.
   */
  async deleteHighlightForFile(
    pdfFile: TFile,
    page: number,
    selectionId: string,
  ): Promise<boolean> {
    const path = this.getAnnotationPath(pdfFile.basename)
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) return false

    let changed = false
    await this.app.vault.process(file, (data) => {
      const next = removeCalloutForSelection(data, page, selectionId)
      if (next === null) return data
      changed = true
      return next
    })

    if (!changed) {
      new Notice('Smart Composer: could not find that highlight to delete')
    }
    return changed
  }

  private getAnnotationFolder(): string {
    const folder = normalizePath(
      this.getSettings().zotero.annotationsVaultPath ||
        DEFAULT_ANNOTATIONS_FOLDER,
    )
    return folder === '.' ? '' : folder
  }

  private async ensureAnnotationFolder(): Promise<void> {
    const folder = this.getAnnotationFolder()
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      try {
        await this.app.vault.createFolder(folder)
      } catch {
        // Folder may already exist (or was created concurrently) — ignore.
      }
    }
  }

  private async appendToAnnotationFile(
    citekey: string,
    calloutText: string,
  ): Promise<void> {
    await this.ensureAnnotationFolder()

    const path = this.getAnnotationPath(citekey)
    const existing = this.app.vault.getAbstractFileByPath(path)
    const block = calloutText.endsWith('\n') ? calloutText : `${calloutText}\n`

    if (existing instanceof TFile) {
      // Read-modify-write so concurrent highlights don't clobber each other,
      // keeping a blank line between callout blocks.
      await this.app.vault.process(existing, (data) => {
        const sep =
          data.length === 0 || data.endsWith('\n\n')
            ? ''
            : data.endsWith('\n')
              ? '\n'
              : '\n\n'
        return data + sep + block
      })
    } else {
      await this.app.vault.create(path, block)
    }
  }
}

/**
 * Remove the callout block whose link matches `page` + `selectionId`. Returns
 * the new file content, or null if no matching block was found.
 */
function removeCalloutForSelection(
  data: string,
  page: number,
  selectionId: string,
): string | null {
  const lines = data.split('\n')
  const selEscaped = selectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Link looks like: ...#page=3&selection=4,0,4,88&color=yellow|display]]
  const re = new RegExp(
    `#page=${page}(?![0-9])[^\\]]*?selection=${selEscaped}(?![0-9,])`,
  )

  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      idx = i
      break
    }
  }
  if (idx < 0) return null

  // A callout block is the run of consecutive lines that start with '>'.
  const isCallout = (line: string) => /^\s*>/.test(line)
  let start = idx
  let end = idx
  while (start > 0 && isCallout(lines[start - 1])) start--
  while (end < lines.length - 1 && isCallout(lines[end + 1])) end++
  lines.splice(start, end - start + 1)

  const out = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s*$/, '')
  return out.length ? `${out}\n` : ''
}
