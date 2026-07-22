import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { BridgeError, LOOPBACK_HOSTS, type LoopbackHost, type NormalizedConnection } from './types.ts'

export const DEFAULT_BRIDGE_PORT = 47821
export const DEFAULT_DRAW_THINGS_PORT = 7859
export const MAX_CONTROL_BODY_BYTES = 256 * 1024
export const MAX_GENERATE_BODY_BYTES = 128 * 1024 * 1024
export const MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024 * 1024

export const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://[::1]:4173',
] as const

const SAFE_REQUEST_HEADERS = new Set([
  'authorization',
  'content-type',
  'x-draw-things-bridge-token',
  'x-draw-things-pairing-token',
])

export function normalizeOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new BridgeError('INVALID_ORIGIN', `Invalid origin: ${value}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin === 'null') {
    throw new BridgeError('INVALID_ORIGIN', `Only http(s) origins are supported: ${value}`)
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new BridgeError('INVALID_ORIGIN', `Origin must not include credentials, a path, query, or fragment: ${value}`)
  }
  return parsed.origin
}

export function isLoopbackBindAddress(value: string): boolean {
  return value === '127.0.0.1' || value === '::1'
}

export function normalizeBridgeBindAddress(value: unknown): string {
  if (value !== undefined && typeof value !== 'string') {
    throw new BridgeError('INVALID_BRIDGE_BIND', 'Bridge bind must be a string address.')
  }
  const raw = typeof value === 'string' ? value.trim().replace(/^\[|\]$/g, '').toLowerCase() : '127.0.0.1'
  if (raw === 'localhost' || raw === '127.0.0.1') return '127.0.0.1'
  if (raw === '::1') return '::1'
  if (raw === '100.100.100.100') {
    throw new BridgeError('INVALID_BRIDGE_BIND', 'The Tailscale Quad100 service address cannot be used as a connector bind address.')
  }
  if (isIP(raw) === 4) {
    const octets = raw.split('.').map(Number)
    if (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) return raw
  }
  if (isIP(raw) === 6 && raw.startsWith('fd7a:115c:a1e0:')) {
    return new URL(`http://[${raw}]`).hostname.replace(/^\[|\]$/g, '')
  }
  throw new BridgeError(
    'INVALID_BRIDGE_BIND',
    'Bridge bind must be 127.0.0.1, ::1, or this Mac\'s Tailscale IP. Wildcard, LAN, and public addresses are rejected.',
  )
}

export function normalizeLoopbackHost(value: unknown): LoopbackHost {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '127.0.0.1'
  const unbracketed = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw
  if (!(LOOPBACK_HOSTS as readonly string[]).includes(unbracketed)) {
    throw new BridgeError(
      'LOOPBACK_REQUIRED',
      'The local connector only permits localhost, 127.0.0.1, or ::1.',
    )
  }
  return unbracketed as LoopbackHost
}

export function normalizeFingerprint(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new BridgeError('INVALID_TLS_FINGERPRINT', 'TLS fingerprint must be a SHA-256 string.')
  }
  const normalized = value.replaceAll(':', '').trim().toUpperCase()
  if (!/^[A-F0-9]{64}$/.test(normalized)) {
    throw new BridgeError(
      'INVALID_TLS_FINGERPRINT',
      'TLS fingerprint must contain exactly 64 hexadecimal SHA-256 characters.',
    )
  }
  return normalized.match(/.{2}/g)?.join(':')
}

function normalizePort(value: unknown): number {
  const port = value === undefined ? DEFAULT_DRAW_THINGS_PORT : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new BridgeError('INVALID_PORT', 'Port must be an integer from 1 to 65535.')
  }
  return port
}

function normalizeTimeout(value: unknown, fallback: number, maximum: number): number {
  const timeout = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(timeout) || timeout < 250 || timeout > maximum) {
    throw new BridgeError(
      'INVALID_TIMEOUT',
      `Timeout must be an integer from 250 to ${maximum} milliseconds.`,
    )
  }
  return timeout
}

export function normalizeConnection(
  value: unknown,
  purpose: 'control' | 'generation' = 'control',
): NormalizedConnection {
  if (!isPlainObject(value)) {
    throw new BridgeError('INVALID_CONNECTION', 'connection must be a JSON object.')
  }
  const protocol = value.protocol
  if (protocol !== 'http' && protocol !== 'grpc') {
    throw new BridgeError('INVALID_PROTOCOL', 'protocol must be either "http" or "grpc".')
  }
  const sharedSecret = value.sharedSecret
  if (sharedSecret !== undefined && (typeof sharedSecret !== 'string' || sharedSecret.length > 4096)) {
    throw new BridgeError('INVALID_SHARED_SECRET', 'sharedSecret must be a string up to 4096 characters.')
  }
  const clientName = value.clientName ?? 'draw-things-web'
  if (typeof clientName !== 'string' || clientName.length < 1 || clientName.length > 128
    || [...clientName].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code <= 31 || code === 127
    })) {
    throw new BridgeError('INVALID_CLIENT_NAME', 'clientName must contain 1-128 printable characters.')
  }
  const fallbackTimeout = purpose === 'generation' ? 15 * 60_000 : 4_000
  const maximumTimeout = purpose === 'generation' ? 60 * 60_000 : 60_000
  return {
    protocol,
    host: normalizeLoopbackHost(value.host),
    port: normalizePort(value.port),
    tls: value.tls === true,
    verifyTls: value.verifyTls === true || value.allowSelfSignedCertificate === false,
    tlsFingerprintSha256: normalizeFingerprint(value.tlsFingerprintSha256),
    sharedSecret,
    clientName,
    timeoutMs: normalizeTimeout(value.timeoutMs, fallbackTimeout, maximumTimeout),
  }
}

