import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createSqliteUnitOfWork } from '../src/repos/sqlite'
import { createTaskService, type TaskService } from '../src/services/taskService'
import type { UnitOfWork } from '../src/repos/types'

export interface Harness {
  repos: UnitOfWork
  service: TaskService
  dbPath: string
  setNow: (value: string) => void
  cleanup: () => void
}

export function createHarness(): Harness {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'mtm-')), 'app.db')
  const repos = createSqliteUnitOfWork(dbPath)
  let clock = '2026-10-08T08:00:00'
  const service = createTaskService({ repos, now: () => clock })

  return {
    repos,
    service,
    dbPath,
    setNow: (value) => {
      clock = value
    },
    cleanup: () => {
      repos.close()
      rmSync(dirname(dbPath), { recursive: true, force: true })
    },
  }
}
