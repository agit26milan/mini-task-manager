import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from '../src/app'
import type { ErrorBody } from '@mtm/shared'

import { createHarness, type Harness } from './helpers'

let harness: Harness | null = null

afterEach(() => {
  harness?.cleanup()
  harness = null
})

function start() {
  harness = createHarness()
  return { app: createApp(harness.service), h: harness }
}

async function createTask(app: ReturnType<typeof createApp>, title = 'Prepare Invoice') {
  const response = await request(app).post('/tasks').send({ title, actorId: 'budi.santoso' }).expect(201)
  return response.body as { task: { id: string }; log: { id: number } }
}

describe('GET /actors dan GET /tasks', () => {
  it('mengembalikan daftar aktor tetap dari satu sumber', async () => {
    const { app } = start()
    const response = await request(app).get('/actors').expect(200)
    expect(response.body.actors.map((actor: { id: string }) => actor.id)).toEqual([
      'john.doe',
      'ana.maria',
      'budi.santoso',
    ])
  })

  it('daftar kosong pada awalnya', async () => {
    const { app } = start()
    const response = await request(app).get('/tasks').expect(200)
    expect(response.body.tasks).toEqual([])
  })
})

describe('POST /tasks', () => {
  it('membuat task dan mengembalikan task + entri riwayat', async () => {
    const { app } = start()
    const response = await request(app)
      .post('/tasks')
      .send({ title: 'Prepare Invoice', description: 'Rekap Q1', actorId: 'budi.santoso' })
      .expect(201)

    expect(response.body.task.status).toBe('to_do')
    expect(response.body.task.id).toBe('TK-1038')
    expect(response.body.log.fromStatus).toBeNull()
    expect(response.body.log.toStatus).toBe('to_do')
  })

  it('menolak judul kosong dengan 400', async () => {
    const { app } = start()
    const response = await request(app).post('/tasks').send({ title: '   ', actorId: 'budi.santoso' }).expect(400)
    expect((response.body as ErrorBody).error.code).toBe('VALIDATION')
  })

  it('menolak aktor di luar daftar dengan 422', async () => {
    const { app } = start()
    const response = await request(app).post('/tasks').send({ title: 'Tugas', actorId: 'tamu.asing' }).expect(422)
    expect((response.body as ErrorBody).error.code).toBe('UNKNOWN_ACTOR')
  })

  it('menolak body yang bukan JSON valid dengan 400', async () => {
    const { app } = start()
    await request(app).post('/tasks').set('Content-Type', 'application/json').send('{ bukan json').expect(400)
  })
})

describe('PUT /tasks/:id/status', () => {
  it('memindahkan satu langkah dan mengembalikan task + log', async () => {
    const { app } = start()
    const { task } = await createTask(app)

    const response = await request(app)
      .put(`/tasks/${task.id}/status`)
      .send({ to: 'pending', actorId: 'john.doe' })
      .expect(200)

    expect(response.body).toMatchObject({ changed: true })
    expect(response.body.task.status).toBe('pending')
    expect(response.body.log).toMatchObject({ fromStatus: 'to_do', toStatus: 'pending', actorId: 'john.doe' })
  })

  it('idempoten: status sama → 200 changed:false, log null, jumlah entri tetap', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'pending', actorId: 'john.doe' }).expect(200)
    const before = (await request(app).get(`/tasks/${task.id}/audit-logs`).expect(200)).body.entries.length

    const response = await request(app)
      .put(`/tasks/${task.id}/status`)
      .send({ to: 'pending', actorId: 'ana.maria' })
      .expect(200)

    expect(response.body.changed).toBe(false)
    expect(response.body.log).toBeNull()
    const after = (await request(app).get(`/tasks/${task.id}/audit-logs`).expect(200)).body.entries.length
    expect(after).toBe(before)
  })

  it('lompatan status → 409 dan menyebut langkah berikutnya', async () => {
    const { app } = start()
    const { task } = await createTask(app)

    const response = await request(app)
      .put(`/tasks/${task.id}/status`)
      .send({ to: 'done', actorId: 'john.doe' })
      .expect(409)

    const body = response.body as ErrorBody
    expect(body.error.code).toBe('INVALID_TRANSITION')
    expect(body.error.nextStatus).toBe('pending')
  })

  it('mundur → 409', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    for (const to of ['pending', 'in_progress'] as const) {
      await request(app).put(`/tasks/${task.id}/status`).send({ to, actorId: 'ana.maria' }).expect(200)
    }
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'pending', actorId: 'ana.maria' }).expect(409)
  })

  it('aktor asing → 422', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    const response = await request(app)
      .put(`/tasks/${task.id}/status`)
      .send({ to: 'pending', actorId: 'tamu.asing' })
      .expect(422)
    expect((response.body as ErrorBody).error.code).toBe('UNKNOWN_ACTOR')
  })

  it('task tidak ada → 404', async () => {
    const { app } = start()
    await request(app).put('/tasks/TK-9999/status').send({ to: 'pending', actorId: 'john.doe' }).expect(404)
  })

  it('body tidak valid diperiksa lebih dulu daripada task yang tidak ada (400, bukan 404)', async () => {
    const { app } = start()
    await request(app).put('/tasks/TK-9999/status').send({ actorId: 'john.doe' }).expect(400)
  })

  it('status asing pada body → 400', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'selesai', actorId: 'john.doe' }).expect(400)
  })
})

describe('GET /tasks/:id/audit-logs', () => {
  it('menampilkan riwayat urut naik', async () => {
    const { app, h } = start()
    const { task } = await createTask(app)
    h.setNow('2026-10-08T09:41:00')
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'pending', actorId: 'john.doe' }).expect(200)

    const response = await request(app).get(`/tasks/${task.id}/audit-logs`).expect(200)
    expect(response.body.entries.map((entry: { toStatus: string }) => entry.toStatus)).toEqual(['to_do', 'pending'])
  })

  it('id yang tidak pernah ada → 404', async () => {
    const { app } = start()
    await request(app).get('/tasks/TK-9999/audit-logs').expect(404)
  })

  it('tidak ada jalur untuk mengubah atau menghapus riwayat', async () => {
    const { app } = start()
    await request(app).put('/audit-logs/1').send({ toStatus: 'done' }).expect(404)
    await request(app).delete('/audit-logs/1').expect(404)
  })
})

describe('DELETE /tasks/:id (soft delete)', () => {
  it('menghilangkan task dari daftar tetapi riwayatnya tetap terbaca', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'pending', actorId: 'john.doe' }).expect(200)

    await request(app).delete(`/tasks/${task.id}`).expect(204)
    expect((await request(app).get('/tasks').expect(200)).body.tasks).toEqual([])
    await request(app).get(`/tasks/${task.id}`).expect(404)

    const history = await request(app).get(`/tasks/${task.id}/audit-logs`).expect(200)
    expect(history.body.entries).toHaveLength(2)
    await request(app).put(`/tasks/${task.id}/status`).send({ to: 'in_progress', actorId: 'john.doe' }).expect(404)
  })

  it('task yang sudah dihapus tidak bisa dihapus ulang (404)', async () => {
    const { app } = start()
    const { task } = await createTask(app)
    await request(app).delete(`/tasks/${task.id}`).expect(204)
    await request(app).delete(`/tasks/${task.id}`).expect(404)
  })
})

describe('jalur yang tidak ada', () => {
  it('membalas 404 dengan bentuk error yang sama', async () => {
    const { app } = start()
    const response = await request(app).get('/tidak-ada').expect(404)
    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND')
  })
})
