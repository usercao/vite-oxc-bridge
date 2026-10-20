import { runCommands } from './run-commands.ts'

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

process.exitCode = runCommands(yarnCommand, steps)
