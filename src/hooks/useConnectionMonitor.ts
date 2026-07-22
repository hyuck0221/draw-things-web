import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionPhase, ConnectionTestResult } from '../domain/types'
import { testConnection } from '../lib/draw-things/client'

export function useConnectionMonitor({
  busy,
  onRemoteOptions,
}: {
  busy: boolean
  onRemoteOptions: (options: Record<string, unknown>) => void
}) {
  const [phase, setPhase] = useState<ConnectionPhase>('connecting')
  const [result, setResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const failures = useRef(0)
  const inFlight = useRef<Promise<ConnectionTestResult> | null>(null)

  const test = useCallback(async () => {
    if (inFlight.current) return inFlight.current
    const execute = async () => {
      setTesting(true)
      try {
        const next = await testConnection()
        setResult(next)
        if (next.ok) {
          failures.current = 0
          setPhase(next.phase)
          if (next.remoteOptions) {
            onRemoteOptions(next.remoteOptions)
          }
        } else {
          failures.current += 1
          if (next.phase === 'api-mismatch') {
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
  }, [onRemoteOptions])

  useEffect(() => {
    if (!busy) void test()
    const interval = window.setInterval(() => {
      if (!busy) void test()
    }, 5_000)
    const onVisibility = () => {
      if (!busy && document.visibilityState === 'visible') void test()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [busy, test])

  return { phase, result, testing, test, setResult, setPhase }
}
