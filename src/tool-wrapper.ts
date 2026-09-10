import { pathToFileURL } from 'node:url'

import './vite-plus-preload.js'
import type { OxcTool } from './index.js'
import { enableVitePlusConfigDiscovery, resolveToolBin } from './tool.js'

function isEditorInvocation(tool: OxcTool): boolean {
  if (process.argv.includes('--lsp')) {
    return true
  }
  return (
    tool === 'oxfmt' && process.argv.some((argument) => argument.startsWith('--stdin-filepath'))
  )
}

export async function runWrappedTool(tool: OxcTool): Promise<void> {
  if (!isEditorInvocation(tool)) {
    const command = tool === 'oxfmt' ? 'fmt' : 'lint'
    process.stderr.write(`This ${tool} wrapper is for IDE extension use only.\n`)
    process.stderr.write(
      `To ${command === 'fmt' ? 'format' : 'lint'} your code, run: oxc ${command}\n`,
    )
    process.exitCode = 1
    return
  }

  enableVitePlusConfigDiscovery(process.env, tool)
  await import(pathToFileURL(await resolveToolBin(tool)).href)
}
