import { useCallback, useRef, useState } from 'react'

import { PaperMetadata } from '../../types/zotero.types'

import { AbstractTooltip } from './AbstractTooltip'

type PaperCardProps = {
  paper: PaperMetadata
  isSelected: boolean
  onToggle: (paper: PaperMetadata) => void
  onOpenPdf: (pdfPath: string) => void
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  journalArticle: 'Article',
  conferencePaper: 'Conference',
  book: 'Book',
  bookSection: 'Book Section',
  thesis: 'Thesis',
  report: 'Report',
  preprint: 'Preprint',
  manuscript: 'Manuscript',
  document: 'Document',
  webpage: 'Web Page',
  presentation: 'Presentation',
}

export function PaperCard({
  paper,
  isSelected,
  onToggle,
  onOpenPdf,
}: PaperCardProps) {
  const [tooltipPos, setTooltipPos] = useState<{
    top: number
    left: number
  } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (paper.abstract) {
      hoverTimer.current = setTimeout(() => {
        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect()
          setTooltipPos({
            top: rect.top,
            left: rect.right + 8,
          })
        }
      }, 300)
    }
  }, [paper.abstract])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setTooltipPos(null)
  }, [])

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.smtcmp-library-paper-checkbox')) return
      onOpenPdf(paper.pdfPath)
    },
    [onOpenPdf, paper.pdfPath],
  )

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle(paper)
    },
    [onToggle, paper],
  )

  const typeLabel =
    ITEM_TYPE_LABELS[paper.itemType] ?? (paper.itemType || '')

  return (
    <div
      ref={cardRef}
      className={`smtcmp-library-paper-card ${isSelected ? 'smtcmp-library-paper-card-selected' : ''}`}
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="smtcmp-library-paper-top-row">
        <button
          className="smtcmp-library-paper-checkbox"
          onClick={handleToggle}
          aria-label={isSelected ? 'Deselect paper' : 'Select paper'}
        >
          <div
            className={`smtcmp-library-checkbox-box ${isSelected ? 'smtcmp-library-checkbox-checked' : ''}`}
          >
            {isSelected && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </div>
        </button>
        {typeLabel && (
          <span className="smtcmp-library-paper-type">{typeLabel}</span>
        )}
      </div>

      <div className="smtcmp-library-paper-title">{paper.title}</div>

      {paper.authors.length > 0 && (
        <div className="smtcmp-library-paper-authors">
          {paper.authors.join(', ')}
        </div>
      )}

      {paper.year && (
        <div className="smtcmp-library-paper-year">{paper.year}</div>
      )}

      {tooltipPos && paper.abstract && (
        <AbstractTooltip
          abstract={paper.abstract}
          top={tooltipPos.top}
          left={tooltipPos.left}
        />
      )}
    </div>
  )
}
