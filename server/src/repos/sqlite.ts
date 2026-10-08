import { DatabaseSync } from 'node:sqlite'

import { ACTORS, type Status } from '@mtm/shared'

import type {
  ActorRecord,
  ActorRepository,
  AuditLogRepository,
  AuditRecord,
  TaskAuditSummary,
  NewAuditRecord,
  TaskRecord,
  TaskRepository,
  UnitOfWork,
} from './types'

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL CHECK (status IN ('to_do','pending','in_progress','done')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS actors (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  task_title  TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_task_time ON audit_logs(task_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
`

export function applySchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL)
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

function syncActors(db: DatabaseSync): void {
  const statement = db.prepare('INSERT INTO actors (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name')
  for (const actor of ACTORS) statement.run(actor.id, actor.name)
}

interface TaskRow {
  id: string
  title: string
  description: string | null
  status: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface AuditRow {
  id: number
  taskId: string
  taskTitle: string
  actorId: string
  actorName: string
  fromStatus: string | null
  toStatus: string
  createdAt: string
}

const TASK_COLUMNS =
  'id, title, description, status, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

const FIRST_TASK_NUMBER = 1038

const AUDIT_COLUMNS =
  'id, task_id AS taskId, task_title AS taskTitle, actor_id AS actorId, actor_name AS actorName, ' +
  'from_status AS fromStatus, to_status AS toStatus, created_at AS createdAt'

function toTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as Status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

function toAudit(row: AuditRow): AuditRecord {
  return {
    id: Number(row.id),
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    actorId: row.actorId,
    actorName: row.actorName,
    fromStatus: row.fromStatus as Status | null,
    toStatus: row.toStatus as Status,
    createdAt: row.createdAt,
  }
}

export function createSqliteUnitOfWork(dbPath: string): UnitOfWork {
  const db = openDatabase(dbPath)
  applySchema(db)
  syncActors(db)

  const actors: ActorRepository = {
    list: () => db.prepare('SELECT id, name FROM actors ORDER BY rowid').all() as unknown as ActorRecord[],
    findById: (id) =>
      (db.prepare('SELECT id, name FROM actors WHERE id = ?').get(id) as unknown as ActorRecord | undefined) ?? null,
  }

  const tasks: TaskRepository = {
    insert: (task) => {
      db.prepare(
        'INSERT INTO tasks (id, title, description, status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(task.id, task.title, task.description, task.status, task.createdAt, task.updatedAt, task.deletedAt)
    },
    findById: (id) => {
      const row = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id) as unknown as TaskRow | undefined
      return row ? toTask(row) : null
    },
    listActive: () => {
      const rows = db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC`)
        .all() as unknown as TaskRow[]
      return rows.map(toTask)
    },
    updateStatus: (id, status, updatedAt) => {
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id)
    },
    markDeleted: (id, deletedAt) => {
      db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id)
    },
    nextId: () => {
      const row = db
        .prepare('SELECT id FROM tasks ORDER BY CAST(substr(id, 4) AS INTEGER) DESC LIMIT 1')
        .get() as unknown as { id: string } | undefined
      if (!row) return `TK-${FIRST_TASK_NUMBER}`
      return `TK-${Number(row.id.slice(3)) + 1}`
    },
  }

  const audit: AuditLogRepository = {
    append: (entry: NewAuditRecord) => {
      const result = db
        .prepare(
          'INSERT INTO audit_logs (task_id, task_title, actor_id, actor_name, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(entry.taskId, entry.taskTitle, entry.actorId, entry.actorName, entry.fromStatus, entry.toStatus, entry.createdAt)
      return { id: Number(result.lastInsertRowid), ...entry }
    },
    listByTask: (taskId) => {
      const rows = db
        .prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_logs WHERE task_id = ? ORDER BY created_at ASC, id ASC`)
        .all(taskId) as unknown as AuditRow[]
      return rows.map(toAudit)
    },
    listTaskSummaries: () => {
      const rows = db
        .prepare(
          `SELECT ae.task_id AS taskId, ae.actor_id AS actorId, ae.from_status AS fromStatus,
                  ae.to_status AS toStatus, ae.created_at AS createdAt, terakhir.total AS total
             FROM audit_logs ae
             JOIN (SELECT task_id, MAX(id) AS last_id, COUNT(*) AS total
                     FROM audit_logs GROUP BY task_id) terakhir
               ON terakhir.last_id = ae.id`,
        )
        .all() as unknown as Array<{
        taskId: string
        actorId: string
        fromStatus: string | null
        toStatus: string
        createdAt: string
        total: number
      }>
      return rows.map(
        (row): TaskAuditSummary => ({
          taskId: row.taskId,
          actorId: row.actorId,
          fromStatus: row.fromStatus as Status | null,
          toStatus: row.toStatus as Status,
          createdAt: row.createdAt,
          total: Number(row.total),
        }),
      )
    },
    countAll: () => {
      const row = db.prepare('SELECT COUNT(*) AS total FROM audit_logs').get() as unknown as { total: number }
      return Number(row.total)
    },
  }

  return {
    actors,
    tasks,
    audit,
    transaction<T>(work: () => T): T {
      db.exec('BEGIN')
      try {
        const result = work()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
