import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createSqliteUnitOfWork } from './repos/sqlite'
import { createTaskService } from './services/taskService'
import { isoAt, todayLocal } from './time'

const dbPath = resolve(process.env.DB_PATH ?? 'data/app.db')
mkdirSync(dirname(dbPath), { recursive: true })

const repos = createSqliteUnitOfWork(dbPath)
const existing = repos.tasks.listActive()

if (existing.length > 0) {
  console.log(`[seed] database sudah berisi ${existing.length} task aktif — tidak ada yang diubah.`)
  console.log('[seed] untuk mulai dari nol: npm run db:reset')
  repos.close()
  process.exit(0)
}

const day = todayLocal()
let clock = isoAt(day, '08:00')
const service = createTaskService({ repos, now: () => clock })

const JOHN = 'john.doe'
const ANA = 'ana.maria'
const BUDI = 'budi.santoso'

interface Step {
  at: string
  label: string
  run: () => void
}

const steps: Step[] = [
  { at: '08:00', label: 'buat TK-1038  Sinkronisasi katalog vendor (ana.maria)', run: () => service.createTask({ title: 'Sinkronisasi katalog vendor', description: 'Sisa 40 entri tanpa kategori.', actorId: ANA }) },
  { at: '08:10', label: 'buat TK-1039  Perbaiki template email onboarding (john.doe)', run: () => service.createTask({ title: 'Perbaiki template email onboarding', description: 'CTA rusak di klien Outlook 2019.', actorId: JOHN }) },
  { at: '09:35', label: 'buat TK-1040  Migrasi log server ke cold storage (budi.santoso)', run: () => service.createTask({ title: 'Migrasi log server ke cold storage', description: 'Skema retensi 90 hari, target biaya turun 30%.', actorId: BUDI }) },
  { at: '09:05', label: 'buat TK-1041  Audit hak akses NAS (budi.santoso)', run: () => service.createTask({ title: 'Audit hak akses NAS', description: 'Cek akun yang masih aktif setelah rotasi tim infra.', actorId: BUDI }) },
  { at: '09:12', label: 'buat TK-1042  Prepare Invoice (budi.santoso)', run: () => service.createTask({ title: 'Prepare Invoice', description: 'Rekap tagihan Q1 untuk vendor percetakan.', actorId: BUDI }) },

  { at: '08:30', label: 'TK-1038  to_do → pending      (ana.maria)', run: () => service.changeStatus('TK-1038', { to: 'pending', actorId: ANA }) },
  { at: '08:20', label: 'TK-1039  to_do → pending      (john.doe)', run: () => service.changeStatus('TK-1039', { to: 'pending', actorId: JOHN }) },
  { at: '08:40', label: 'TK-1039  pending → in_progress (budi.santoso)', run: () => service.changeStatus('TK-1039', { to: 'in_progress', actorId: BUDI }) },
  { at: '08:55', label: 'TK-1039  in_progress → done   (john.doe)', run: () => service.changeStatus('TK-1039', { to: 'done', actorId: JOHN }) },
  { at: '09:48', label: 'TK-1041  to_do → pending      (john.doe)', run: () => service.changeStatus('TK-1041', { to: 'pending', actorId: JOHN }) },
  { at: '10:00', label: 'TK-1041  pending → in_progress (ana.maria)', run: () => service.changeStatus('TK-1041', { to: 'in_progress', actorId: ANA }) },
  { at: '09:41', label: 'TK-1042  to_do → pending      (john.doe)', run: () => service.changeStatus('TK-1042', { to: 'pending', actorId: JOHN }) },
]

console.log(`[seed] mengisi ${dbPath}`)
for (const step of steps) {
  clock = isoAt(day, step.at)
  step.run()
  console.log(`        ${step.at}  ${step.label}`)
}

const tasks = service.listTasks().tasks
let totalEntries = 0
for (const task of tasks) totalEntries += service.listAuditLogs(task.id).length

console.log('')
console.log(`[seed] selesai: ${tasks.length} task aktif, ${totalEntries} entri riwayat`)
for (const task of tasks) {
  const entries = service.listAuditLogs(task.id)
  const last = entries[entries.length - 1]
  console.log(
    `        ${task.id}  ${task.status.padEnd(11)} ${entries.length} entri  terakhir: ` +
      `${last?.actorId ?? '-'} ${last?.fromStatus ?? '(baru)'}→${last?.toStatus ?? '-'}`,
  )
}
console.log('')
console.log('[seed] entri riwayat tidak bisa diubah atau dihapus — bahkan oleh skrip ini.')

repos.close()
