import { Router, type NextFunction, type Request, type Response } from 'express'
import { changeStatusBodySchema, createTaskBodySchema, type ErrorBody } from '@mtm/shared'
import type { ZodType } from 'zod'

import { DomainError, InvalidTransitionError, ValidationError } from '../errors'
import type { TaskService } from '../services/taskService'

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw new ValidationError(detail)
  }
  return result.data
}

function handle(handler: (req: Request, res: Response) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      handler(req, res)
    } catch (error) {
      next(error)
    }
  }
}

export function createTaskRoutes(service: TaskService): Router {
  const router = Router()

  router.get(
    '/actors',
    handle((_req, res) => {
      res.json({ actors: service.listActors() })
    }),
  )

  router.get(
    '/tasks',
    handle((_req, res) => {
      res.json(service.listTasks())
    }),
  )

  router.get(
    '/tasks/:id',
    handle((req, res) => {
      res.json({ task: service.getTask(req.params.id) })
    }),
  )

  router.post(
    '/tasks',
    handle((req, res) => {
      const body = parseBody(createTaskBodySchema, req.body)
      const { task, log } = service.createTask(body)
      res.status(201).json({ task, log })
    }),
  )

  router.put(
    '/tasks/:id/status',
    handle((req, res) => {
      const body = parseBody(changeStatusBodySchema, req.body)
      res.json(service.changeStatus(req.params.id, body))
    }),
  )

  router.get(
    '/tasks/:id/audit-logs',
    handle((req, res) => {
      res.json({ entries: service.listAuditLogs(req.params.id) })
    }),
  )

  router.delete(
    '/tasks/:id',
    handle((req, res) => {
      service.softDeleteTask(req.params.id)
      res.status(204).end()
    }),
  )

  return router
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    error: { code: 'NOT_FOUND', message: `jalur ${req.method} ${req.path} tidak ada` },
  }
  res.status(404).json(body)
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof DomainError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message } }
    if (error instanceof InvalidTransitionError) body.error.nextStatus = error.nextStatus
    res.status(error.httpStatus).json(body)
    return
  }

  if (error instanceof SyntaxError && 'body' in error) {
    const body: ErrorBody = { error: { code: 'VALIDATION', message: 'body bukan JSON yang valid' } }
    res.status(400).json(body)
    return
  }

  console.error('[server] error tak terduga:', error)
  const body: ErrorBody = { error: { code: 'INTERNAL', message: 'terjadi kesalahan tak terduga' } }
  res.status(500).json(body)
}
