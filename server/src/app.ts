import express, { type Express } from 'express'

import { createTaskRoutes, errorHandler, notFoundHandler } from './routes/tasks'
import type { TaskService } from './services/taskService'

export function createApp(service: TaskService): Express {
  const app = express()

  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(createTaskRoutes(service))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
