import { spawnSync } from 'node:child_process'

export function runCommands(command: string, steps: readonly (readonly string[])[]): number {
  for (const args of steps) {
    const usesCommandShim = process.platform === 'win32' && command.endsWith('.cmd')
    const executable = usesCommandShim ? (process.env.ComSpec ?? 'cmd.exe') : command
    const executableArgs = usesCommandShim ? ['/d', '/s', '/c', command, ...args] : args
    const result = spawnSync(executable, executableArgs, { stdio: 'inherit' })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      return result.status ?? 1
    }
  }
  return 0
}
