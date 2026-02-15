import { PaperMetadata } from '../../types/zotero.types'

import { PaperCard } from './PaperCard'

type PaperListProps = {
  papers: PaperMetadata[]
  loading: boolean
  selectedPapers: Map<string, PaperMetadata>
  onToggle: (paper: PaperMetadata) => void
  onOpenPdf: (pdfPath: string) => void
  hasSearchQuery: boolean
}

function LoadingSkeleton() {
  return (
    <div className="smtcmp-library-loading">
      {[1, 2, 3].map((i) => (
        <div key={i} className="smtcmp-library-skeleton-card">
          <div className="smtcmp-library-skeleton-line smtcmp-library-skeleton-type" />
          <div className="smtcmp-library-skeleton-line smtcmp-library-skeleton-title" />
          <div className="smtcmp-library-skeleton-line smtcmp-library-skeleton-authors" />
          <div className="smtcmp-library-skeleton-line smtcmp-library-skeleton-year" />
        </div>
      ))}
    </div>
  )
}

export function PaperList({
  papers,
  loading,
  selectedPapers,
  onToggle,
  onOpenPdf,
  hasSearchQuery,
}: PaperListProps) {
  if (loading) {
    return <LoadingSkeleton />
  }

  if (papers.length === 0 && hasSearchQuery) {
    return (
      <div className="smtcmp-library-empty">
        <div className="smtcmp-library-empty-text">No matching papers</div>
      </div>
    )
  }

  if (papers.length === 0) {
    return (
      <div className="smtcmp-library-empty">
        <div className="smtcmp-library-empty-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </svg>
        </div>
        <div className="smtcmp-library-empty-text">
          No PDFs found in this folder
        </div>
      </div>
    )
  }

  return (
    <div className="smtcmp-library-paper-list">
      {papers.map((paper) => (
        <PaperCard
          key={paper.zoteroKey}
          paper={paper}
          isSelected={selectedPapers.has(paper.zoteroKey)}
          onToggle={onToggle}
          onOpenPdf={onOpenPdf}
        />
      ))}
    </div>
  )
}
