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
