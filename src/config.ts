import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { OxcConfig } from './index.js'

const CONFIG_FILENAMES = [
  'oxc.config.ts',
  'oxc.config.mts',
  'oxc.config.cts',
  'oxc.config.js',
  'oxc.config.mjs',
  'oxc.config.cjs',
] as const

const require = createRequire(import.meta.url)

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false
    }
    throw error
  }
}

export async function findConfig(startDirectory = process.cwd()): Promise<string> {
  let directory = path.resolve(startDirectory)

  while (true) {
    const matches = (
      await Promise.all(
        CONFIG_FILENAMES.map(async (filename) => {
          const filePath = path.join(directory, filename)
          return (await exists(filePath)) ? filePath : undefined
        }),
      )
    ).filter((filePath): filePath is string => filePath !== undefined)

    if (matches.length > 1) {
      throw new Error(`Multiple unified Oxc configs found in ${directory}: ${matches.join(', ')}`)
    }
    if (matches[0]) {
      return matches[0]
    }

    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`No ${CONFIG_FILENAMES.join(', ')} found from ${startDirectory}`)
    }
    directory = parent
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function loadConfig(configPath: string): Promise<OxcConfig> {
  const absolutePath = path.resolve(configPath)
  if (absolutePath.endsWith('.cjs') || absolutePath.endsWith('.cts')) {
    delete require.cache[absolutePath]
  }
  const moduleUrl = pathToFileURL(absolutePath)
  moduleUrl.searchParams.set('oxc-bridge-cache', `${Date.now()}-${Math.random()}`)

  const configModule = (await import(moduleUrl.href)) as { default?: unknown }
  if (!isObject(configModule.default)) {
    throw new TypeError(`${absolutePath} must default-export a configuration object`)
  }

  return configModule.default as OxcConfig
}
