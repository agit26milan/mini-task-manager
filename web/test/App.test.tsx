import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/App'
import { createFakeServer } from './fakeApi'

const SEED = [
  { id: 'TK-1042', title: 'Prepare Invoice', status: 'pending' as const, entryCount: 2 },
  { id: 'TK-1041', title: 'Audit hak akses NAS', status: 'in_progress' as const, entryCount: 3 },
  { id: 'TK-1039', title: 'Perbaiki template email', status: 'done' as const, entryCount: 4 },
]

let server: ReturnType<typeof createFakeServer>

beforeEach(() => {
  server = createFakeServer(SEED)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function rowOf(taskId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (row === null) throw new Error(`baris ${taskId} tidak ditemukan`)
  return row
}

async function renderApp() {
  render(<App />)
  await screen.findByText('Prepare Invoice')
}

describe('daftar task', () => {
  it('memuat task dari server dan menampilkan angka total gerakan', async () => {
    await renderApp()

    expect(screen.getByTestId('total-entries')).toHaveTextContent('9')
    expect(rowOf('TK-1042')).toBeInTheDocument()
    expect(rowOf('TK-1041')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SEMUA/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('angkat status pada baris menandai langkah sekarang dan langkah berikutnya', async () => {
    await renderApp()

    const row = rowOf('TK-1042')
    expect(row.dataset.status).toBe('pending')
    expect(row.querySelector('.step.current .label')?.textContent).toBe('PENDING')
    expect(row.querySelector('.step.next .label')?.textContent).toBe('IN_PROGRESS')
  })

  it('menyaring daftar lewat chip status', async () => {
    await renderApp()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^DONE/ }))
    expect(screen.queryByText('Prepare Invoice')).not.toBeInTheDocument()
    expect(screen.getByText('Perbaiki template email')).toBeInTheDocument()
  })
})

describe('mengubah status', () => {
  it('memajukan satu langkah: angkah bergerak, entri bertambah, dan toast menyebut log baru', async () => {
    await renderApp()
    const user = userEvent.setup()

    await user.click(within(rowOf('TK-1042')).getByTestId('next-action'))

    await waitFor(() => expect(rowOf('TK-1042').dataset.status).toBe('in_progress'))
    expect(rowOf('TK-1042').querySelector('.step.current .label')?.textContent).toBe('IN_PROGRESS')
    expect(rowOf('TK-1042').textContent).toContain('3 entri riwayat')
    expect(screen.getByTestId('total-entries')).toHaveTextContent('10')

    const toast = screen.getByTestId('toast')
    expect(toast).toHaveAttribute('data-tone', 'ok')
    expect(toast).toHaveTextContent('STATUS DIUBAH')
    expect(toast).toHaveTextContent('LOG #93 DICATAT')

    expect(server.calls).toContain('PUT /tasks/TK-1042/status')
  })

  it('idempoten: bila server menyatakan tidak berubah, tidak ada entri baru yang diklaim', async () => {
    server.stale = true
    await renderApp()
    const user = userEvent.setup()

    await user.click(within(rowOf('TK-1042')).getByTestId('next-action'))

    await waitFor(() => expect(screen.getByTestId('toast')).toHaveAttribute('data-tone', 'quiet'))
    const toast = screen.getByTestId('toast')
    expect(toast).toHaveTextContent('TIDAK ADA LOG BARU')
    expect(toast).toHaveTextContent('changed:false')

    expect(rowOf('TK-1042').dataset.status).toBe('pending')
    expect(within(rowOf('TK-1042')).getByText('· 2 entri riwayat')).toBeInTheDocument()
    expect(screen.getByTestId('total-entries')).toHaveTextContent('9')
  })
})

describe('riwayat per task', () => {
  it('membuka panel riwayat berisi entri kronologis + kalimat audit', async () => {
    await renderApp()
    const user = userEvent.setup()

    await user.click(within(rowOf('TK-1042')).getByTestId('open-audit'))

    const drawer = await screen.findByTestId('audit-drawer')
    expect(within(drawer).getAllByTestId('audit-entry')).toHaveLength(2)
    expect(within(drawer).getByText(/User "budi.santoso" changed Task "Prepare Invoice"/)).toBeInTheDocument()
    expect(within(drawer).getByText(/APPEND-ONLY/)).toBeInTheDocument()
  })
})

describe('membuat dan menghapus', () => {
  it('membuat task baru lewat dialog, lalu menampilkannya di daftar', async () => {
    await renderApp()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '+ TASK BARU' }))
    await user.type(screen.getByLabelText('JUDUL'), 'Siapkan laporan mingguan')
    await user.click(screen.getByRole('button', { name: 'SIMPAN TASK' }))

    await waitFor(() => expect(screen.getByText('Siapkan laporan mingguan')).toBeInTheDocument())
    expect(screen.getByTestId('toast')).toHaveTextContent('TASK DIBUAT')
    expect(server.calls).toContain('POST /tasks')
  })

  it('menghapus task hanya setelah dikonfirmasi, dan menjelaskan riwayat tetap tersimpan', async () => {
    await renderApp()
    const user = userEvent.setup()

    await user.click(within(rowOf('TK-1042')).getByRole('button', { name: 'HAPUS' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/entri riwayatnya tetap tersimpan permanen/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'HAPUS (SOFT)' }))

    await waitFor(() => expect(screen.queryByText('Prepare Invoice')).not.toBeInTheDocument())
    expect(server.calls).toContain('DELETE /tasks/TK-1042')
  })
})
