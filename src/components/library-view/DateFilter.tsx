import { useCallback, useState } from 'react'

type DateFilterProps = {
  yearFrom: string
  yearTo: string
  onYearFromChange: (value: string) => void
  onYearToChange: (value: string) => void
}

export function DateFilter({
  yearFrom,
  yearTo,
  onYearFromChange,
  onYearToChange,
}: DateFilterProps) {
  const [isOpen, setIsOpen] = useState(false)

  const hasActiveFilter = yearFrom !== '' || yearTo !== ''

  const handleClear = useCallback(() => {
    onYearFromChange('')
    onYearToChange('')
  }, [onYearFromChange, onYearToChange])

  return (
    <div className="smtcmp-library-date-filter">
      <button
        className={`smtcmp-library-filter-button ${hasActiveFilter ? 'smtcmp-library-filter-button-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="4" y1="21" y2="14" />
          <line x1="4" x2="4" y1="10" y2="3" />
          <line x1="12" x2="12" y1="21" y2="12" />
          <line x1="12" x2="12" y1="8" y2="3" />
          <line x1="20" x2="20" y1="21" y2="16" />
          <line x1="20" x2="20" y1="12" y2="3" />
          <line x1="2" x2="6" y1="14" y2="14" />
          <line x1="10" x2="14" y1="8" y2="8" />
          <line x1="18" x2="22" y1="16" y2="16" />
        </svg>
        <span>Filters</span>
        {hasActiveFilter && (
          <span className="smtcmp-library-filter-badge">1</span>
        )}
      </button>

      {isOpen && (
        <div className="smtcmp-library-filter-dropdown">
          <div className="smtcmp-library-filter-section">
            <label className="smtcmp-library-filter-label">Year range</label>
            <div className="smtcmp-library-filter-year-inputs">
              <input
                type="number"
                className="smtcmp-library-filter-year-input"
                placeholder="From"
                value={yearFrom}
                onChange={(e) => onYearFromChange(e.target.value)}
                min="1900"
                max="2099"
              />
              <span className="smtcmp-library-filter-separator">&ndash;</span>
              <input
                type="number"
                className="smtcmp-library-filter-year-input"
                placeholder="To"
                value={yearTo}
                onChange={(e) => onYearToChange(e.target.value)}
                min="1900"
                max="2099"
              />
            </div>
          </div>
          {hasActiveFilter && (
            <button
              className="smtcmp-library-filter-clear"
              onClick={handleClear}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
