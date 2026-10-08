import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Status, TaskWithLastChange } from '@mtm/shared'

import { TaskRow } from '../src/components/TaskRow'

function makeTask(status: Status, overrides: Partial<TaskWithLastChange> = {}): TaskWithLastChange {
  return {
    id: 'TK-1042',
    title: 'Prepare Invoice',
    description: 'Rekap tagihan Q1',
    status,
    createdAt: '2026-10-08T09:12:00',
    updatedAt: '2026-10-08T09:41:00',
    deletedAt: null,
    entryCount: 2,
    lastChange: {
      actorId: 'john.doe',
      fromStatus: 'to_do',
      toStatus: status,
      createdAt: '2026-10-08T09:41:00',
    },
    ...overrides,
  }
}

const noop = () => {}

afterEach(() => {
  cleanup()
})

describe('TaskRow', () => {
  it('menampilkan identitas task, status, ringkasan riwayat terakhir, dan jumlah entri', () => {
    const { container } = render(
      <TaskRow task={makeTask('pending')} busy={false} error={null} onAdvance={noop} onOpenAudit={noop} onAskDelete={noop} />,
    )

    expect(screen.getByText('#TK-1042')).toBeInTheDocument()
    expect(screen.getByText('Prepare Invoice')).toBeInTheDocument()
    expect(container.querySelector('.pill')?.textContent).toBe('PENDING')
    expect(container.querySelector('.step.current .label')?.textContent).toBe('PENDING')
    expect(screen.getByText('terakhir')).toBeInTheDocument()
    expect(screen.getByText('john.doe')).toBeInTheDocument()
    expect(screen.getByText('to_do → pending')).toBeInTheDocument()
    expect(container.textContent).toContain('2 entri riwayat')
    expect(screen.getByRole('button', { name: 'RIWAYAT (2)' })).toBeInTheDocument()
  })

  it('menawarkan tepat satu aksi berikutnya, sesuai tabel transisi', async () => {
    const onAdvance = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskRow
        task={makeTask('to_do')}
        busy={false}
        error={null}
        onAdvance={onAdvance}
        onOpenAudit={noop}
        onAskDelete={noop}
      />,
    )

    await user.click(screen.getByTestId('next-action'))
    expect(onAdvance).toHaveBeenCalledWith(expect.objectContaining({ id: 'TK-1042' }), 'pending')
  })

  it('tidak merender aksi ilegal saat task sudah selesai (tidak ada jalan menuju 409 dari UI)', () => {
    render(
      <TaskRow task={makeTask('done')} busy={false} error={null} onAdvance={noop} onOpenAudit={noop} onAskDelete={noop} />,
    )

    expect(screen.queryByTestId('next-action')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SUDAH SELESAI' })).toBeDisabled()
  })

  it('menampilkan penolakan dari server di baris task, bukan sebagai pesan global', () => {
    render(
      <TaskRow
        task={makeTask('pending')}
        busy={false}
        error={'INVALID_TRANSITION · tidak boleh pending → done (langkah berikutnya: IN_PROGRESS)'}
        onAdvance={noop}
        onOpenAudit={noop}
        onAskDelete={noop}
      />,
    )

    expect(screen.getByTestId('row-error')).toHaveTextContent('langkah berikutnya: IN_PROGRESS')
  })

  it('menonaktifkan tombol selagi permintaan berjalan', () => {
    render(
      <TaskRow task={makeTask('pending')} busy error={null} onAdvance={noop} onOpenAudit={noop} onAskDelete={noop} />,
    )
    expect(screen.getByTestId('next-action')).toBeDisabled()
  })
})
