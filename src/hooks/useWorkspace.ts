import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceSession } from '../domain/types'
import { createSession } from '../lib/defaults'
import { deleteSession as removeStoredSession, listSessions, putSession } from '../lib/storage'

function storageErrorMessage(error: unknown) {
  const detail = error instanceof Error ? ` (${error.message})` : ''
  return `브라우저 로컬 저장소를 사용할 수 없습니다${detail}`
}

export function useWorkspace(preferredActiveId?: string) {
  const [sessions, setSessions] = useState<WorkspaceSession[]>([])
  const [activeId, setActiveId] = useState(preferredActiveId ?? '')
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const latestSessions = useRef(new Map<string, WorkspaceSession>())
  const pendingSaves = useRef(new Map<string, number>())
  const activeWrites = useRef(new Map<string, Promise<void>>())
  const deletingIds = useRef(new Set<string>())
  const storageFailures = useRef(new Map<string, string>())

  const updateStorageFailure = useCallback((key: string, error?: unknown) => {
    if (error === undefined) storageFailures.current.delete(key)
    else storageFailures.current.set(key, storageErrorMessage(error))
    setStorageError(storageFailures.current.values().next().value ?? null)
  }, [])

  const runSave = useCallback(function persistSession(id: string, attempt = 0) {
    if (deletingIds.current.has(id)) return
    const latest = latestSessions.current.get(id)
    if (!latest) return
    const write = putSession(latest)
    activeWrites.current.set(id, write)
    const finish = () => {
      if (activeWrites.current.get(id) === write) activeWrites.current.delete(id)
    }
    void write.then(() => {
      finish()
      updateStorageFailure(`save:${id}`)
    }, (error: unknown) => {
      finish()
      updateStorageFailure(`save:${id}`, error)
      if (attempt >= 3 || deletingIds.current.has(id) || !latestSessions.current.has(id)) return
      const pending = pendingSaves.current.get(id)
      if (pending !== undefined) window.clearTimeout(pending)
      const delays = [500, 1_500, 5_000]
      const timeout = window.setTimeout(() => {
        if (pendingSaves.current.get(id) !== timeout) return
        pendingSaves.current.delete(id)
        persistSession(id, attempt + 1)
      }, delays[attempt] ?? 5_000)
      pendingSaves.current.set(id, timeout)
    })
  }, [updateStorageFailure])

  useEffect(() => {
    let cancelled = false
    void listSessions()
      .then(async (stored) => {
        if (cancelled) return
        if (stored.length === 0) {
          const initial = createSession()
          await putSession(initial)
          if (!cancelled) {
            setSessions([initial])
            setActiveId(initial.id)
          }
        } else {
          setSessions(stored)
          setActiveId((current) => {
            const requested = current || preferredActiveId
            return requested && stored.some((session) => session.id === requested) ? requested : stored[0]!.id
          })
        }
        if (!cancelled) {
          updateStorageFailure('load')
          setLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        updateStorageFailure('load', error)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [preferredActiveId, updateStorageFailure])

  useEffect(() => {
    if (loading || sessions.length === 0) return
    const liveIds = new Set(sessions.map((session) => session.id))
    for (const [id, timeout] of pendingSaves.current) {
      if (liveIds.has(id)) continue
      window.clearTimeout(timeout)
      pendingSaves.current.delete(id)
      latestSessions.current.delete(id)
    }
    for (const session of sessions) {
      if (deletingIds.current.has(session.id)) continue
      if (latestSessions.current.get(session.id) === session) continue
      latestSessions.current.set(session.id, session)
      const pending = pendingSaves.current.get(session.id)
      if (pending !== undefined) window.clearTimeout(pending)
      const timeout = window.setTimeout(() => {
        pendingSaves.current.delete(session.id)
        runSave(session.id)
      }, 250)
      pendingSaves.current.set(session.id, timeout)
    }
  }, [loading, runSave, sessions])

  useEffect(() => () => {
    for (const [id, timeout] of pendingSaves.current) {
      window.clearTimeout(timeout)
      const latest = latestSessions.current.get(id)
      if (latest && !deletingIds.current.has(id)) void putSession(latest).catch(() => {})
    }
    pendingSaves.current.clear()
  }, [])

  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0]

  const updateSession = useCallback((id: string, updater: (session: WorkspaceSession) => WorkspaceSession) => {
    if (deletingIds.current.has(id)) return
    setSessions((current) => current.map((session) => session.id === id ? updater(session) : session))
  }, [])

  const updateActive = useCallback((updater: (session: WorkspaceSession) => WorkspaceSession) => {
    if (!activeId) return
    updateSession(activeId, (session) => ({ ...updater(session), updatedAt: Date.now() }))
  }, [activeId, updateSession])

  const addSession = useCallback(() => {
    const next = createSession()
    setSessions((current) => [next, ...current])
    setActiveId(next.id)
    return next
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    if (deletingIds.current.has(id)) return
    deletingIds.current.add(id)
    const pending = pendingSaves.current.get(id)
    if (pending !== undefined) window.clearTimeout(pending)
    pendingSaves.current.delete(id)
    latestSessions.current.delete(id)
    try { await activeWrites.current.get(id) } catch { /* deletion remains the final operation */ }
    try {
      await removeStoredSession(id)
    } catch (error) {
      deletingIds.current.delete(id)
      updateStorageFailure(`delete:${id}`, error)
      setSessions((current) => current.map((session) => session.id === id ? { ...session } : session))
      return
    }
    updateStorageFailure(`save:${id}`)
    updateStorageFailure(`delete:${id}`)
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== id)
      if (remaining.length === 0) {
        const next = createSession()
        setActiveId(next.id)
        return [next]
      }
      if (id === activeId) setActiveId(remaining[0]!.id)
      return remaining
    })
  }, [activeId, updateStorageFailure])

  return {
    sessions,
    activeSession,
    activeId,
    loading,
    storageError,
    setActiveId,
    updateActive,
    updateSession,
    addSession,
    deleteSession,
  }
}
