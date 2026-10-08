import type { ErrorCode, Status } from '@mtm/shared'

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode
  abstract readonly httpStatus: number
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION' as const
  readonly httpStatus = 400
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const
  readonly httpStatus = 404
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UnknownActorError extends DomainError {
  readonly code = 'UNKNOWN_ACTOR' as const
  readonly httpStatus = 422
  constructor(actorId: string) {
    super(`aktor "${actorId}" tidak ada di daftar tetap`)
    this.name = 'UnknownActorError'
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION' as const
  readonly httpStatus = 409
  readonly nextStatus: Status | null
  constructor(from: Status, to: Status, nextStatus: Status | null) {
    super(
      nextStatus === null
        ? `tidak boleh ${from} → ${to}: "${from}" sudah status akhir`
        : `tidak boleh ${from} → ${to}: hanya satu langkah, langkah berikutnya "${nextStatus}"`,
    )
    this.name = 'InvalidTransitionError'
    this.nextStatus = nextStatus
  }
}
