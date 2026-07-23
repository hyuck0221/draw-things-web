import { describe, expect, it } from 'vitest'
import {
  apiRequestUrl,
  isVercelOrigin,
  normalizeTailscaleGatewayUrl,
  shouldOpenInitialConnectionDialog,
} from './endpoint'

describe('Tailscale gateway endpoint validation', () => {
  it('accepts only a bare HTTPS MagicDNS origin', () => {
    expect(normalizeTailscaleGatewayUrl('https://hshim.taila7bd14.ts.net/')).toBe(
      'https://hshim.taila7bd14.ts.net',
    )
    expect(normalizeTailscaleGatewayUrl('https://hshim.taila7bd14.ts.net:8443')).toBe(
      'https://hshim.taila7bd14.ts.net:8443',
    )
  })

  it.each([
    'http://hshim.taila7bd14.ts.net',
    'https://hshim.taila7bd14.ts.net/api',
    'https://user:password@hshim.taila7bd14.ts.net',
    'https://example.com',
    'not a URL',
  ])('rejects unsafe or non-Tailscale gateway URLs: %s', (value) => {
    expect(normalizeTailscaleGatewayUrl(value)).toBeUndefined()
  })

  it('keeps local and Tailscale-IP pages same-origin', () => {
    expect(isVercelOrigin('100.121.194.59')).toBe(false)
    expect(apiRequestUrl('/sdapi/v1/options', 'https://hshim.taila7bd14.ts.net')).toBe('/sdapi/v1/options')
  })

  it('opens the Vercel connection dialog only when no valid gateway is saved', () => {
    expect(shouldOpenInitialConnectionDialog(undefined, 'draw-things-web.vercel.app')).toBe(true)
    expect(shouldOpenInitialConnectionDialog('https://hshim.taila7bd14.ts.net', 'draw-things-web.vercel.app')).toBe(false)
    expect(shouldOpenInitialConnectionDialog(undefined, '100.121.194.59')).toBe(false)
  })
})
