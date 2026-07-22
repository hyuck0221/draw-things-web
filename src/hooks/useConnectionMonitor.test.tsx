import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionTestResult } from '../domain/types'
import { EMPTY_CAPABILITIES } from '../lib/defaults'
import { testConnection } from '../lib/draw-things/client'
import { useConnectionMonitor } from './useConnectionMonitor'

vi.mock('../lib/draw-things/client', () => ({ testConnection: vi.fn() }))

const mockedTestConnection = vi.mocked(testConnection)
const onRemoteOptions = vi.fn()

function connection(ok: boolean): ConnectionTestResult {
  return {
    ok,
    latencyMs: 1,
    checkedAt: Date.now(),
    phase: ok ? 'online' : 'offline',
    message: ok ? 'connected' : 'offline',
    endpoint: '/sdapi/v1/options',
    capabilities: ok
      ? { ...EMPTY_CAPABILITIES, canGenerate: true, canImageToImage: true }
      : EMPTY_CAPABILITIES,
    ...(ok ? { remoteOptions: { model: 'test.ckpt', width: 512, height: 512, steps: 2 } } : {}),
  }
}

describe('useConnectionMonitor', () => {
  let container: HTMLDivElement
  let root: Root
  let latest: ReturnType<typeof useConnectionMonitor> | undefined

  function Probe({ busy = false }: { busy?: boolean }) {
    latest = useConnectionMonitor({ busy, onRemoteOptions })
    return <span>{latest.phase}</span>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mockedTestConnection.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('checks immediately, every five seconds, and visibly degrades before going offline', async () => {
    mockedTestConnection.mockResolvedValueOnce(connection(true))
    await act(async () => root.render(<Probe />))
    expect(mockedTestConnection).toHaveBeenCalledTimes(1)
    expect(latest?.phase).toBe('online')

    mockedTestConnection.mockResolvedValue(connection(false))
    await act(async () => vi.advanceTimersByTimeAsync(5_000))
    expect(latest?.phase).toBe('degraded')
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(latest?.phase).toBe('offline')

    mockedTestConnection.mockResolvedValue(connection(true))
    await act(async () => vi.advanceTimersByTimeAsync(5_000))
    expect(latest?.phase).toBe('online')
  })

  it('checks when a tab becomes visible and pauses all checks while busy', async () => {
    mockedTestConnection.mockResolvedValue(connection(true))
    await act(async () => root.render(<Probe />))
    const afterStartup = mockedTestConnection.mock.calls.length

    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(mockedTestConnection).toHaveBeenCalledTimes(afterStartup + 1)

    await act(async () => root.render(<Probe busy />))
    const beforeBusyWait = mockedTestConnection.mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(mockedTestConnection).toHaveBeenCalledTimes(beforeBusyWait)
  })
})
