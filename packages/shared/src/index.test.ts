import { describe, expect, it } from 'vitest'

import {
  ACTORS,
  STATUSES,
  STATUS_LABEL,
  TRANSITIONS,
  canTransition,
  changeStatusBodySchema,
  createTaskBodySchema,
  findActor,
  formatAuditLine,
  isKnownActor,
  isStatus,
  nextStatus,
} from './index'
import type { AuditEntry, Status } from './index'

describe('status', () => {
  it('urutannya tetap dan berjumlah empat', () => {
    expect(STATUSES).toEqual(['to_do', 'pending', 'in_progress', 'done'])
    expect(STATUSES).toHaveLength(4)
  })

  it('setiap status punya label tampilan', () => {
    for (const status of STATUSES) {
      expect(STATUS_LABEL[status]).toBe(status.toUpperCase())
    }
  })

  it('tabel transisi menunjuk tepat satu langkah berikutnya', () => {
    expect(TRANSITIONS.to_do).toBe('pending')
    expect(TRANSITIONS.pending).toBe('in_progress')
    expect(TRANSITIONS.in_progress).toBe('done')
    expect(TRANSITIONS.done).toBeNull()
  })

  it('nextStatus mengikuti urutan, done tidak punya lanjutan', () => {
    expect(nextStatus('to_do')).toBe('pending')
    expect(nextStatus('done')).toBeNull()
  })

  it('hanya pasangan berurutan yang boleh (tanpa lompat, tanpa mundur)', () => {
    const legal: Array<[Status, Status]> = [
      ['to_do', 'pending'],
      ['pending', 'in_progress'],
      ['in_progress', 'done'],
    ]
    for (const [from, to] of legal) {
      expect(canTransition(from, to)).toBe(true)
    }
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const isLegal = legal.some(([f, t]) => f === from && t === to)
        if (!isLegal) expect(canTransition(from, to)).toBe(false)
      }
    }
    expect(canTransition('to_do', 'done')).toBe(false)
    expect(canTransition('done', 'in_progress')).toBe(false)
    expect(canTransition('pending', 'pending')).toBe(false)
  })

  it('isStatus memfilter nilai asing', () => {
    expect(isStatus('pending')).toBe(true)
    expect(isStatus('PENDING')).toBe(false)
    expect(isStatus(null)).toBe(false)
    expect(isStatus(3)).toBe(false)
  })
})

describe('aktor', () => {
  it('daftar tetap berisi tiga orang dengan id dan nama', () => {
    expect(ACTORS.map((actor) => actor.id)).toEqual(['john.doe', 'ana.maria', 'budi.santoso'])
    for (const actor of ACTORS) expect(actor.name.length).toBeGreaterThan(2)
  })

  it('findActor menemukan yang ada dan mengabaikan yang asing', () => {
    expect(findActor('john.doe')?.name).toBe('John Doe')
    expect(findActor('tamu.asing')).toBeUndefined()
  })

  it('isKnownActor menolak aktor di luar daftar', () => {
    expect(isKnownActor('ana.maria')).toBe(true)
    expect(isKnownActor('tamu.asing')).toBe(false)
    expect(isKnownActor('')).toBe(false)
  })
})

describe('skema permintaan', () => {
  it('createTask menerima judul dan memangkas spasi', () => {
    const parsed = createTaskBodySchema.parse({ title: '  Prepare Invoice  ', actorId: 'budi.santoso' })
    expect(parsed.title).toBe('Prepare Invoice')
    expect(parsed.actorId).toBe('budi.santoso')
  })

  it('createTask menolak judul kosong / hanya spasi', () => {
    expect(createTaskBodySchema.safeParse({ title: '', actorId: 'budi.santoso' }).success).toBe(false)
    expect(createTaskBodySchema.safeParse({ title: '   ', actorId: 'budi.santoso' }).success).toBe(false)
    expect(createTaskBodySchema.safeParse({ actorId: 'budi.santoso' }).success).toBe(false)
  })

  it('createTask menolak judul terlalu panjang', () => {
    expect(createTaskBodySchema.safeParse({ title: 'x'.repeat(121), actorId: 'budi.santoso' }).success).toBe(false)
  })

  it('createTask menolak permintaan tanpa aktor', () => {
    expect(createTaskBodySchema.safeParse({ title: 'Tanpa aktor' }).success).toBe(false)
    expect(createTaskBodySchema.safeParse({ title: 'Tanpa aktor', actorId: '' }).success).toBe(false)
  })

  it('changeStatus menerima status sah + actorId', () => {
    const parsed = changeStatusBodySchema.parse({ to: 'in_progress', actorId: 'ana.maria' })
    expect(parsed).toEqual({ to: 'in_progress', actorId: 'ana.maria' })
  })

  it('changeStatus menolak status asing dan actorId kosong', () => {
    expect(changeStatusBodySchema.safeParse({ to: 'selesai', actorId: 'ana.maria' }).success).toBe(false)
    expect(changeStatusBodySchema.safeParse({ to: 'done' }).success).toBe(false)
    expect(changeStatusBodySchema.safeParse({ to: 'done', actorId: '' }).success).toBe(false)
  })
})

describe('formatAuditLine', () => {
  it('menghasilkan kalimat sesuai contoh di spesifikasi', () => {
    const entry: AuditEntry = {
      id: 2,
      taskId: 'TK-1042',
      taskTitle: 'Prepare Invoice',
      actorId: 'john.doe',
      actorName: 'John Doe',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      createdAt: '2025-01-01T10:00:00.000Z',
    }
    expect(formatAuditLine(entry)).toBe(
      'User "john.doe" changed Task "Prepare Invoice" status from "pending" to "in_progress" at 2025-01-01 10:00',
    )
  })

  it('menandai entri pembuatan task dengan (baru)', () => {
    const entry: AuditEntry = {
      id: 1,
      taskId: 'TK-1042',
      taskTitle: 'Prepare Invoice',
      actorId: 'budi.santoso',
      actorName: 'Budi Santoso',
      fromStatus: null,
      toStatus: 'to_do',
      createdAt: '2025-01-01T09:00:00.000Z',
    }
    expect(formatAuditLine(entry)).toContain('from "(baru)" to "to_do"')
  })
})
