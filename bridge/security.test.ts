import { describe, expect, it } from 'vitest'
import { normalizeBridgeBindAddress, normalizeConnection, normalizeFingerprint, normalizeOrigin } from './security.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

describe('connector security boundaries', () => {
  it('only accepts exact loopback hosts', () => {
    expect(normalizeConnection({ protocol: 'http', host: '[::1]', port: 7859 }).host).toBe('::1')
    expect(() => normalizeConnection({ protocol: 'http', host: '127.0.0.2', port: 7859 }))
      .toThrow(/only permits localhost/)
    expect(() => normalizeConnection({ protocol: 'http', host: 'example.com', port: 7859 }))
      .toThrow(/only permits localhost/)
  })

  it('allows explicit Tailscale binds but rejects wildcard, LAN, and Quad100 addresses', () => {
    expect(normalizeBridgeBindAddress('100.121.194.59')).toBe('100.121.194.59')
    expect(normalizeBridgeBindAddress('fd7a:115c:a1e0:0000:0000:0000:0000:1234')).toBe('fd7a:115c:a1e0::1234')
    expect(() => normalizeBridgeBindAddress('0.0.0.0')).toThrow(/Wildcard, LAN, and public/)
    expect(() => normalizeBridgeBindAddress('192.168.0.2')).toThrow(/Wildcard, LAN, and public/)
    expect(() => normalizeBridgeBindAddress('100.100.100.100')).toThrow(/Quad100/)
  })

  it('normalizes SHA-256 pins and rejects malformed values', () => {
    const raw = 'a1'.repeat(32)
    expect(normalizeFingerprint(raw)).toBe(Array.from({ length: 32 }, () => 'A1').join(':'))
    expect(() => normalizeFingerprint('aa:bb')).toThrow(/64 hexadecimal/)
  })

  it('rejects origin values containing paths or credentials', () => {
    expect(normalizeOrigin('https://canvas.example')).toBe('https://canvas.example')
    expect(() => normalizeOrigin('https://canvas.example/path')).toThrow(/must not include/)
    expect(() => normalizeOrigin('https://user@canvas.example')).toThrow(/must not include/)
  })
})
