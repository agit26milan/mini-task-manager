import { z } from 'zod'

export const STATUSES = ['to_do', 'pending', 'in_progress', 'done'] as const

export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  to_do: 'TO_DO',
  pending: 'PENDING',
  in_progress: 'IN_PROGRESS',
  done: 'DONE',
}

export const TRANSITIONS: Record<Status, Status | null> = {
  to_do: 'pending',
  pending: 'in_progress',
  in_progress: 'done',
  done: null,
}

export const NEXT_ACTION_LABEL: Record<Status, string | null> = {
  to_do: 'MULAI PROSES',
  pending: 'KERJAKAN',
  in_progress: 'SELESAIKAN',
  done: null,
}

export function nextStatus(from: Status): Status | null {
  return TRANSITIONS[from]
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from] === to
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

export const ACTORS = [
  { id: 'john.doe', name: 'John Doe' },
  { id: 'ana.maria', name: 'Ana Maria' },
  { id: 'budi.santoso', name: 'Budi Santoso' },
] as const

export type ActorId = (typeof ACTORS)[number]['id']

export function findActor(id: string): { id: string; name: string } | undefined {
  return ACTORS.find((actor) => actor.id === id)
}

export function isKnownActor(id: string): boolean {
  return findActor(id) !== undefined
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: Status
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface LastChange {
  actorId: string
  fromStatus: Status | null
  toStatus: Status
  createdAt: string
}

export interface TaskWithLastChange extends Task {
  lastChange: LastChange | null
  entryCount: number
}

export interface TaskListResponse {
  tasks: TaskWithLastChange[]
  totalEntries: number
}

export interface AuditEntry {
  id: number
  taskId: string
  taskTitle: string
  actorId: string
  actorName: string
  fromStatus: Status | null
  toStatus: Status
  createdAt: string
}

export interface StatusChangeResult {
  changed: boolean
  task: Task
  log: AuditEntry | null
}

export const ERROR_CODES = ['VALIDATION', 'NOT_FOUND', 'INVALID_TRANSITION', 'UNKNOWN_ACTOR', 'INTERNAL'] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    nextStatus?: Status | null
  }
}

export const statusSchema = z.enum(STATUSES)

export const createTaskBodySchema = z.object({
  title: z.string({ required_error: 'title wajib diisi' }).trim().min(1, 'title tidak boleh kosong').max(120),
  description: z.string().trim().max(500, 'description maksimal 500 karakter').optional(),
  actorId: z.string({ required_error: 'actorId wajib diisi' }).min(1, 'actorId wajib diisi'),
})

export const changeStatusBodySchema = z.object({
  to: statusSchema,
  actorId: z.string({ required_error: 'actorId wajib diisi' }).min(1, 'actorId wajib diisi'),
})

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>
export type ChangeStatusBody = z.infer<typeof changeStatusBodySchema>

export function formatAuditLine(entry: AuditEntry): string {
  const when = entry.createdAt.replace('T', ' ').slice(0, 16)
  const from = entry.fromStatus ?? '(baru)'
  return `User "${entry.actorId}" changed Task "${entry.taskTitle}" status from "${from}" to "${entry.toStatus}" at ${when}`
}
