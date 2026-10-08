import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  STATUSES,
  STATUS_LABEL,
  type Status,
  type TaskListResponse,
  type TaskWithLastChange,
} from '@mtm/shared'

import { ApiError, api, type Actor } from './api/client'
import { AuditDrawer, type AuditView } from './components/AuditDrawer'
import { DeleteDialog, NewTaskDialog } from './components/Dialogs'
import { TaskRow } from './components/TaskRow'
import { Toast, type ToastState } from './components/Toast'

type Filter = 'all' | Status

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return `${error.code} · ${error.message}`
  if (error instanceof Error) return error.message
  return 'terjadi kesalahan yang tidak dikenal'
}

export function App() {
  const [actors, setActors] = useState<Actor[]>([])
  const [actorId, setActorId] = useState('')
  const [board, setBoard] = useState<TaskListResponse>({ tasks: [], totalEntries: 0 })
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<ToastState | null>(null)

  const [audit, setAudit] = useState<AuditView | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTaskError, setNewTaskError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [askDelete, setAskDelete] = useState<TaskWithLastChange | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [actorList, taskBoard] = await Promise.all([api.listActors(), api.listTasks()])
      setActors(actorList)
      setBoard(taskBoard)
      setActorId((current) => current || actorList[0]?.id || '')
      setLoadError(null)
    } catch (error) {
      setLoadError(messageOf(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshAudit = useCallback(async (task: { id: string; title: string; status: Status }) => {
    setAuditLoading(true)
    try {
      const entries = await api.listAuditLogs(task.id)
      setAudit({ taskId: task.id, title: task.title, status: task.status, entries })
    } catch (error) {
      setToast({ tone: 'warn', title: 'GAGAL MEMUAT RIWAYAT', detail: messageOf(error) })
    } finally {
      setAuditLoading(false)
    }
  }, [])

  async function advance(task: TaskWithLastChange, to: Status) {
    if (actorId === '') return
    setBusyTaskId(task.id)
    setRowErrors((current) => {
      const next = { ...current }
      delete next[task.id]
      return next
    })

    try {
      const result = await api.changeStatus(task.id, { to, actorId })

      setBoard((current) => ({
        tasks: current.tasks.map((item) =>
          item.id === task.id
            ? {
                ...result.task,
                entryCount: item.entryCount + (result.changed ? 1 : 0),
                lastChange:
                  result.changed && result.log !== null
                    ? {
                        actorId: result.log.actorId,
                        fromStatus: result.log.fromStatus,
                        toStatus: result.log.toStatus,
                        createdAt: result.log.createdAt,
                      }
                    : item.lastChange,
              }
            : item,
        ),
        totalEntries: current.totalEntries + (result.changed ? 1 : 0),
      }))

      setToast(
        result.changed
          ? {
              tone: 'ok',
              title: 'STATUS DIUBAH',
              detail: `LOG #${result.log?.id ?? '-'} DICATAT · ${actorId} · ${STATUS_LABEL[task.status]} → ${STATUS_LABEL[to]}`,
            }
          : {
              tone: 'quiet',
              title: `SUDAH DI ${STATUS_LABEL[to]}`,
              detail: 'TIDAK ADA LOG BARU · changed:false',
            },
      )

      if (audit?.taskId === task.id) {
        await refreshAudit({ id: result.task.id, title: result.task.title, status: result.task.status })
      }
    } catch (error) {
      const detail =
        error instanceof ApiError
          ? `${error.code} · ${error.message}${error.nextStatus === null ? '' : ` (langkah berikutnya: ${STATUS_LABEL[error.nextStatus]})`}`
          : messageOf(error)
      setRowErrors((current) => ({ ...current, [task.id]: detail }))
      setToast({ tone: 'warn', title: 'DITOLAK', detail })
    } finally {
      setBusyTaskId(null)
    }
  }

  async function confirmDelete() {
    if (askDelete === null) return
    try {
      await api.deleteTask(askDelete.id)
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.filter((item) => item.id !== askDelete.id),
      }))
      if (audit?.taskId === askDelete.id) setAudit(null)
      setToast({ tone: 'quiet', title: 'TASK DIHAPUS', detail: 'Task disembunyikan · riwayatnya tetap tersimpan' })
    } catch (error) {
      setToast({ tone: 'warn', title: 'GAGAL MENGHAPUS', detail: messageOf(error) })
    } finally {
      setAskDelete(null)
    }
  }

  async function createTask(input: { title: string; description: string }) {
    if (actorId === '') return
    setCreating(true)
    setNewTaskError(null)
    try {
      const { task } = await api.createTask({
        title: input.title,
        description: input.description.trim() === '' ? undefined : input.description,
        actorId,
      })
      setBoard(await api.listTasks())
      setNewTaskOpen(false)
      setToast({ tone: 'ok', title: 'TASK DIBUAT', detail: `${task.id} · ${task.title}` })
    } catch (error) {
      setNewTaskError(messageOf(error))
    } finally {
      setCreating(false)
    }
  }

  const counts = useMemo(() => {
    const base = { all: board.tasks.length } as Record<Filter, number>
    for (const status of STATUSES) base[status] = board.tasks.filter((task) => task.status === status).length
    return base
  }, [board.tasks])

  const visibleTasks = useMemo(
    () => (filter === 'all' ? board.tasks : board.tasks.filter((task) => task.status === filter)),
    [board.tasks, filter],
  )

  return (
    <div className="app">
      <header className="mast">
        <div>
          <div className="kicker">MINI TASK MANAGER · INTERNAL</div>
          <h1>Task Ledger</h1>
        </div>
        <div className="mstats">
          <b data-testid="total-entries">{board.totalEntries}</b>
          <span>gerakan tercatat</span>
        </div>
        <div className="actor-box">
          <label htmlFor="actor">BERTINDAK SEBAGAI</label>
          <select id="actor" value={actorId} onChange={(event) => setActorId(event.target.value)}>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.id} — {actor.name}
              </option>
            ))}
          </select>
          <div className={actorId === '' ? 'hint error' : 'hint'}>
            {actorId === '' ? 'daftar aktor belum termuat' : 'aktor dari daftar tetap · server menolak 422 kalau tak dikenal'}
          </div>
        </div>
      </header>

      {loadError === null ? null : (
        <p className="load-error" role="alert">
          Gagal memuat data: {loadError}. Pastikan server berjalan di :3000 (<code>npm run dev</code>).
        </p>
      )}

      <div className="tools">
        <button className="chip" type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          SEMUA <b>{counts.all}</b>
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            className="chip"
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {STATUS_LABEL[status]} <b>{counts[status]}</b>
          </button>
        ))}
        <span className="spacer" />
        <button className="btn primary" type="button" onClick={() => setNewTaskOpen(true)}>
          + TASK BARU
        </button>
      </div>

      <div className="board">
        <div className="list">
          {loading ? (
            <p className="empty">memuat task…</p>
          ) : visibleTasks.length === 0 ? (
            <p className="empty">
              <b>Belum ada task di sini.</b>
              <br />
              Buat task lewat tombol “+ TASK BARU” — atau jalankan <code>npm run seed</code> untuk data contoh.
            </p>
          ) : (
            visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busyTaskId === task.id}
                error={rowErrors[task.id] ?? null}
                onAdvance={(item, to) => void advance(item, to)}
                onOpenAudit={(item) =>
                  void refreshAudit({ id: item.id, title: item.title, status: item.status })
                }
                onAskDelete={(item) => setAskDelete(item)}
              />
            ))
          )}
        </div>
      </div>

      {audit === null ? null : (
        <AuditDrawer view={audit} loading={auditLoading} onClose={() => setAudit(null)} />
      )}

      {newTaskOpen ? (
        <NewTaskDialog
          busy={creating}
          error={newTaskError}
          onCancel={() => {
            setNewTaskOpen(false)
            setNewTaskError(null)
          }}
          onSubmit={(input) => void createTask(input)}
        />
      ) : null}

      {askDelete === null ? null : (
        <DeleteDialog
          task={askDelete}
          busy={busyTaskId === askDelete.id}
          onCancel={() => setAskDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {toast === null ? null : <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
