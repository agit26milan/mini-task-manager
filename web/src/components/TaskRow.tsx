import { NEXT_ACTION_LABEL, STATUS_LABEL, nextStatus, type Status, type TaskWithLastChange } from '@mtm/shared'

import { StatusLadder } from './StatusLadder'

interface Props {
  task: TaskWithLastChange
  busy: boolean
  error: string | null
  onAdvance: (task: TaskWithLastChange, to: Status) => void
  onOpenAudit: (task: TaskWithLastChange) => void
  onAskDelete: (task: TaskWithLastChange) => void
}

function clockOf(iso: string): string {
  return iso.slice(11, 16)
}

export function TaskRow({ task, busy, error, onAdvance, onOpenAudit, onAskDelete }: Props) {
  const nextLabel = NEXT_ACTION_LABEL[task.status]
  const target = nextStatus(task.status)
  const last = task.lastChange

  return (
    <article className="row" data-testid="task-row" data-task-id={task.id} data-status={task.status}>
      <div className="row-main">
        <div className="row-top">
          <span className="task-id">#{task.id}</span>
          <h3>{task.title}</h3>
          <span className={`pill ${task.status}`}>{STATUS_LABEL[task.status]}</span>
        </div>

        {task.description === null ? null : <p className="row-desc">{task.description}</p>}

        <StatusLadder status={task.status} />

        <div className="row-meta">
          {last === null ? (
            <span>belum ada riwayat</span>
          ) : (
            <>
              <span>terakhir</span>
              <b>{last.actorId}</b>
              <span className="move">{last.fromStatus === null ? 'dibuat' : `${last.fromStatus} → ${last.toStatus}`}</span>
              <span>· {clockOf(last.createdAt)}</span>
            </>
          )}
          <span>· {task.entryCount} entri riwayat</span>
        </div>

        {error === null ? null : (
          <p className="row-error" data-testid="row-error">
            <span className="code-tag">DITOLAK</span>
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="row-actions">
        {target === null || nextLabel === null ? (
          <button className="btn" type="button" disabled>
            SUDAH SELESAI
          </button>
        ) : (
          <button
            className="btn next"
            type="button"
            data-testid="next-action"
            disabled={busy}
            onClick={() => onAdvance(task, target)}
          >
            → {nextLabel}
          </button>
        )}
        <button className="btn ghost" type="button" data-testid="open-audit" onClick={() => onOpenAudit(task)}>
          RIWAYAT ({task.entryCount})
        </button>
        <button className="btn danger" type="button" onClick={() => onAskDelete(task)}>
          HAPUS
        </button>
      </div>
    </article>
  )
}
