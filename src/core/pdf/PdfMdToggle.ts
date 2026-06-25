import { App, FileView, TFile, WorkspaceLeaf } from 'obsidian'

import { SmartComposerSettings } from '../../settings/schema/setting.types'

const TOGGLE_CLASS = 'smtcmp-pdf-md-toggle'

/**
 * Adds a button to switch between a paper's PDF (in zotero.libraryVaultPath)
 * and its pre-extracted markdown counterpart (in
 * zotero.markdownVaultPath/<citekey>/<citekey>.md), in either direction.
 *
 * Only active when pdfNamingScheme is 'citekey' and markdownVaultPath is set
 * (i.e. this is a no-op unless explicitly configured for a vault).
 */
export class PdfMdToggle {
  private cleanupFns: (() => void)[] = []

  constructor(
    private app: App,
    private getSettings: () => SmartComposerSettings,
  ) {
    const scan = () => this.scan()
    this.app.workspace.on('layout-change', scan)
    this.app.workspace.on('active-leaf-change', scan)
    this.app.workspace.on('file-open', scan)
    this.cleanupFns.push(() => {
      this.app.workspace.off('layout-change', scan)
      this.app.workspace.off('active-leaf-change', scan)
      this.app.workspace.off('file-open', scan)
    })

    // The PDF toolbar can render slightly after the leaf becomes active, so
    // retry a few times shortly after each scan trigger.
    const retryScan = () => {
      this.scan()
      const t1 = setTimeout(() => this.scan(), 150)
      const t2 = setTimeout(() => this.scan(), 500)
      this.cleanupFns.push(() => {
        clearTimeout(t1)
        clearTimeout(t2)
      })
    }
    this.app.workspace.on('active-leaf-change', retryScan)
    this.cleanupFns.push(() => {
      this.app.workspace.off('active-leaf-change', retryScan)
    })

    this.scan()
  }

  destroy() {
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
  }

  private scan() {
    const settings = this.getSettings()
    const pdfFolder = settings.zotero.libraryVaultPath || 'Library'
    const mdFolder = settings.zotero.markdownVaultPath
    if (settings.zotero.pdfNamingScheme !== 'citekey' || !mdFolder) return

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (!(view instanceof FileView) || !view.file) return
      const file = view.file
      const viewType = view.getViewType()

      if (viewType === 'pdf' && file.parent?.path === pdfFolder) {
        this.injectPdfToggle(leaf, view, file, mdFolder)
      } else if (
        viewType === 'markdown' &&
        file.extension === 'md' &&
        file.parent?.path === `${mdFolder}/${file.basename}`
      ) {
        this.injectMarkdownToggle(leaf, view, file, pdfFolder)
      }
    })
  }

  private injectPdfToggle(
    leaf: WorkspaceLeaf,
    view: FileView,
    file: TFile,
    mdFolder: string,
  ) {
    const toolbarRight = view.containerEl.querySelector('.pdf-toolbar-right')
    if (!(toolbarRight instanceof HTMLElement)) return
    if (toolbarRight.querySelector(`.${TOGGLE_CLASS}`)) return

    const btn = toolbarRight.createDiv({
      cls: `clickable-icon pdf-toolbar-button ${TOGGLE_CLASS}`,
    })
    btn.setText('MD')
    btn.setAttribute('aria-label', 'Switch to markdown version')

    btn.addEventListener('click', (evt) => {
      evt.preventDefault()
      const citekey = file.basename
      const mdPath = `${mdFolder}/${citekey}/${citekey}.md`
      const mdFile = this.app.vault.getAbstractFileByPath(mdPath)
      if (mdFile instanceof TFile) {
        void leaf.openFile(mdFile)
      }
    })
  }

  private injectMarkdownToggle(
    leaf: WorkspaceLeaf,
    view: FileView,
    file: TFile,
    pdfFolder: string,
  ) {
    const actionsEl = view.containerEl.querySelector('.view-actions')
    if (actionsEl?.querySelector(`.${TOGGLE_CLASS}`)) return

    const btn = view.addAction('file-text', 'Switch to PDF version', () => {
      const citekey = file.basename
      const pdfPath = `${pdfFolder}/${citekey}.pdf`
      const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath)
      if (pdfFile instanceof TFile) {
        void leaf.openFile(pdfFile)
      }
    })
    btn.addClass(TOGGLE_CLASS)
    btn.setText('PDF')
  }
}
