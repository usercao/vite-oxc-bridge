import { spawnSync } from 'node:child_process'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
const steps = [
  ['build'],
  [
    'exec',
    'vitest',
    'run',
    'test/tool.test.ts',
    'test/integration.test.ts',
    'test/language-server.test.ts',
  ],
  ['test:package'],
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
