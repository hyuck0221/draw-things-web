import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSession } from '../domain/types'

const storage = vi.hoisted(() => ({
  listSessionsWithRevision: vi.fn(),
  putSession: vi.fn(),
  deleteSession: vi.fn(),
}))

vi.mock('../lib/storage', () => ({
  listSessionsWithRevision: storage.listSessionsWithRevision,
  readWorkspaceRevision: () => 1,
  putSession: storage.putSession,
  deleteSession: storage.deleteSession,
}))

import { useWorkspace } from './useWorkspace'

const storedSession: WorkspaceSession = {
  id: 'stored-session',
  title: 'Stored canvas',
  createdAt: 1,
  updatedAt: 1,
  turns: [],
  items: [],
  view: { x: 0, y: 0, zoom: 1 },
  continuationEnabled: true,
  draftPrompt: '',
  useSelectedImage: false,
}

let current: ReturnType<typeof useWorkspace> | undefined
let container: HTMLDivElement
let root: Root

function Harness() {
  const workspace = useWorkspace()
  useEffect(() => {
    current = workspace
  }, [workspace])
  return null
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(async () => {
  vi.useFakeTimers()
  storage.listSessionsWithRevision.mockReset().mockResolvedValue({
    sessions: [{ ...storedSession }],
    revision: 1,
  })
  storage.putSession.mockReset().mockResolvedValue(undefined)
  storage.deleteSession.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Harness />)
    await flushPromises()
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  current = undefined
  vi.useRealTimers()
})

describe('useWorkspace persistence', () => {
  it('retries a transient save failure and clears the storage error after recovery', async () => {
    storage.putSession.mockRejectedValueOnce(new Error('temporary quota failure')).mockResolvedValue(undefined)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(1)
    expect(current?.storageError).toContain('temporary quota failure')

    await act(async () => {
      vi.advanceTimersByTime(500)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(2)
    expect(current?.storageError).toBeNull()
  })

  it('does not retry a save rejected because another tab replaced the workspace', async () => {
    const stale = new Error('stale workspace')
    stale.name = 'WorkspaceRevisionError'
    storage.putSession.mockRejectedValue(stale)

    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await flushPromises()
    })

    expect(storage.putSession).toHaveBeenCalledTimes(1)
    expect(current?.storageError).toContain('stale workspace')
  })

  it('blocks updates and saves for a session while its deletion is pending', async () => {
    let resolveInitialWrite!: () => void
    let resolveDeletion!: () => void
    storage.putSession.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveInitialWrite = resolve }))
    storage.deleteSession.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDeletion = resolve }))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(1)

    let deletion!: Promise<void>
    act(() => {
      deletion = current!.deleteSession(storedSession.id)
    })
    await act(async () => {
      resolveInitialWrite()
      await flushPromises()
    })
    expect(storage.deleteSession).toHaveBeenCalledWith(storedSession.id, 1)

    act(() => {
      current!.updateSession(storedSession.id, (session) => ({ ...session, title: 'must not return' }))
    })
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await flushPromises()
    })
    const writesForDeletedSession = storage.putSession.mock.calls
      .map(([session]) => session as WorkspaceSession)
      .filter((session) => session.id === storedSession.id)
    expect(writesForDeletedSession).toHaveLength(1)

    await act(async () => {
      resolveDeletion()
      await deletion
      await flushPromises()
    })
    expect(current?.sessions.some((session) => session.id === storedSession.id)).toBe(false)
  })

  it('keeps a deletion error visible even when restoring the session saves successfully', async () => {
    storage.deleteSession.mockRejectedValueOnce(new Error('delete transaction failed'))

    let deletion!: Promise<void>
    await act(async () => {
      deletion = current!.deleteSession(storedSession.id)
      await deletion
      await flushPromises()
    })
    expect(current?.storageError).toContain('delete transaction failed')
    expect(current?.sessions.some((session) => session.id === storedSession.id)).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalled()
    expect(current?.storageError).toContain('delete transaction failed')
  })

  it('quiesces pending retries during an atomic backup replacement', async () => {
    storage.putSession.mockRejectedValueOnce(new Error('pause before retry')).mockResolvedValue(undefined)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      await current!.pausePersistence()
      current!.updateSession(storedSession.id, (session) => ({ ...session, title: 'must stay blocked' }))
      current!.addSession()
      await current!.deleteSession(storedSession.id)
      vi.advanceTimersByTime(2_000)
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(1)
    expect(storage.deleteSession).not.toHaveBeenCalled()
    expect(current?.sessions).toHaveLength(1)
    expect(current?.sessions[0]?.title).toBe(storedSession.title)

    await act(async () => {
      current!.resumePersistence()
      await flushPromises()
    })
    expect(storage.putSession).toHaveBeenCalledTimes(2)
  })
})
