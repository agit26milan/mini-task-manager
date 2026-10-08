import {
  TRANSITIONS,
  type AuditEntry,
  type ChangeStatusBody,
  type CreateTaskBody,
  type StatusChangeResult,
  type Task,
  type TaskListResponse,
  type TaskWithLastChange,
} from '@mtm/shared'

import { InvalidTransitionError, NotFoundError, UnknownActorError } from '../errors'
import type { AuditRecord, TaskRecord, UnitOfWork } from '../repos/types'

export interface TaskServiceDeps {
  repos: UnitOfWork
  now: () => string
}

export interface TaskService {
  listActors(): { id: string; name: string }[]
  listTasks(): TaskListResponse
  getTask(id: string): Task
  createTask(input: CreateTaskBody): { task: Task; log: AuditEntry }
  changeStatus(id: string, input: ChangeStatusBody): StatusChangeResult
  softDeleteTask(id: string): void
  listAuditLogs(taskId: string): AuditEntry[]
}

function toTask(record: TaskRecord): Task {
  return { ...record }
}

function toEntry(record: AuditRecord): AuditEntry {
  return { ...record }
}

export function createTaskService({ repos, now }: TaskServiceDeps): TaskService {
  function requireActiveTask(id: string): TaskRecord {
    const task = repos.tasks.findById(id)
    if (task === null || task.deletedAt !== null) {
      throw new NotFoundError(`task "${id}" tidak ditemukan`)
    }
    return task
  }

  function requireActor(actorId: string): { id: string; name: string } {
    const actor = repos.actors.findById(actorId)
    if (actor === null) throw new UnknownActorError(actorId)
    return actor
  }

  return {
    listActors: () => repos.actors.list(),

    listTasks: () => {
      const summaries = new Map(repos.audit.listTaskSummaries().map((summary) => [summary.taskId, summary]))

      const tasks: TaskWithLastChange[] = repos.tasks.listActive().map((record) => {
        const summary = summaries.get(record.id)
        return {
          ...toTask(record),
          entryCount: summary?.total ?? 0,
          lastChange:
            summary === undefined
              ? null
              : {
                  actorId: summary.actorId,
                  fromStatus: summary.fromStatus,
                  toStatus: summary.toStatus,
                  createdAt: summary.createdAt,
                },
        }
      })

      return { tasks, totalEntries: repos.audit.countAll() }
    },

    getTask: (id) => toTask(requireActiveTask(id)),

    createTask: (input) => {
      const actor = requireActor(input.actorId)
      const timestamp = now()
      const task: TaskRecord = {
        id: repos.tasks.nextId(),
        title: input.title,
        description: input.description ?? null,
        status: 'to_do',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }

      return repos.transaction(() => {
        repos.tasks.insert(task)
        const log = repos.audit.append({
          taskId: task.id,
          taskTitle: task.title,
          actorId: actor.id,
          actorName: actor.name,
          fromStatus: null,
          toStatus: 'to_do',
          createdAt: timestamp,
        })
        return { task: toTask(task), log: toEntry(log) }
      })
    },

    changeStatus: (id, input) => {
      const task = requireActiveTask(id)
      const actor = requireActor(input.actorId)

      if (task.status === input.to) {
        return { changed: false, task: toTask(task), log: null }
      }

      if (TRANSITIONS[task.status] !== input.to) {
        throw new InvalidTransitionError(task.status, input.to, TRANSITIONS[task.status])
      }

      const timestamp = now()
      return repos.transaction(() => {
        repos.tasks.updateStatus(task.id, input.to, timestamp)
        const log = repos.audit.append({
          taskId: task.id,
          taskTitle: task.title,
          actorId: actor.id,
          actorName: actor.name,
          fromStatus: task.status,
          toStatus: input.to,
          createdAt: timestamp,
        })
        return {
          changed: true,
          task: toTask({ ...task, status: input.to, updatedAt: timestamp }),
          log: toEntry(log),
        }
      })
    },

    softDeleteTask: (id) => {
      const task = requireActiveTask(id)
      repos.transaction(() => {
        repos.tasks.markDeleted(task.id, now())
      })
    },

    listAuditLogs: (taskId) => {
      const entries = repos.audit.listByTask(taskId)
      if (entries.length === 0 && repos.tasks.findById(taskId) === null) {
        throw new NotFoundError(`tidak ada riwayat untuk task "${taskId}"`)
      }
      return entries.map(toEntry)
    },
  }
}
