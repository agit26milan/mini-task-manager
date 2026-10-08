import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createApp } from './app'
import { createSqliteUnitOfWork } from './repos/sqlite'
import { createTaskService } from './services/taskService'
import { localIsoNoZone } from './time'

const dbPath = resolve(process.env.DB_PATH ?? 'data/app.db')
mkdirSync(dirname(dbPath), { recursive: true })

const repos = createSqliteUnitOfWork(dbPath)
const service = createTaskService({ repos, now: () => localIsoNoZone() })
const app = createApp(service)

const port = Number(process.env.PORT ?? 3000)

const server = app.listen(port, () => {
  console.log(`[server] Task Ledger API siap di http://localhost:${port}  (db: ${dbPath})`)
  console.log('[server] coba: curl http://localhost:%d/tasks', port)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    repos.close()
    process.exit(0)
  })
}
