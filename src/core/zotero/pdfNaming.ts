import { ZoteroItem } from '../../types/zotero.types'

import { extractYear, getAuthorLastNames } from './zoteroClient'

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

export function buildPdfDisplayName(
  authors: string[],
  year: string,
  title: string,
): string {
  let base: string

  if (authors.length > 0) {
    base = authors[0] + ' et al.'
  } else {
    base = title.slice(0, 40).trim()
  }

  if (year) {
    base += ` ${year}`
  }

  return sanitizeFilename(base)
}

export function buildPdfFilename(
  authors: string[],
  year: string,
  title: string,
): string {
  return buildPdfDisplayName(authors, year, title) + '.pdf'
}

/**
 * Pre-compute unique filenames for all items, handling collisions.
 * Items with duplicate base filenames get numbered suffixes: (2), (3), etc.
 */
export function buildFilenameMap(items: ZoteroItem[]): Map<string, string> {
  const result = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const item of items) {
    const authors = getAuthorLastNames(item.data.creators)
    const year = extractYear(item.data.date)
    const baseName = buildPdfFilename(authors, year, item.data.title)

    const prev = counts.get(baseName) ?? 0
    counts.set(baseName, prev + 1)

    if (prev === 0) {
      result.set(item.key, baseName)
    } else {
      // Append collision suffix: "Smith et al. 2024 (2).pdf"
      const ext = '.pdf'
      const stem = baseName.slice(0, -ext.length)
      result.set(item.key, `${stem} (${prev + 1})${ext}`)
    }
  }

  return result
}
