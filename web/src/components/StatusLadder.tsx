import { STATUSES, STATUS_LABEL, TRANSITIONS, type Status } from '@mtm/shared'

interface Props {
  status: Status
  showBlocked?: boolean
}

export function StatusLadder({ status, showBlocked = false }: Props) {
  const currentIndex = STATUSES.indexOf(status)
  const next = TRANSITIONS[status]

  return (
    <div className="ladder" data-testid="status-ladder" data-status={status} role="list" aria-label={`angkah status ${STATUS_LABEL[status]}`}>
      {STATUSES.map((step, index) => {
        const kind =
          index < currentIndex ? 'done' : index === currentIndex ? 'current' : step === next ? 'next' : showBlocked ? 'blocked' : 'todo'
        return (
          <div className={`step ${kind}`} role="listitem" key={step}>
            <div className="bar" />
            <span className="label">{STATUS_LABEL[step]}</span>
          </div>
        )
      })}
    </div>
  )
}
