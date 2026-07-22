import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { TLSSocket } from 'node:tls'
import { BridgeError, type CertificateInfo, type NormalizedConnection } from './types.ts'
import { MAX_UPSTREAM_RESPONSE_BYTES, isPlainObject } from './security.ts'
import { certificateInfo, tlsWarnings, verifyPinnedCertificate } from './tls.ts'

const ALLOWED_PATHS = new Set([
  '/',
  '/sdapi/v1/options',
  '/sdapi/v1/txt2img',
  '/sdapi/v1/img2img',
])

export interface HttpJsonResult {
  status: number
  headers: IncomingHttpHeaders
  value: unknown
  certificate?: CertificateInfo
  warnings: string[]
}

async function collectResponse(response: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += buffer.length
    if (received > limit) {
      response.destroy(new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', `Draw Things response exceeds ${limit} bytes.`, 502))
      throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', `Draw Things response exceeds ${limit} bytes.`, 502)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export function requestDrawThingsJson(
  connection: NormalizedConnection,
  method: 'GET' | 'POST',
  path: '/' | '/sdapi/v1/options' | '/sdapi/v1/txt2img' | '/sdapi/v1/img2img',
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<HttpJsonResult> {
  if (connection.protocol !== 'http') {
    throw new BridgeError('HTTP_MODE_REQUIRED', 'This operation requires the Draw Things HTTP API mode.')
  }
  if (!ALLOWED_PATHS.has(path)) {
    throw new BridgeError('PATH_NOT_ALLOWED', 'The requested Draw Things path is not allowed.', 403)
  }
  const serialized = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
  const headers: Record<string, string | number> = {
    accept: 'application/json',
    'user-agent': 'draw-things-web-bridge/0.1.0',
  }
  if (serialized) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = serialized.length
  }

  return new Promise<HttpJsonResult>((resolve, reject) => {
    let settled = false
    let certificate: CertificateInfo | undefined
    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }

    const requestFactory = connection.tls ? requestHttps : requestHttp
    const request: ClientRequest = requestFactory({
      hostname: connection.host,
      port: connection.port,
      method,
      path,
      signal,
      rejectUnauthorized: connection.tls ? connection.verifyTls : undefined,
      headers,
    }, async (response) => {
      try {
        const raw = await collectResponse(response, MAX_UPSTREAM_RESPONSE_BYTES)
        let value: unknown
        try {
          value = raw.length === 0 ? null : JSON.parse(raw.toString('utf8'))
        } catch {
          throw new BridgeError(
            'INVALID_UPSTREAM_JSON',
            'Draw Things returned a response that was not valid JSON.',
            502,
            { status: response.statusCode, preview: raw.subarray(0, 512).toString('utf8') },
          )
        }
        const status = response.statusCode ?? 502
        if (status < 200 || status >= 300) {
          const detail = isPlainObject(value) && typeof value.detail === 'string'
            ? value.detail
            : `Draw Things HTTP API returned status ${status}.`
          throw new BridgeError('DRAW_THINGS_HTTP_ERROR', detail, 502, {
            upstreamStatus: status,
            response: value,
          })
        }
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({
          status,
          headers: response.headers,
          value,
          certificate,
          warnings: tlsWarnings(connection, certificate),
        })
      } catch (error) {
        finishReject(error)
      }
    })

    request.once('error', finishReject)
    const timeout = setTimeout(() => {
      const error = new BridgeError('UPSTREAM_TIMEOUT', 'Draw Things did not respond before the timeout.', 504)
      request.destroy(error)
      finishReject(error)
    }, connection.timeoutMs)
    timeout.unref()

    const send = () => {
      if (settled || request.destroyed) return
      if (serialized) request.end(serialized)
      else request.end()
    }

    if (connection.tls) {
      request.once('socket', (socket) => {
        const tlsSocket = socket as TLSSocket
        tlsSocket.once('secureConnect', () => {
          try {
            certificate = certificateInfo(tlsSocket)
            verifyPinnedCertificate(connection, certificate)
            send()
          } catch (error) {
            request.destroy(error as Error)
            finishReject(error)
          }
        })
      })
    } else {
      send()
    }
  })
}

export async function getHttpOptions(connection: NormalizedConnection): Promise<HttpJsonResult & { options: Record<string, unknown> }> {
  const result = await requestDrawThingsJson(connection, 'GET', '/sdapi/v1/options')
  if (!isPlainObject(result.value)) {
    throw new BridgeError('INVALID_OPTIONS_RESPONSE', 'Draw Things options response must be a JSON object.', 502)
  }
  return { ...result, options: result.value }
}

export async function generateHttpImages(
  connection: NormalizedConnection,
  mode: 'txt2img' | 'img2img',
  parameters: Record<string, unknown>,
  signal: AbortSignal,
): Promise<HttpJsonResult & { images: string[] }> {
  const path = mode === 'txt2img' ? '/sdapi/v1/txt2img' : '/sdapi/v1/img2img'
  const result = await requestDrawThingsJson(connection, 'POST', path, parameters, signal)
  if (!isPlainObject(result.value) || !Array.isArray(result.value.images)
    || result.value.images.some((image) => typeof image !== 'string')) {
    throw new BridgeError(
      'INVALID_GENERATION_RESPONSE',
      'Draw Things generation response did not contain a base64 images array.',
      502,
    )
  }
  return { ...result, images: result.value.images as string[] }
}
