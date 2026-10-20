import { runCommands } from './run-commands.ts'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
const steps = [
  ['exec', 'tsc', '-p', 'tsconfig.json'],
  ['build'],
  ['exec', 'vitest', 'run'],
] as const

process.exitCode = runCommands(yarnCommand, steps)
