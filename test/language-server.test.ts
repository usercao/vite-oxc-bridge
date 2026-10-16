import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import { cleanupTemporaryDirectories, createUnifiedFixture } from './helpers.js'

interface LspMessage {
  error?: { message?: string }
  id?: number
  method?: string
  result?: unknown
}

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (result: unknown) => void
  timeout: NodeJS.Timeout
}

interface LspSession {
  close(): Promise<void>
  notify(method: string, params: object): void
  request(method: string, params: unknown): Promise<unknown>
}

function encodeMessage(message: object): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

function startLspSession(tool: 'oxfmt' | 'oxlint', cwd: string): LspSession {
  const wrapperPath = fileURLToPath(new URL(`../bin/${tool}.js`, import.meta.url))
  const child = spawn(process.execPath, [wrapperPath, '--lsp'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pendingRequests = new Map<number, PendingRequest>()
  let buffer = Buffer.alloc(0)
  let closed = false
  let nextRequestId = 1
  let stderr = ''
  const childClosed = new Promise<void>((resolve) => {
    child.once('close', () => resolve())
  })

  function failPendingRequests(error: Error): void {
    for (const pendingRequest of pendingRequests.values()) {
      clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(error)
    }
    pendingRequests.clear()
  }

  function fail(error: Error): void {
    if (closed) {
      return
    }
    closed = true
    failPendingRequests(error)
    child.kill('SIGTERM')
  }

  function send(message: object): void {
    child.stdin.write(encodeMessage(message))
  }

  function request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++
      const timeout = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`Timed out waiting for ${tool} LSP ${method}\n${stderr}`))
      }, 5_000)
      pendingRequests.set(id, { reject, resolve, timeout })
      send({ id, jsonrpc: '2.0', method, params })
    })
  }

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
  child.once('error', (error) => fail(error))
  child.once('close', (code) => {
    fail(new Error(`${tool} LSP exited with code ${code}\n${stderr}`))
  })
  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        return
      }
      const header = buffer.subarray(0, headerEnd).toString('utf8')
      const contentLength = /Content-Length: (\d+)/i.exec(header)?.[1]
      if (!contentLength) {
        fail(new Error(`${tool} LSP sent an invalid header: ${header}`))
        return
      }
      const messageEnd = headerEnd + 4 + Number(contentLength)
      if (buffer.length < messageEnd) {
        return
      }

      const message = JSON.parse(
        buffer.subarray(headerEnd + 4, messageEnd).toString('utf8'),
      ) as LspMessage
      buffer = buffer.subarray(messageEnd)

      if (message.method && message.id !== undefined) {
        send({ id: message.id, jsonrpc: '2.0', result: null })
        continue
      }
      if (message.id === undefined) {
        continue
      }

      const pendingRequest = pendingRequests.get(message.id)
      if (!pendingRequest) {
        continue
      }
      pendingRequests.delete(message.id)
      clearTimeout(pendingRequest.timeout)
      if (message.error) {
        pendingRequest.reject(new Error(message.error.message ?? `${tool} LSP request failed`))
      } else {
        pendingRequest.resolve(message.result)
      }
    }
  })

  return {
    async close(): Promise<void> {
      if (closed) {
        await childClosed
        return
      }
      try {
        await request('shutdown', null)
        send({ jsonrpc: '2.0', method: 'exit' })
        await childClosed
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
        await childClosed
        throw error
      }
    },
    notify(method: string, params: object): void {
      send({ jsonrpc: '2.0', method, params })
    },
    request,
  }
}

async function formatWithLsp(configDirectory: string, sourcePath: string): Promise<unknown> {
  const session = startLspSession('oxfmt', configDirectory)
  const rootUri = pathToFileURL(configDirectory).href
  const sourceUri = pathToFileURL(sourcePath).href

  try {
    await session.request('initialize', {
      capabilities: { textDocument: { formatting: {} } },
      initializationOptions: [
        { options: { 'fmt.disableNestedConfig': true }, workspaceUri: rootUri },
      ],
      processId: null,
      rootUri,
      workspaceFolders: [{ name: 'fixture', uri: rootUri }],
    })
    session.notify('initialized', {})
    session.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'typescript',
        text: 'const message = "hello";\n',
        uri: sourceUri,
        version: 1,
      },
    })
    return await session.request('textDocument/formatting', {
      options: { insertSpaces: true, tabSize: 2 },
      textDocument: { uri: sourceUri },
    })
  } finally {
    await session.close()
  }
}

async function lintWithLsp(configDirectory: string, sourcePath: string): Promise<unknown> {
  const session = startLspSession('oxlint', configDirectory)
  const rootUri = pathToFileURL(configDirectory).href
  const sourceUri = pathToFileURL(sourcePath).href

  try {
    await session.request('initialize', {
      capabilities: {
        textDocument: { diagnostic: {} },
        workspace: { diagnostics: { refreshSupport: true } },
      },
      initializationOptions: [{ options: { disableNestedConfig: true }, workspaceUri: rootUri }],
      processId: process.pid,
      rootUri: null,
      workspaceFolders: [{ name: 'fixture', uri: rootUri }],
    })
    session.notify('initialized', {})
    session.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'typescript',
        text: await readFile(sourcePath, 'utf8'),
        uri: sourceUri,
        version: 1,
      },
    })
    return await session.request('textDocument/diagnostic', {
      textDocument: { uri: sourceUri },
    })
  } finally {
    await session.close()
  }
}

afterEach(async () => {
  await cleanupTemporaryDirectories()
})

describe('Oxc wrappers', () => {
  test('loads fmt from oxc.config.* for a formatting request', async () => {
    const { directory } = await createUnifiedFixture(`export default {
  fmt: { semi: false, singleQuote: true },
}\n`)
    const sourcePath = path.join(directory, 'source.ts')
    await writeFile(sourcePath, 'const message = "hello";\n')

    await expect(formatWithLsp(directory, sourcePath)).resolves.toEqual([
      {
        newText: "'hello'",
        range: {
          end: { character: 24, line: 0 },
          start: { character: 16, line: 0 },
        },
      },
    ])
  })

  test('loads lint from oxc.config.* for a diagnostic request', async () => {
    const { directory } = await createUnifiedFixture()
    const sourcePath = path.join(directory, 'source.ts')
    await writeFile(sourcePath, 'debugger\n')

    await expect(lintWithLsp(directory, sourcePath)).resolves.toMatchObject({
      items: [expect.objectContaining({ code: 'eslint(no-debugger)' })],
      kind: 'full',
    })
  })
})
