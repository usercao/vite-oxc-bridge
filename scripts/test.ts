import { spawnSync } from 'node:child_process'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
const steps = [
  ['exec', 'tsc', '-p', 'tsconfig.json'],
  ['build'],
  ['exec', 'vitest', 'run'],
] as const

for (const args of steps) {
  const result = spawnSync(yarnCommand, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
