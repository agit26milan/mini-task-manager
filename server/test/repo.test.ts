import { afterEach, describe, expect, it } from 'vitest'

import { applySchema, openDatabase } from '../src/repos/sqlite'
import { createHarness, type Harness } from './helpers'

let harness: Harness | null = null

afterEach(() => {
  harness?.cleanup()
  harness = null
})

function makeTask(id: string, status: 'to_do' | 'pending' | 'in_progress' | 'done' = 'to_do') {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status,
    createdAt: '2026-10-08T08:00:00',
    updatedAt: '2026-10-08T08:00:00',
    deletedAt: null,
  }
}

describe('skema', () => {
  it('membuat tiga tabel: tasks, actors, audit_logs', () => {
    harness = createHarness()
    const db = openDatabase(harness.dbPath)
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tasks','actors','audit_logs') ORDER BY name")
      .all() as unknown as Array<{ name: string }>
    expect(rows.map((row) => row.name)).toEqual(['actors', 'audit_logs', 'tasks'])
    db.close()
  })

  it('mencerminkan daftar aktor dari paket shared', () => {
    harness = createHarness()
    expect(harness.repos.actors.list().map((actor) => actor.id)).toEqual(['john.doe', 'ana.maria', 'budi.santoso'])
  })
})

describe('audit log bersifat append-only (ditegakkan database)', () => {
  it('menolak UPDATE dan DELETE lewat koneksi mentah, bukan hanya lewat API', () => {
    harness = createHarness()
    harness.repos.tasks.insert(makeTask('TK-1042'))
    harness.repos.audit.append({
      taskId: 'TK-1042',
      taskTitle: 'Task TK-1042',
      actorId: 'john.doe',
      actorName: 'John Doe',
      fromStatus: null,
      toStatus: 'to_do',
      createdAt: '2026-10-08T08:00:00',
    })

    const raw = openDatabase(harness.dbPath)
    applySchema(raw)

    expect(() => raw.exec("UPDATE audit_logs SET to_status = 'done'")).toThrow(/append-only/i)
    expect(() => raw.exec('DELETE FROM audit_logs')).toThrow(/append-only/i)

    const stillThere = raw.prepare('SELECT to_status AS toStatus FROM audit_logs').all() as unknown as Array<{
      toStatus: string
    }>
    expect(stillThere).toHaveLength(1)
    expect(stillThere[0]?.toStatus).toBe('to_do')
    raw.close()
  })
})

describe('repository', () => {
  it('mengurutkan riwayat secara kronologis naik', () => {
    harness = createHarness()
    harness.repos.tasks.insert(makeTask('TK-1042'))
    const base = {
      taskId: 'TK-1042',
      taskTitle: 'Task TK-1042',
      actorId: 'john.doe',
      actorName: 'John Doe',
    }
    harness.repos.audit.append({ ...base, fromStatus: 'pending', toStatus: 'in_progress', createdAt: '2026-10-08T10:00:00' })
    harness.repos.audit.append({ ...base, fromStatus: null, toStatus: 'to_do', createdAt: '2026-10-08T08:00:00' })
    harness.repos.audit.append({ ...base, fromStatus: 'to_do', toStatus: 'pending', createdAt: '2026-10-08T09:00:00' })

    expect(harness.repos.audit.listByTask('TK-1042').map((entry) => entry.toStatus)).toEqual([
      'to_do',
      'pending',
      'in_progress',
    ])
  })

  it('memberi id berurutan dan melanjutkan dari id terbesar', () => {
    harness = createHarness()
    expect(harness.repos.tasks.nextId()).toBe('TK-1038')
    harness.repos.tasks.insert(makeTask('TK-1042'))
    expect(harness.repos.tasks.nextId()).toBe('TK-1043')
  })

  it('listActive menyembunyikan task terhapus dan menaruh yang terbaru di atas', () => {
    harness = createHarness()
    harness.repos.tasks.insert({ ...makeTask('TK-1038'), updatedAt: '2026-10-08T08:30:00' })
    harness.repos.tasks.insert({ ...makeTask('TK-1042'), updatedAt: '2026-10-08T09:41:00' })
    harness.repos.tasks.insert({ ...makeTask('TK-1040'), deletedAt: '2026-10-08T10:00:00' })

    expect(harness.repos.tasks.listActive().map((task) => task.id)).toEqual(['TK-1042', 'TK-1038'])
  })

  it('membatalkan seluruh transaksi bila ada langkah yang gagal', () => {
    const h = createHarness()
    harness = h
    expect(() =>
      h.repos.transaction(() => {
        h.repos.tasks.insert(makeTask('TK-9999'))
        throw new Error('gagal di tengah jalan')
      }),
    ).toThrow('gagal di tengah jalan')

    expect(h.repos.tasks.findById('TK-9999')).toBeNull()
  })
})
