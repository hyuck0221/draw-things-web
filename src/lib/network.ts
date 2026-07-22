export type BrowserTargetAddressSpace = 'loopback' | 'local' | 'public'

function normalizedHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, '').toLowerCase()
}

function canonicalIpv6(host: string): string | undefined {
  const normalized = normalizedHost(host)
  if (!normalized.includes(':')) return undefined
  try {
    return new URL(`http://[${normalized}]`).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return undefined
  }
}

export function isTailscaleIpv4(host: string): boolean {
  const parts = normalizedHost(host).split('.').map(Number)
  return parts.length === 4
    && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && parts[0] === 100
    && (parts[1] ?? 0) >= 64
    && (parts[1] ?? 0) <= 127
}

export function tailscaleAddress(host: string): string | undefined {
  const normalized = normalizedHost(host)
  if (isTailscaleIpv4(normalized)) return normalized
  if (normalized.startsWith('fd7a:115c:a1e0:')) {
    return canonicalIpv6(normalized)
  }
  return undefined
}

export function isTailscaleMagicDnsHost(host: string): boolean {
  const normalized = normalizedHost(host).replace(/\.$/, '')
  return normalized !== 'ts.net'
    && normalized.endsWith('.ts.net')
    && /^[a-z0-9.-]+$/.test(normalized)
}

export function targetAddressSpaceForHost(host: string): BrowserTargetAddressSpace {
  const normalized = normalizedHost(host)
  if (normalized === 'localhost' || normalized === '::1') return 'loopback'
  const ipv4 = normalized.split('.').map(Number)
  const validIpv4 = ipv4.length === 4
    && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  if (validIpv4 && ipv4[0] === 127) return 'loopback'
  const privateIpv4 = validIpv4 && (ipv4[0] === 10
    || (ipv4[0] === 172 && (ipv4[1] ?? 0) >= 16 && (ipv4[1] ?? 0) <= 31)
    || (ipv4[0] === 192 && ipv4[1] === 168)
    || (ipv4[0] === 169 && ipv4[1] === 254)
    || normalized === '0.0.0.0')
  const ipv6 = canonicalIpv6(normalized)
  if (privateIpv4 || isTailscaleIpv4(normalized) || isTailscaleMagicDnsHost(normalized) || normalized.endsWith('.local')
    || (ipv6 && (ipv6.startsWith('fc') || ipv6.startsWith('fd') || ipv6.startsWith('fe80:')))) {
    return 'local'
  }
  return 'public'
}

export function suggestedBridgeUrl(pageUrl: string, currentBridgeUrl: string): string {
  try {
    const page = new URL(pageUrl)
    const current = new URL(currentBridgeUrl)
    const currentHost = normalizedHost(current.hostname)
    const pageTailscaleAddress = tailscaleAddress(page.hostname)
    if (page.protocol !== 'http:' || !pageTailscaleAddress
      || !['localhost', '127.0.0.1', '::1'].includes(currentHost)) {
      return currentBridgeUrl
    }
    const urlHost = pageTailscaleAddress.includes(':') ? `[${pageTailscaleAddress}]` : pageTailscaleAddress
    return `${page.protocol}//${urlHost}:47821`
  } catch {
    return currentBridgeUrl
  }
}
