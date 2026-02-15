import { createPortal } from 'react-dom'

type AbstractTooltipProps = {
  abstract: string
  top: number
  left: number
}

export function AbstractTooltip({ abstract, top, left }: AbstractTooltipProps) {
  return createPortal(
    <div
      className="smtcmp-library-abstract-tooltip"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <div className="smtcmp-library-abstract-tooltip-header">Abstract</div>
      <div className="smtcmp-library-abstract-tooltip-content">{abstract}</div>
    </div>,
    document.body,
  )
}
