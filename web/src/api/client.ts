import type {
  AuditEntry,
  ErrorBody,
  ErrorCode,
  Status,
  StatusChangeResult,
  Task,
  TaskListResponse,
} from '@mtm/shared'

export interface Actor {
  id: string
  name: string
}

export interface CreatedTask {
  task: Task
  log: AuditEntry
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly nextStatus: Status | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const body = payload as ErrorBody | null
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? `permintaan gagal (HTTP ${response.status})`,
      body?.error?.nextStatus ?? null,
    )
  }

  return payload as T
}

export const api = {
  listActors: () => request<{ actors: Actor[] }>('/actors').then((data) => data.actors),
  listTasks: () => request<TaskListResponse>('/tasks'),
  listAuditLogs: (taskId: string) =>
    request<{ entries: AuditEntry[] }>(`/tasks/${taskId}/audit-logs`).then((data) => data.entries),
  createTask: (input: { title: string; description?: string; actorId: string }) =>
    request<CreatedTask>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  changeStatus: (taskId: string, input: { to: Status; actorId: string }) =>
    request<StatusChangeResult>(`/tasks/${taskId}/status`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteTask: (taskId: string) => request<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
}
