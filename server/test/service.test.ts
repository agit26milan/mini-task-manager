import { afterEach, describe, expect, it } from 'vitest'

import { InvalidTransitionError, NotFoundError, UnknownActorError } from '../src/errors'
import { createHarness, type Harness } from './helpers'

let harness: Harness | null = null

afterEach(() => {
  harness?.cleanup()
  harness = null
})

function start(): Harness {
  harness = createHarness()
  return harness
}

function seedOneTask(service: Harness['service'], actorId = 'budi.santoso') {
  return service.createTask({ title: 'Prepare Invoice', description: 'Rekap tagihan Q1', actorId })
}

describe('createTask', () => {
  it('membuat task berstatus to_do beserta satu entri riwayat "dibuat"', () => {
    const { service } = start()
    const { task, log } = seedOneTask(service)

    expect(task.id).toBe('TK-1038')
    expect(task.status).toBe('to_do')
    expect(log.fromStatus).toBeNull()
    expect(log.toStatus).toBe('to_do')
    expect(log.actorId).toBe('budi.santoso')
    expect(log.actorName).toBe('Budi Santoso')
    expect(log.taskTitle).toBe('Prepare Invoice')
    expect(service.listAuditLogs(task.id)).toHaveLength(1)
  })

  it('menolak aktor di luar daftar tetap', () => {
    const { service } = start()
    expect(() => seedOneTask(service, 'tamu.asing')).toThrow(UnknownActorError)
    expect(service.listTasks().tasks).toHaveLength(0)
  })

  it('memberi id berikutnya untuk task kedua', () => {
    const { service } = start()
    seedOneTask(service)
    expect(service.createTask({ title: 'Task kedua', actorId: 'john.doe' }).task.id).toBe('TK-1039')
  })
})

describe('changeStatus', () => {
  it('memindahkan status satu langkah dan mencatat satu entri baru', () => {
    const { service, setNow } = start()
    const { task } = seedOneTask(service)

    setNow('2026-10-08T09:41:00')
    const result = service.changeStatus(task.id, { to: 'pending', actorId: 'john.doe' })

    expect(result.changed).toBe(true)
    expect(result.task.status).toBe('pending')
    expect(result.task.updatedAt).toBe('2026-10-08T09:41:00')
    expect(result.log?.fromStatus).toBe('to_do')
    expect(result.log?.toStatus).toBe('pending')
    expect(result.log?.actorId).toBe('john.doe')
    expect(service.listAuditLogs(task.id)).toHaveLength(2)
  })

  it('menempuh seluruh alur sampai done', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    for (const to of ['pending', 'in_progress', 'done'] as const) {
      service.changeStatus(task.id, { to, actorId: 'ana.maria' })
    }
    expect(service.getTask(task.id).status).toBe('done')
    expect(service.listAuditLogs(task.id)).toHaveLength(4)
  })

  it('idempoten: status yang sama tidak menambah entri riwayat', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    service.changeStatus(task.id, { to: 'pending', actorId: 'john.doe' })
    const before = service.listAuditLogs(task.id).length

    const again = service.changeStatus(task.id, { to: 'pending', actorId: 'ana.maria' })

    expect(again.changed).toBe(false)
    expect(again.log).toBeNull()
    expect(again.task.status).toBe('pending')
    expect(service.listAuditLogs(task.id)).toHaveLength(before)
  })

  it('menolak lompatan status dan menyebut langkah berikutnya', () => {
    const { service } = start()
    const { task } = seedOneTask(service)

    const run = () => service.changeStatus(task.id, { to: 'done', actorId: 'john.doe' })

    expect(run).toThrow(InvalidTransitionError)
    try {
      run()
    } catch (error) {
      expect((error as InvalidTransitionError).nextStatus).toBe('pending')
      expect((error as InvalidTransitionError).httpStatus).toBe(409)
    }
    expect(service.getTask(task.id).status).toBe('to_do')
    expect(service.listAuditLogs(task.id)).toHaveLength(1)
  })

  it('menolak gerakan mundur', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    for (const to of ['pending', 'in_progress', 'done'] as const) {
      service.changeStatus(task.id, { to, actorId: 'ana.maria' })
    }
    expect(() => service.changeStatus(task.id, { to: 'in_progress', actorId: 'ana.maria' })).toThrow(
      InvalidTransitionError,
    )
  })

  it('menolak aktor asing tanpa mengubah apa pun', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    expect(() => service.changeStatus(task.id, { to: 'pending', actorId: 'tamu.asing' })).toThrow(UnknownActorError)
    expect(service.getTask(task.id).status).toBe('to_do')
    expect(service.listAuditLogs(task.id)).toHaveLength(1)
  })

  it('task tidak ada → NotFoundError (diperiksa sebelum aktor)', () => {
    const { service } = start()
    expect(() => service.changeStatus('TK-9999', { to: 'pending', actorId: 'tamu.asing' })).toThrow(NotFoundError)
  })

  it('atomik: bila penulisan riwayat gagal, status dibatalkan', () => {
    const { repos, service } = start()
    const { task } = seedOneTask(service)
    const before = service.listAuditLogs(task.id).length

    repos.audit.append = () => {
      throw new Error('penyimpanan riwayat penuh')
    }

    expect(() => service.changeStatus(task.id, { to: 'pending', actorId: 'john.doe' })).toThrow('penyimpanan riwayat penuh')
    expect(service.getTask(task.id).status).toBe('to_do')
    expect(service.listAuditLogs(task.id)).toHaveLength(before)
  })
})

describe('soft delete', () => {
  it('menyembunyikan task tapi mempertahankan riwayatnya', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    service.changeStatus(task.id, { to: 'pending', actorId: 'john.doe' })
    const entries = service.listAuditLogs(task.id).length

    service.softDeleteTask(task.id)

    expect(service.listTasks().tasks).toHaveLength(0)
    expect(() => service.getTask(task.id)).toThrow(NotFoundError)
    expect(service.listAuditLogs(task.id)).toHaveLength(entries)
    expect(() => service.changeStatus(task.id, { to: 'in_progress', actorId: 'john.doe' })).toThrow(NotFoundError)
  })

  it('tidak menulis entri baru saat dihapus (hapus bukan perubahan status)', () => {
    const { service } = start()
    const { task } = seedOneTask(service)
    const before = service.listAuditLogs(task.id).length
    service.softDeleteTask(task.id)
    expect(service.listAuditLogs(task.id)).toHaveLength(before)
  })
})

describe('listAuditLogs', () => {
  it('id yang tidak pernah ada tidak punya riwayat', () => {
    const { service } = start()
    expect(() => service.listAuditLogs('TK-9999')).toThrow(NotFoundError)
  })

  it('judul task pada entri lama tidak ikut berubah (snapshot)', () => {
    const { repos, service } = start()
    const { task } = seedOneTask(service)
    repos.tasks.insert({ ...task, id: 'TK-2000', title: 'Judul baru' })
    expect(service.listAuditLogs(task.id)[0]?.taskTitle).toBe('Prepare Invoice')
  })
})
