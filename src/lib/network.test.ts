import { describe, expect, it } from 'vitest'
import { isTailscaleIpv4, suggestedBridgeUrl, tailscaleAddress, targetAddressSpaceForHost } from './network'

describe('browser network addressing', () => {
  it('classifies Tailscale IPv4 addresses as local instead of loopback', () => {
    expect(isTailscaleIpv4('100.121.194.59')).toBe(true)
    expect(targetAddressSpaceForHost('100.121.194.59')).toBe('local')
    expect(targetAddressSpaceForHost('127.0.0.1')).toBe('loopback')
    expect(targetAddressSpaceForHost('8.8.8.8')).toBe('public')
    expect(targetAddressSpaceForHost('127.example.com')).toBe('public')
    expect(targetAddressSpaceForHost('fdexample.com')).toBe('public')
    expect(tailscaleAddress('[fd7a:115c:a1e0::1234]')).toBe('fd7a:115c:a1e0::1234')
  })

  it('suggests the Mac Tailscale bridge for a fresh mobile origin', () => {
    expect(suggestedBridgeUrl(
      'http://100.121.194.59:5173/',
      'http://127.0.0.1:47821',
    )).toBe('http://100.121.194.59:47821')
    expect(suggestedBridgeUrl(
      'https://canvas.example/',
      'http://127.0.0.1:47821',
    )).toBe('http://127.0.0.1:47821')
    expect(suggestedBridgeUrl(
      'https://100.121.194.59:5173/',
      'http://127.0.0.1:47821',
    )).toBe('http://127.0.0.1:47821')
    expect(suggestedBridgeUrl(
      'http://[fd7a:115c:a1e0::1234]:5173/',
      'http://127.0.0.1:47821',
    )).toBe('http://[fd7a:115c:a1e0::1234]:47821')
  })
})
