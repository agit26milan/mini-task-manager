import { useState } from 'react'

import type { TaskWithLastChange } from '@mtm/shared'

interface NewTaskProps {
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (input: { title: string; description: string }) => void
}

export function NewTaskDialog({ busy, error, onCancel, onSubmit }: NewTaskProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="dialog-scrim">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ title, description })
        }}
      >
        <h2>Task baru</h2>
        <p>Status awal selalu TO_DO, dan satu entri riwayat “dibuat” langsung tercatat.</p>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="new-title">JUDUL</label>
          <input
            id="new-title"
            value={title}
            autoFocus
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="mis. Prepare Invoice"
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="new-description">DESKRIPSI (opsional)</label>
          <textarea
            id="new-description"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {error === null ? null : <p className="hint error">{error}</p>}

        <div className="dialog-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>
            BATAL
          </button>
          <button className="btn primary" type="submit" disabled={busy || title.trim() === ''}>
            {busy ? 'MENYIMPAN…' : 'SIMPAN TASK'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface DeleteProps {
  task: TaskWithLastChange
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteDialog({ task, busy, onCancel, onConfirm }: DeleteProps) {
  return (
    <div className="dialog-scrim">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Hapus ${task.id}`}>
        <h2>
          Hapus #{task.id} {task.title}?
        </h2>
        <p>
          Task ditandai <code>deletedAt</code> dan hilang dari daftar. <b>{task.entryCount} entri riwayatnya tetap
          tersimpan permanen</b> dan masih bisa dibaca lewat endpoint audit.
        </p>
        <div className="dialog-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>
            BATAL
          </button>
          <button className="btn danger" type="button" style={{ borderStyle: 'solid' }} disabled={busy} onClick={onConfirm}>
            HAPUS
          </button>
        </div>
      </div>
    </div>
  )
}
