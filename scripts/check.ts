import { runCommands } from './run-commands.ts'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
const steps = [
  ['format:check'],
  ['lint'],
  ['test'],
  ['test:package'],
  ['pack', '--dry-run'],
] as const

process.exitCode = runCommands(yarnCommand, steps)
