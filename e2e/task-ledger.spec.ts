import { expect, test } from '@playwright/test'

test('Task Ledger: satu langkah, idempoten, ditolak saat melompat, riwayat tak bisa dihapus', async ({ page }) => {
  await page.goto('/')

  const row = page.locator('[data-task-id="TK-1042"]')
  await expect(row).toHaveAttribute('data-status', 'pending')
  await expect(row.locator('.step.current .label')).toHaveText('PENDING')
  await expect(row.locator('.step.next .label')).toHaveText('IN_PROGRESS')
  await expect(page.getByTestId('total-entries')).toHaveText('12')

  await test.step('satu langkah maju lewat tombol, dan angkah ikut bergerak', async () => {
    await row.getByTestId('next-action').click()
    await expect(page.getByTestId('toast')).toContainText('STATUS DIUBAH')
    await expect(row).toHaveAttribute('data-status', 'in_progress')
    await expect(row.locator('.step.current .label')).toHaveText('IN_PROGRESS')
    await expect(page.getByTestId('total-entries')).toHaveText('13')
  })

  await test.step('perubahan tersimpan di server, bukan hanya di layar', async () => {
    await page.reload()
    const afterReload = page.locator('[data-task-id="TK-1042"]')
    await expect(afterReload).toHaveAttribute('data-status', 'in_progress')
    await afterReload.getByTestId('open-audit').click()
    const drawer = page.getByTestId('audit-drawer')
    await expect(drawer.getByTestId('audit-entry')).toHaveCount(3)
    await expect(drawer).toContainText('tidak bisa diubah atau dihapus')
    await page.locator('.drawer-scrim').click()
    await expect(drawer).toBeHidden()
  })

  await test.step('idempoten: mengirim status yang sama tidak menambah riwayat', async () => {
    const before = await (await page.request.get('/tasks/TK-1042/audit-logs')).json()
    const response = await page.request.put('/tasks/TK-1042/status', {
      data: { to: 'in_progress', actorId: 'ana.maria' },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.changed).toBe(false)
    expect(body.log).toBeNull()

    const after = await (await page.request.get('/tasks/TK-1042/audit-logs')).json()
    expect(after.entries.length).toBe(before.entries.length)
  })

  await test.step('melompat satu langkah ditolak 409 dan tidak menulis apa pun', async () => {
    const before = await (await page.request.get('/tasks/TK-1040/audit-logs')).json()
    const response = await page.request.put('/tasks/TK-1040/status', { data: { to: 'done', actorId: 'john.doe' } })
    expect(response.status()).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe('INVALID_TRANSITION')
    expect(body.error.nextStatus).toBe('pending')

    const after = await (await page.request.get('/tasks/TK-1040/audit-logs')).json()
    expect(after.entries.length).toBe(before.entries.length)
  })

  await test.step('aktor di luar daftar tetap ditolak 422', async () => {
    const response = await page.request.put('/tasks/TK-1040/status', {
      data: { to: 'pending', actorId: 'tamu.asing' },
    })
    expect(response.status()).toBe(422)
  })

  await test.step('tidak ada jalur untuk menghapus riwayat', async () => {
    expect((await page.request.delete('/audit-logs/1')).status()).toBe(404)
    expect((await page.request.put('/audit-logs/1', { data: {} })).status()).toBe(404)
  })

  await test.step('hapus task = soft delete: hilang dari daftar, riwayat tetap terbaca', async () => {
    const target = page.locator('[data-task-id="TK-1038"]')
    await target.getByRole('button', { name: 'HAPUS' }).click()
    await expect(page.getByRole('dialog')).toContainText('tetap tersimpan permanen')
    await page.getByRole('button', { name: 'HAPUS (SOFT)' }).click()
    await expect(page.getByTestId('toast')).toContainText('TASK DIHAPUS')

    await page.reload()
    await expect(page.locator('[data-task-id="TK-1038"]')).toHaveCount(0)
    expect((await page.request.get('/tasks/TK-1038')).status()).toBe(404)
    const history = await page.request.get('/tasks/TK-1038/audit-logs')
    expect(history.status()).toBe(200)
    expect((await history.json()).entries.length).toBeGreaterThan(0)
  })
})
