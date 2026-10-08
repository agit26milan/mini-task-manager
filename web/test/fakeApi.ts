import { TRANSITIONS, type AuditEntry, type Status } from '@mtm/shared'
import { vi } from 'vitest'

export interface FakeTask {
  id: string
  title: string
  description: string | null
  status: Status
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  entryCount: number
  lastChange: { actorId: string; fromStatus: Status | null; toStatus: Status; createdAt: string } | null
}

export interface FakeServer {
  tasks: FakeTask[]
  calls: string[]
  stale: boolean
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const ACTORS = [
  { id: 'john.doe', name: 'John Doe' },
  { id: 'ana.maria', name: 'Ana Maria' },
  { id: 'budi.santoso', name: 'Budi Santoso' },
]

function entriesFor(task: FakeTask): AuditEntry[] {
  return Array.from({ length: task.entryCount }, (_, index) => ({
    id: index + 1,
    taskId: task.id,
    taskTitle: task.title,
    actorId: index === 0 ? 'budi.santoso' : 'john.doe',
    actorName: index === 0 ? 'Budi Santoso' : 'John Doe',
    fromStatus: index === 0 ? null : 'to_do',
    toStatus: index === 0 ? 'to_do' : (task.status as Status),
    createdAt: `2026-10-08T0${8 + index}:00:00`,
  }))
}

export function createFakeServer(seed: Array<{ id: string; title: string; status: Status; entryCount: number }>): FakeServer {
  const state: FakeServer = {
    stale: false,
    calls: [],
    tasks: seed.map((item) => ({
      ...item,
      description: 'deskripsi contoh',
      createdAt: '2026-10-08T08:00:00',
      updatedAt: '2026-10-08T09:00:00',
      deletedAt: null,
      lastChange: { actorId: 'john.doe', fromStatus: null, toStatus: 'to_do', createdAt: '2026-10-08T08:00:00' },
    })),
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    state.calls.push(`${method} ${url}`)

    if (url === '/actors' && method === 'GET') return json({ actors: ACTORS })

    if (url === '/tasks' && method === 'GET') {
      return json({
        tasks: structuredClone(state.tasks),
        totalEntries: state.tasks.reduce((total, task) => total + task.entryCount, 0),
      })
    }

    if (url === '/tasks' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { title: string; description?: string; actorId: string }
      const highest = state.tasks.reduce((max, task) => Math.max(max, Number(task.id.slice(3))), 0)
      const created: FakeTask = {
        id: `TK-${highest + 1}`,
        title: body.title,
        description: body.description ?? null,
        status: 'to_do',
        createdAt: '2026-10-08T11:00:00',
        updatedAt: '2026-10-08T11:00:00',
        deletedAt: null,
        entryCount: 1,
        lastChange: { actorId: body.actorId, fromStatus: null, toStatus: 'to_do', createdAt: '2026-10-08T11:00:00' },
      }
      state.tasks = [created, ...state.tasks]
      return json(
        {
          task: created,
          log: { id: 99, taskId: created.id, taskTitle: created.title, actorId: body.actorId, actorName: 'John Doe', fromStatus: null, toStatus: 'to_do', createdAt: created.createdAt },
        },
        201,
      )
    }

    const statusMatch = /^\/tasks\/([^/]+)\/status$/.exec(url)
    if (statusMatch !== null && method === 'PUT') {
      const id = statusMatch[1] as string
      const task = state.tasks.find((item) => item.id === id)
      const body = JSON.parse(String(init?.body)) as { to: Status; actorId: string }
      if (task === undefined) return json({ error: { code: 'NOT_FOUND', message: 'task tidak ditemukan' } }, 404)

      if (state.stale || body.to === task.status) {
        return json({ changed: false, task, log: null })
      }
      if (TRANSITIONS[task.status] !== body.to) {
        return json(
          {
            error: {
              code: 'INVALID_TRANSITION',
              message: `tidak boleh ${task.status} → ${body.to}: hanya satu langkah`,
              nextStatus: TRANSITIONS[task.status],
            },
          },
          409,
        )
      }

      const from = task.status
      task.status = body.to
      task.entryCount += 1
      const log: AuditEntry = {
        id: 90 + task.entryCount,
        taskId: task.id,
        taskTitle: task.title,
        actorId: body.actorId,
        actorName: 'John Doe',
        fromStatus: from,
        toStatus: body.to,
        createdAt: '2026-10-08T10:00:00',
      }
      task.lastChange = { actorId: log.actorId, fromStatus: from, toStatus: body.to, createdAt: log.createdAt }
      return json({ changed: true, task: structuredClone(task), log })
    }

    const auditMatch = /^\/tasks\/([^/]+)\/audit-logs$/.exec(url)
    if (auditMatch !== null && method === 'GET') {
      const task = state.tasks.find((item) => item.id === auditMatch[1])
      if (task === undefined) return json({ error: { code: 'NOT_FOUND', message: 'tidak ada riwayat' } }, 404)
      return json({ entries: entriesFor(task) })
    }

    const deleteMatch = /^\/tasks\/([^/]+)$/.exec(url)
    if (deleteMatch !== null && method === 'DELETE') {
      state.tasks = state.tasks.filter((item) => item.id !== deleteMatch[1])
      return json(undefined, 204)
    }

    throw new Error(`permintaan tak terduga di test: ${method} ${url}`)
  })

  vi.stubGlobal('fetch', fetchMock)

  return state
}
