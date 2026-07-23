const TAILSCALE_DNS_SUFFIX = '.ts.net'

export function isVercelOrigin(hostname = window.location.hostname) {
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app')
}

/**
 * A deployed UI may only call a private Tailscale Serve HTTPS endpoint.  This
 * keeps an accidentally pasted public URL (or a URL with credentials/path
 * tricks) out of the image-generation request path.
 */
export function normalizeTailscaleGatewayUrl(value: string | undefined) {
  const input = value?.trim()
  if (!input || input.length > 2_048) return undefined
  try {
    const url = new URL(input)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (url.protocol !== 'https:'
      || !hostname.endsWith(TAILSCALE_DNS_SUFFIX)
      || hostname === TAILSCALE_DNS_SUFFIX.slice(1)
      || url.username
      || url.password
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search
      || url.hash) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

export function configuredGatewayUrl(gatewayUrl?: string) {
  return isVercelOrigin() ? normalizeTailscaleGatewayUrl(gatewayUrl) : undefined
}

export function shouldOpenInitialConnectionDialog(gatewayUrl?: string, hostname = window.location.hostname) {
  return isVercelOrigin(hostname) && !normalizeTailscaleGatewayUrl(gatewayUrl)
}

export function apiRequestUrl(path: string, gatewayUrl?: string) {
  const gateway = configuredGatewayUrl(gatewayUrl)
  if (isVercelOrigin() && !gateway) return undefined
  return gateway ? new URL(path, gateway).toString() : path
}

export function apiConnectionOrigin(gatewayUrl?: string) {
  return configuredGatewayUrl(gatewayUrl) ?? window.location.origin
}
