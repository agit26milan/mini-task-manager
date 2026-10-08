import { spawn } from 'node:child_process'

const targets = [
  { name: 'server', args: ['run', 'dev', '-w', 'server'] },
  { name: 'web   ', args: ['run', 'dev', '-w', 'web'] },
]

const children = targets.map(({ name, args }) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = (line) => `[${name}] ${line}`
  child.stdout.on('data', (chunk) => process.stdout.write(chunk.toString().split('\n').filter(Boolean).map(tag).join('\n') + '\n'))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk.toString().split('\n').filter(Boolean).map(tag).join('\n') + '\n'))
  child.on('exit', (code) => {
    process.stdout.write(`[${name}] berhenti (exit ${code})\n`)
  })
  return child
})

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
