type ConnectionErrorProps = {
  message: string
  onRetry: () => void
}

export function ConnectionError({ message, onRetry }: ConnectionErrorProps) {
  return (
    <div className="smtcmp-library-error">
      <div className="smtcmp-library-error-icon">
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
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <div className="smtcmp-library-error-message">{message}</div>
      <button className="smtcmp-library-error-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
