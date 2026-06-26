import { App, TFile } from 'obsidian'

import { SmartComposerSettings } from '../settings/schema/setting.types'

/**
 * If `file` is a citekey-named Zotero PDF that has a pre-extracted markdown
 * counterpart (`${markdownVaultPath}/<citekey>/<citekey>.md`), return that
 * markdown TFile. Otherwise return null.
 *
 * Lets the rest of the app prefer the markdown version of a paper even when the
 * user is viewing the PDF, mirroring the PDF/markdown toggle in PdfMdToggle and
 * the markdown-backed reading in PromptGenerator.
 */
export function getMarkdownCounterpart(
  app: App,
  settings: SmartComposerSettings,
  file: TFile | null,
): TFile | null {
  if (!file || file.extension !== 'pdf') return null

  const mdFolder = settings.zotero.markdownVaultPath
  if (settings.zotero.pdfNamingScheme !== 'citekey' || !mdFolder) return null

  const citekey = file.basename
  const mdFile = app.vault.getAbstractFileByPath(
    `${mdFolder}/${citekey}/${citekey}.md`,
  )
  return mdFile instanceof TFile ? mdFile : null
}
