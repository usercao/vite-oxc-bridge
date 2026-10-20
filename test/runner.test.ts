import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, test, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('../src/tool.js', () => ({
  enableVitePlusConfigDiscovery: vi.fn(),
  resolveToolBin: vi.fn(async () => '/fixture/oxfmt.js'),
}))

const { runTool } = await import('../src/runner.js')
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

function createChild() {
  return Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stderr: null,
    stdout: null,
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('runner signals', () => {
  test.each(signals)('forwards %s and removes its process listeners', async (signal) => {
    const child = createChild()
    spawnMock.mockReturnValueOnce(child)
    const previousListeners = new Map(
      signals.map((currentSignal) => [currentSignal, new Set(process.listeners(currentSignal))]),
    )

    const result = runTool('oxfmt', [])
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    const listener = process
      .listeners(signal)
      .find((candidate) => !previousListeners.get(signal)?.has(candidate))
    expect(listener).toBeDefined()

    listener!(signal)
    expect(child.kill).toHaveBeenCalledWith(signal)
    child.emit('close', 0, null)
    await expect(result).resolves.toBe(0)

    for (const currentSignal of signals) {
      expect(new Set(process.listeners(currentSignal))).toEqual(
        previousListeners.get(currentSignal),
      )
    }
  })

  test('returns the conventional exit code when the child exits from a signal', async () => {
    const child = createChild()
    spawnMock.mockReturnValueOnce(child)

    const result = runTool('oxfmt', [])
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    child.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(143)
  })
})
