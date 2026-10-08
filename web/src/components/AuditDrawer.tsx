import { STATUS_LABEL, formatAuditLine, type AuditEntry, type Status } from '@mtm/shared'

export interface AuditView {
  taskId: string
  title: string
  status: Status
  entries: AuditEntry[]
}

interface Props {
  view: AuditView
  loading: boolean
  onClose: () => void
}

function initials(actorId: string): string {
  const [first = '', second = ''] = actorId.split('.')
  return `${first.charAt(0)}${second.charAt(0)}`.toLowerCase() || '?'
}

function clockOf(iso: string): string {
  return iso.slice(11, 16)
}

export function AuditDrawer({ view, loading, onClose }: Props) {
  return (
    <>
      <button className="drawer-scrim" type="button" aria-label="Tutup riwayat" onClick={onClose} />
      <aside className="drawer" data-testid="audit-drawer" aria-label={`Riwayat ${view.taskId}`}>
        <div className="drawer-head">
          <div className="kicker">AUDIT LOG · URUT KRONOLOGIS NAIK</div>
          <h2>
            #{view.taskId} — {view.title}
          </h2>
          <div className="sub">
            status sekarang <b>{STATUS_LABEL[view.status]}</b> · {view.entries.length} entri
          </div>
          <span className="lock">APPEND-ONLY · TANPA ENDPOINT UBAH/HAPUS</span>
        </div>

        {loading ? (
          <p className="empty">memuat riwayat…</p>
        ) : (
          <ul className="timeline">
            {view.entries.map((entry) => (
              <li key={entry.id} data-testid="audit-entry">
                <div className="tl-time">{clockOf(entry.createdAt)}</div>
                <div className="tl-who">{initials(entry.actorId)}</div>
                <div className="tl-body">
                  <div className="name">{entry.actorName}</div>
                  <div className="move">
                    {entry.fromStatus === null ? (
                      <span className="pill to_do">{STATUS_LABEL[entry.toStatus]} · DIBUAT</span>
                    ) : (
                      <>
                        <span className={`pill ${entry.fromStatus}`}>{STATUS_LABEL[entry.fromStatus]}</span>
                        <span aria-hidden="true">→</span>
                        <span className={`pill ${entry.toStatus}`}>{STATUS_LABEL[entry.toStatus]}</span>
                      </>
                    )}
                  </div>
                  <div className="sentence">{formatAuditLine(entry)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="drawer-foot">
          Entri ini tidak bisa diubah atau dihapus — ditegakkan trigger di database, bukan hanya kesepakatan kode.
          <br />
          Task yang di-soft-delete pun tetap memperlihatkan riwayatnya.
        </div>
      </aside>
    </>
  )
}
