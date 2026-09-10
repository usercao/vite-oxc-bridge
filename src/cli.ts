#!/usr/bin/env node

import { runTool } from './runner.js'
import { initializeVsCodeSettings } from './vscode-settings.js'

const HELP = `Usage: oxc <command> [options] [tool arguments]

Commands:
  init       Create Vite+-compatible VS Code settings
  lint       Run Oxlint with the lint section from oxc.config.*
  fmt        Run Oxfmt with the fmt section from oxc.config.*

Options:
  -h, --help           Show this help
`

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return 0
  }

  if (command === 'init') {
    if (args.length > 0) {
      throw new Error(`The init command does not accept arguments\n\n${HELP}`)
    }

    const result = await initializeVsCodeSettings()
    const verb =
      result === 'created' ? 'Created' : result === 'updated' ? 'Updated' : 'Already configured'
    process.stdout.write(`${verb} .vscode/settings.json\n`)
    return 0
  }

  if (command === 'lint' || command === 'fmt') {
    return runTool(command === 'lint' ? 'oxlint' : 'oxfmt', args)
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`)
}

try {
  process.exitCode = await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`oxc: ${message}\n`)
  process.exitCode = 1
}
