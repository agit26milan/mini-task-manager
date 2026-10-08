import type { Status } from '@mtm/shared'

export interface TaskRecord {
  id: string
  title: string
  description: string | null
  status: Status
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface AuditRecord {
  id: number
  taskId: string
  taskTitle: string
  actorId: string
  actorName: string
  fromStatus: Status | null
  toStatus: Status
  createdAt: string
}

export type NewAuditRecord = Omit<AuditRecord, 'id'>

export interface TaskAuditSummary {
  taskId: string
  actorId: string
  fromStatus: Status | null
  toStatus: Status
  createdAt: string
  total: number
}

export interface ActorRecord {
  id: string
  name: string
}

export interface ActorRepository {
  list(): ActorRecord[]
  findById(id: string): ActorRecord | null
}

export interface TaskRepository {
  insert(task: TaskRecord): void
  findById(id: string): TaskRecord | null
  listActive(): TaskRecord[]
  updateStatus(id: string, status: Status, updatedAt: string): void
  markDeleted(id: string, deletedAt: string): void
  nextId(): string
}

export interface AuditLogRepository {
  append(entry: NewAuditRecord): AuditRecord
  listByTask(taskId: string): AuditRecord[]
  listTaskSummaries(): TaskAuditSummary[]
  countAll(): number
}

export interface UnitOfWork {
  actors: ActorRepository
  tasks: TaskRepository
  audit: AuditLogRepository
  transaction<T>(work: () => T): T
  close(): void
}
