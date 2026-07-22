import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionConfig, ConnectionPhase, ConnectionTestResult } from '../domain/types'
import { testConnection } from '../lib/draw-things/client'

export function useConnectionMonitor({
  connection,
  enabled,
  busy,
  onRemoteOptions,
}: {
  connection: ConnectionConfig
  enabled: boolean
  busy: boolean
  onRemoteOptions: (options: Record<string, unknown>) => void
}) {
  const [phase, setPhase] = useState<ConnectionPhase>(enabled ? 'connecting' : 'unconfigured')
  const [result, setResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const failures = useRef(0)
  const inFlight = useRef<Promise<ConnectionTestResult> | null>(null)
  const connectionKey = JSON.stringify(connection)

  const test = useCallback(async (override = connection) => {
    if (inFlight.current) await inFlight.current
    const execute = async () => {
      setTesting(true)
      setPhase('connecting')
      try {
        const next = await testConnection(override)
        setResult(next)
        if (next.ok) {
          failures.current = 0
          setPhase(next.phase)
          if (next.remoteOptions && JSON.stringify(override) === connectionKey) {
            onRemoteOptions(next.remoteOptions)
          }
        } else {
          failures.current += 1
          if (next.phase === 'api-mismatch' || next.phase === 'cors-or-tls-blocked') {
            setPhase(next.phase)
          } else {
            setPhase(failures.current >= 3 ? 'offline' : 'degraded')
          }
        }
        return next
      } finally {
        setTesting(false)
      }
    }
    const operation = execute()
    inFlight.current = operation
    try {
      return await operation
    } finally {
      if (inFlight.current === operation) inFlight.current = null
    }
  }, [connection, connectionKey, onRemoteOptions])

  useEffect(() => {
    if (!enabled) return
    void test()
    const schedule = () => window.setInterval(() => {
      if (!busy) void test()
    }, document.visibilityState === 'visible' ? 5_000 : 25_000)
    let interval = schedule()
    const onVisibility = () => {
      window.clearInterval(interval)
      interval = schedule()
      if (!busy && document.visibilityState === 'visible') void test()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [busy, enabled, test])

  return { phase: enabled ? phase : 'unconfigured', result, testing, test, setResult, setPhase }
}
