import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

interface CommandOutput {
  stderr: string
  stdout: string
}

interface LspMessage {
  error?: { message?: string }
  id?: number
  method?: string
}

type OxcTool = 'oxfmt' | 'oxlint'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      shell: command.endsWith('.cmd'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stderr, stdout })
        return
      }
      reject(
        new Error(`${command} ${args.join(' ')} exited with code ${exitCode}\n${stdout}${stderr}`),
      )
    })
  })
}

function packageEnvironment(projectDirectory: string): NodeJS.ProcessEnv {
  const binDirectory = path.join(projectDirectory, 'node_modules', '.bin')
  return {
    ...process.env,
    PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
  }
}

function spawnPackageBin(
  name: string,
  args: string[],
  projectDirectory: string,
): ChildProcessWithoutNullStreams {
  return spawn(name, args, {
    cwd: projectDirectory,
    env: packageEnvironment(projectDirectory),
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

async function runPackageBin(
  name: string,
  args: string[],
  projectDirectory: string,
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawnPackageBin(name, args, projectDirectory)
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stderr, stdout })
        return
      }
      reject(
        new Error(`${name} ${args.join(' ')} exited with code ${exitCode}\n${stdout}${stderr}`),
      )
    })
  })
}

function encodeLspMessage(message: object): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

async function initializeLanguageServer(tool: OxcTool, projectDirectory: string): Promise<void> {
  const child = spawnPackageBin(tool, ['--lsp'], projectDirectory)
  const rootUri = pathToFileURL(projectDirectory).href
  let buffer = Buffer.alloc(0)
  let stderr = ''

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out initializing installed ${tool} LSP\n${stderr}`))
      }, 15_000)

      function finish(error?: Error): void {
        clearTimeout(timeout)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }

      child.once('error', finish)
      child.once('close', (exitCode) => {
        finish(new Error(`Installed ${tool} LSP exited with code ${exitCode}\n${stderr}`))
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
            finish(new Error(`Installed ${tool} LSP sent an invalid header: ${header}`))
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
            child.stdin.write(encodeLspMessage({ id: message.id, jsonrpc: '2.0', result: null }))
            continue
          }
          if (message.id !== 1) {
            continue
          }
          if (message.error) {
            finish(new Error(message.error.message ?? `Installed ${tool} LSP initialize failed`))
          } else {
            finish()
          }
          return
        }
      })

      const options =
        tool === 'oxfmt' ? { 'fmt.disableNestedConfig': true } : { disableNestedConfig: true }
      child.stdin.write(
        encodeLspMessage({
          id: 1,
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            capabilities: {},
            initializationOptions: [{ options, workspaceUri: rootUri }],
            processId: process.pid,
            rootUri,
            workspaceFolders: [{ name: 'package-smoke', uri: rootUri }],
          },
        }),
      )
    })
  } finally {
    child.kill('SIGTERM')
  }
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'vite-oxc-bridge-package-'))
const tarballPath = path.join(temporaryDirectory, 'vite-oxc-bridge.tgz')
const projectDirectory = path.join(temporaryDirectory, 'consumer')

try {
  await runCommand(yarnCommand, ['pack', '--out', tarballPath], repositoryRoot)
  await mkdir(projectDirectory)
  await writeFile(
    path.join(projectDirectory, 'package.json'),
    JSON.stringify({ name: 'package-smoke', private: true, type: 'module' }),
  )
  await runCommand(
    npmCommand,
    ['install', '--no-audit', '--no-fund', tarballPath],
    projectDirectory,
  )
  await writeFile(path.join(projectDirectory, 'vite.config.ts'), 'export default {}\n')
  await writeFile(
    path.join(projectDirectory, 'oxc.config.mjs'),
    `export default {
  fmt: { semi: false, singleQuote: true },
  lint: { rules: { 'no-debugger': 'deny' } },
}
`,
  )
  await writeFile(path.join(projectDirectory, 'source.ts'), "const message = 'hello'\n")

  await runCommand(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { defineConfig, runTool } from 'vite-oxc-bridge'; if (typeof defineConfig !== 'function' || typeof runTool !== 'function') process.exit(1)",
    ],
    projectDirectory,
  )

  const help = await runPackageBin('oxc', ['--help'], projectDirectory)
  if (!help.stdout.includes('Usage: oxc')) {
    throw new Error(`Installed oxc returned unexpected help output:\n${help.stdout}${help.stderr}`)
  }
  await runPackageBin('oxc', ['fmt', '--check', 'source.ts'], projectDirectory)
  await runPackageBin('oxc', ['lint', 'source.ts'], projectDirectory)
  await initializeLanguageServer('oxfmt', projectDirectory)
  await initializeLanguageServer('oxlint', projectDirectory)
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