export function publicConnection(connection: NormalizedConnection) {
  const { sharedSecret, ...safe } = connection
  return { ...safe, hasSharedSecret: Boolean(sharedSecret) }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 64) throw new BridgeError('JSON_TOO_DEEP', 'JSON nesting exceeds 64 levels.')
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1)
    return
  }
  if (!isPlainObject(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new BridgeError('UNSAFE_JSON_KEY', `JSON key "${key}" is not allowed.`)
    }
    assertSafeJson(child, depth + 1)
  }
}

export async function readJsonBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new BridgeError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.', 415)
  }

  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new BridgeError('BODY_TOO_LARGE', `Request body exceeds ${limit} bytes.`, 413)
  }

  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += buffer.length
    if (received > limit) {
      throw new BridgeError('BODY_TOO_LARGE', `Request body exceeds ${limit} bytes.`, 413)
    }
    chunks.push(buffer)
  }
  if (received === 0) throw new BridgeError('EMPTY_BODY', 'A JSON request body is required.')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new BridgeError('INVALID_JSON', 'Request body is not valid JSON.')
  }
  assertSafeJson(parsed)
  return parsed
}

export function validateHostHeader(
  request: IncomingMessage,
  expectedPort: number,
  bindAddress = '127.0.0.1',
): void {
  const header = request.headers.host
  if (!header || /[\\/?#@\s]/.test(header)) {
    throw new BridgeError('INVALID_HOST', 'Invalid Host header.', 403)
  }
  let parsed: URL
  try {
    parsed = new URL(`http://${header}`)
  } catch {
    throw new BridgeError('INVALID_HOST', 'Invalid Host header.', 403)
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const port = parsed.port ? Number(parsed.port) : 80
  const allowedHosts = isLoopbackBindAddress(bindAddress)
    ? LOOPBACK_HOSTS as readonly string[]
    : [bindAddress]
  if (!allowedHosts.includes(host) || port !== expectedPort) {
    throw new BridgeError('INVALID_HOST', 'Host must exactly address the configured connector bind and port.', 403)
  }
}

export function validateOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
): string | undefined {
  const originHeader = request.headers.origin
  if (originHeader === undefined) return undefined
  if (Array.isArray(originHeader) || !allowedOrigins.has(originHeader)) {
    throw new BridgeError('ORIGIN_NOT_ALLOWED', 'This website origin is not allowed.', 403)
  }
  response.setHeader('Access-Control-Allow-Origin', originHeader)
  response.setHeader(
    'Vary',
    'Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network',
  )
  return originHeader
}

export function handlePreflight(
  request: IncomingMessage,
  response: ServerResponse,
  allowedMethods: readonly string[],
): void {
  const requestedMethod = String(request.headers['access-control-request-method'] ?? '').toUpperCase()
  if (!allowedMethods.includes(requestedMethod)) {
    throw new BridgeError('METHOD_NOT_ALLOWED', 'Requested CORS method is not allowed.', 405)
  }
  const requestedHeaders = String(request.headers['access-control-request-headers'] ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  if (requestedHeaders.some((header) => !SAFE_REQUEST_HEADERS.has(header))) {
    throw new BridgeError('HEADER_NOT_ALLOWED', 'Requested CORS headers are not allowed.', 403)
  }
  response.statusCode = 204
  response.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '))
  response.setHeader('Access-Control-Allow-Headers', [...SAFE_REQUEST_HEADERS].join(', '))
  response.setHeader('Access-Control-Max-Age', '600')
  if (String(request.headers['access-control-request-private-network']).toLowerCase() === 'true') {
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  response.end()
}

function constantTimeMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash('sha256').update(actual).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualDigest, expectedDigest)
}

export function validateToken(request: IncomingMessage, expected?: string): void {
  if (!expected) return
  const authorization = request.headers.authorization
  const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : undefined
  const custom = request.headers['x-draw-things-bridge-token']
  const pairing = request.headers['x-draw-things-pairing-token']
  const candidate = bearer
    ?? (typeof custom === 'string' ? custom : undefined)
    ?? (typeof pairing === 'string' ? pairing : '')
  if (!constantTimeMatch(candidate, expected)) {
    throw new BridgeError('UNAUTHORIZED', 'A valid bridge pairing token is required.', 401)
  }
}

export function sanitizeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) return error
  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.name === 'AbortError' || nodeError.code === 'ABORT_ERR') {
      return new BridgeError('ABORTED', 'The operation was cancelled.', 499)
    }
    if (nodeError.code === 'ECONNREFUSED') {
      return new BridgeError('CONNECTION_REFUSED', 'Draw Things refused the local connection.', 502)
    }
    if (nodeError.code === 'ETIMEDOUT' || nodeError.code === 'ERR_HTTP2_PING_CANCEL') {
      return new BridgeError('UPSTREAM_TIMEOUT', 'Draw Things did not respond before the timeout.', 504)
    }
    if (nodeError.code?.startsWith('CERT_') || nodeError.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      return new BridgeError('TLS_VERIFICATION_FAILED', error.message, 502)
    }
    return new BridgeError(nodeError.code ?? 'UPSTREAM_ERROR', error.message, 502)
  }
  return new BridgeError('UNKNOWN_ERROR', 'An unknown connector error occurred.', 500)
}
