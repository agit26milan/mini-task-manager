import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { STATUS_LABEL, STATUSES } from '@mtm/shared'

import { StatusLadder } from '../src/components/StatusLadder'

function labelOf(container: HTMLElement, kind: string): string | undefined {
  return container.querySelector(`.step.${kind} .label`)?.textContent ?? undefined
}

describe('StatusLadder', () => {
  it('selalu menggambar empat langkah, dengan penanda langkah sekarang', () => {
    for (const status of STATUSES) {
      const { container, unmount } = render(<StatusLadder status={status} />)
      expect(container.querySelectorAll('.step')).toHaveLength(4)
      expect(labelOf(container, 'current')).toBe(STATUS_LABEL[status])
      unmount()
    }
  })

  it('menandai tepat satu langkah berikutnya, kecuali saat sudah selesai', () => {
    const expectation: Array<[Parameters<typeof StatusLadder>[0]['status'], string | undefined]> = [
      ['to_do', 'PENDING'],
      ['pending', 'IN_PROGRESS'],
      ['in_progress', 'DONE'],
      ['done', undefined],
    ]
    for (const [status, expected] of expectation) {
      const { container, unmount } = render(<StatusLadder status={status} />)
      expect(labelOf(container, 'next')).toBe(expected)
      expect(container.querySelectorAll('.step.next')).toHaveLength(expected === undefined ? 0 : 1)
      unmount()
    }
  })

  it('menyembunyikan langkah yang belum boleh diambil saat diminta (garis silang)', () => {
    const { container } = render(<StatusLadder status="to_do" showBlocked />)
    expect(container.querySelectorAll('.step.blocked')).toHaveLength(2)
  })
})
