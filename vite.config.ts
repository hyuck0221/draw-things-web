import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import {
  request as requestHttp,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { request as requestHttps } from 'node:https'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import {
  defaultDrawThingsModelDirectories,
  listLocalDrawThingsModels,
  type LocalModelCatalog,
} from './server/model-catalog'

const MAXIMUM_REQUEST_BYTES = 128 * 1024 * 1024
const MAXIMUM_OPTIONS_RESPONSE_BYTES = 2 * 1024 * 1024
const MAXIMUM_GENERATION_RESPONSE_BYTES = 128 * 1024 * 1024
const MAXIMUM_DIMENSION = 8_192
const MAXIMUM_BATCH_COUNT = 100
const MAXIMUM_BATCH_SIZE = 4
const MAXIMUM_OUTPUT_IMAGES = MAXIMUM_BATCH_COUNT * MAXIMUM_BATCH_SIZE
const MAXIMUM_TOTAL_PIXELS = 8_192 * 8_192
const OPTIONS_TIMEOUT_MS = 5_000
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}
const DEVELOPMENT_SECURITY_HEADERS = {
  ...SECURITY_HEADERS,
  'content-security-policy': SECURITY_HEADERS['content-security-policy'].replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'",
  ),
}

function drawThingsApiOrigin() {
  const configured = (process.env.DRAW_THINGS_API_ORIGIN ?? 'http://127.0.0.1:7860').trim()
  const parsed = new URL(configured)
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search || parsed.hash) {
    throw new Error('DRAW_THINGS_API_ORIGIN must be an HTTP(S) origin without credentials, a path, or a query.')
  }
  return parsed
}

function normalizedAddress(value: string | undefined) {
  return (value ?? '').replace(/^::ffff:/, '').split('%')[0] ?? ''
}

function isLoopback(value: string) {
  return value === '127.0.0.1' || value === '::1'
}

function isLoopbackHost(value: string) {
  return isLoopback(value) || value === 'localhost' || value.endsWith('.localhost')
}

function normalizedHost(value: string | undefined) {
  if (!value || value.includes(',')) return ''
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return ''
  }
}

function configuredAllowedHosts() {
  return (process.env.DRAW_THINGS_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => normalizedHost(value.trim()))
    .filter(Boolean)
}

function canReply(response: ServerResponse) {
  return !response.destroyed && !response.writableEnded
}

function sendError(response: ServerResponse, status: number, message: string) {
  if (!canReply(response)) return
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify({ ok: false, message }))
}

function sendJson(response: ServerResponse, status: number, body: unknown, maximumBytes?: number) {
  if (!canReply(response)) return
  const encoded = JSON.stringify(body)
  if (maximumBytes !== undefined && Buffer.byteLength(encoded) > maximumBytes) {
    sendError(response, 502, '로컬 모델 목록이 안전한 크기 제한을 초과했습니다.')
    return
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(encoded)),
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(encoded)
}

function configuredModelDirectories() {
  return (process.env.DRAW_THINGS_MODEL_DIRECTORIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function macScreenIsLocked() {
  if (process.platform !== 'darwin') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    execFile('/usr/sbin/ioreg', ['-n', 'Root', '-d1'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 1_000,
    }, (_error, stdout) => {
      resolve(/"IOConsoleLocked"\s*=\s*Yes/.test(stdout)
        || /"CGSSessionScreenIsLocked"\s*=\s*Yes/.test(stdout))
    })
  })
}

export function apiRequestKind(rawUrl: string, method: string | undefined) {
  const queryIndex = rawUrl.indexOf('?')
  const pathname = rawUrl.slice(0, queryIndex < 0 ? rawUrl.length : queryIndex)
  const normalizedMethod = method?.toUpperCase() ?? ''
  if (pathname.startsWith('/local-api')) {
    if (normalizedMethod === 'GET' && pathname === '/local-api/v1/models') return 'models' as const
    return 'rejected' as const
  }
  if (!pathname.startsWith('/sdapi')) return 'unrelated' as const
  if (normalizedMethod === 'GET' && pathname === '/sdapi/v1/options') return 'options' as const
  if (normalizedMethod === 'POST'
    && (pathname === '/sdapi/v1/txt2img' || pathname === '/sdapi/v1/img2img')) {
    return 'generation' as const
  }
  return 'rejected' as const
}

export function generationBodyTimeoutMs(declaredLength: number) {
  const configured = Number(process.env.DRAW_THINGS_BODY_TIMEOUT_MS)
  if (Number.isSafeInteger(configured) && configured >= 100 && configured <= 300_000) {
    return configured
  }
  const uploadAllowance = Math.ceil(declaredLength / (1024 * 1024)) * 2_000
  return Math.min(180_000, 15_000 + uploadAllowance)
}

export function upstreamHostname(target: URL) {
  return target.hostname.replace(/^\[|\]$/g, '')
}

interface ForwardRequest {
  request: IncomingMessage
  response: ServerResponse
  targetOrigin: URL
  body?: Buffer
  maximumResponseBytes: number
  timeoutMs?: number
  release: () => void
}

function forwardToDrawThings({
  request,
  response,
  targetOrigin,
  body,
  maximumResponseBytes,
  timeoutMs,
  release,
}: ForwardRequest) {
  const target = new URL(request.url ?? '/', targetOrigin)
  const headers: Record<string, string> = {
    accept: 'application/json',
    'cache-control': 'no-store',
    'user-agent': 'draw-things-web-local-gateway',
  }
  if (body) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(body.byteLength)
  }

  let settled = false
  let downstreamOpen = canReply(response)
  const chunks: Buffer[] = []
  let received = 0

  response.once('close', () => {
    downstreamOpen = false
    chunks.length = 0
  })

  const finish = (errorMessage?: string) => {
    if (settled) return
    settled = true
    release()
    if (errorMessage && downstreamOpen) sendError(response, 502, errorMessage)
  }

  const handleResponse = (upstreamResponse: IncomingMessage) => {
    const declaredResponseLength = Number(upstreamResponse.headers['content-length'])
    if (Number.isFinite(declaredResponseLength) && declaredResponseLength > maximumResponseBytes) {
      finish('Draw Things 응답이 안전한 크기 제한을 초과했습니다.')
      upstreamResponse.destroy()
      return
    }

    upstreamResponse.on('data', (chunk: Buffer) => {
      received += chunk.byteLength
      if (received > maximumResponseBytes) {
        finish('Draw Things 응답이 안전한 크기 제한을 초과했습니다.')
        upstreamResponse.destroy()
        upstreamRequest.destroy()
        return
      }
      if (downstreamOpen) chunks.push(chunk)
    })
    upstreamResponse.once('aborted', () => finish('Draw Things가 응답 전송을 중단했습니다.'))
    upstreamResponse.once('error', () => finish('Draw Things 응답을 읽지 못했습니다.'))
    upstreamResponse.once('end', () => {
      if (settled) return
      settled = true
      release()
      if (!downstreamOpen || !canReply(response)) return
      const contentType = upstreamResponse.headers['content-type']
      response.statusCode = upstreamResponse.statusCode ?? 502
      response.setHeader(
        'content-type',
        typeof contentType === 'string' ? contentType : 'application/json; charset=utf-8',
      )
      response.setHeader('content-length', String(received))
      response.end(Buffer.concat(chunks, received))
    })
    upstreamResponse.once('close', () => {
      if (!upstreamResponse.complete) finish('Draw Things 응답 연결이 예기치 않게 종료되었습니다.')
    })
  }

  const commonOptions = {
    protocol: target.protocol,
    hostname: upstreamHostname(target),
    port: target.port,
    path: `${target.pathname}${target.search}`,
    method: request.method,
    headers,
  }
  const upstreamRequest = target.protocol === 'https:'
    ? requestHttps({
        ...commonOptions,
        rejectUnauthorized: process.env.DRAW_THINGS_API_TLS_VERIFY !== 'false',
      }, handleResponse)
    : requestHttp(commonOptions, handleResponse)

  upstreamRequest.once('error', () => finish('Draw Things API에 연결할 수 없습니다.'))
  if (timeoutMs !== undefined) {
    upstreamRequest.setTimeout(timeoutMs, () => {
      finish('Draw Things API 응답 시간이 초과되었습니다.')
      upstreamRequest.destroy()
    })
  }
  upstreamRequest.end(body)
}

function validateGenerationPayload(body: Buffer) {
  let parsed: unknown
  try {
    parsed = JSON.parse(body.toString('utf8')) as unknown
  } catch {
    return { status: 400, message: '생성 요청 JSON이 올바르지 않습니다.' } as const
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 400, message: '생성 요청 JSON은 객체여야 합니다.' } as const
  }
  const parameters = parsed as Record<string, unknown>
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(parameters, key)
  if ((hasOwn('batch_count') && hasOwn('n_iter'))
    || (hasOwn('upscaler_scale') && hasOwn('upscaler_scale_factor'))) {
    return { status: 422, message: '같은 생성 설정의 canonical 키와 별칭을 동시에 보낼 수 없습니다.' } as const
  }
  const width = Number(parameters.width)
  const height = Number(parameters.height)
  const batchCount = Number(parameters.batch_count ?? parameters.n_iter ?? 1)
  const batchSize = Number(parameters.batch_size ?? 1)
  const upscaler = typeof parameters.upscaler === 'string' ? parameters.upscaler.trim() : ''
  const upscalerScale = Number(parameters.upscaler_scale ?? parameters.upscaler_scale_factor ?? 0)
  const outputScale = upscaler && upscalerScale > 1 ? upscalerScale : 1
  const outputImages = batchCount * batchSize
  const totalPixels = width * height * outputImages * outputScale * outputScale
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 128 || height < 128 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION
    || !Number.isInteger(batchCount) || !Number.isInteger(batchSize)
    || batchCount < 1 || batchCount > MAXIMUM_BATCH_COUNT
    || batchSize < 1 || batchSize > MAXIMUM_BATCH_SIZE
    || outputImages > MAXIMUM_OUTPUT_IMAGES
    || (upscaler && (!Number.isInteger(upscalerScale) || upscalerScale < 0 || upscalerScale > 4))
    || !Number.isSafeInteger(totalPixels) || totalPixels > MAXIMUM_TOTAL_PIXELS) {
    return { status: 422, message: '생성 크기 또는 배치가 안전한 작업 한도를 벗어났습니다.' } as const
  }
  return undefined
}

export function createDrawThingsApiMiddleware() {
  const targetOrigin = drawThingsApiOrigin()
  const allowedClients = new Set((process.env.DRAW_THINGS_ALLOWED_CLIENTS ?? '')
    .split(',')
    .map((value) => normalizedAddress(value.trim()))
    .filter(Boolean))
  const allowedHosts = new Set(configuredAllowedHosts())
  let activeGeneration = false
  let activeOptionsRequests = 0
  let activeModelCatalogRequest: Promise<LocalModelCatalog> | null = null
  let cachedModelCatalog: LocalModelCatalog | null = null

  const loadModelCatalog = () => {
    if (activeModelCatalogRequest) return activeModelCatalogRequest
    const configuredDirectories = configuredModelDirectories()
    const operation = (async () => {
      const locked = await macScreenIsLocked()
      const catalog = locked
        ? {
            models: [],
            directoriesScanned: 0,
            warnings: ['Mac이 잠겨 있어 설치 모델 폴더를 읽지 못했습니다. 잠금 해제 후 다시 확인하세요.'],
          }
        : await (async () => {
            const directories = configuredDirectories.length
              ? [...await defaultDrawThingsModelDirectories(), ...configuredDirectories]
              : undefined
            return listLocalDrawThingsModels(directories)
          })()
      if (catalog.models.length > 0) cachedModelCatalog = catalog
      if (catalog.models.length === 0 && cachedModelCatalog) {
        return {
          ...cachedModelCatalog,
          warnings: [...new Set([
            ...catalog.warnings,
            '현재 모델 폴더를 읽지 못해 마지막으로 확인한 설치 목록을 표시합니다.',
          ])],
        }
      }
      return catalog
    })()
    activeModelCatalogRequest = operation
    const release = () => {
      if (activeModelCatalogRequest === operation) activeModelCatalogRequest = null
    }
    void operation.then(release, release)
    return operation
  }

  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const rawUrl = request.url ?? '/'
    const requestKind = apiRequestKind(rawUrl, request.method)
    if (requestKind === 'unrelated') {
      next()
      return
    }

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value)
    response.setHeader('cache-control', 'no-store')

    const remote = normalizedAddress(request.socket.remoteAddress)
    const local = normalizedAddress(request.socket.localAddress)
    if (!isLoopback(remote) && remote !== local && !allowedClients.has(remote)) {
      sendError(response, 403, '이 기기는 Draw Things API 사용이 허용되지 않았습니다.')
      return
    }
    const host = normalizedHost(request.headers.host)
    if (!host || (!isLoopbackHost(host) && host !== local && !allowedHosts.has(host))) {
      sendError(response, 403, '이 호스트 이름에서는 Draw Things API를 사용할 수 없습니다.')
      return
    }

    if (requestKind === 'rejected') {
      sendError(response, 404, '지원하지 않는 Draw Things API 경로입니다.')
      return
    }

    if (requestKind === 'models') {
      void loadModelCatalog()
        .then((catalog) => sendJson(response, 200, catalog, MAXIMUM_OPTIONS_RESPONSE_BYTES))
        .catch(() => sendError(response, 500, 'Draw Things 로컬 모델 목록을 읽지 못했습니다.'))
      return
    }

    if (requestKind === 'options') {
      if (activeGeneration) {
        sendError(response, 429, '이미지 생성 중에는 API 상태를 확인할 수 없습니다.')
        return
      }
      activeOptionsRequests += 1
      let released = false
      const release = () => {
        if (released) return
        released = true
        activeOptionsRequests = Math.max(0, activeOptionsRequests - 1)
      }
      forwardToDrawThings({
        request,
        response,
        targetOrigin,
        maximumResponseBytes: MAXIMUM_OPTIONS_RESPONSE_BYTES,
        timeoutMs: OPTIONS_TIMEOUT_MS,
        release,
      })
      return
    }

    if (activeGeneration) {
      sendError(response, 429, '이미지 생성은 한 번에 하나만 실행할 수 있습니다.')
      return
    }
    if (activeOptionsRequests > 0) {
      sendError(response, 429, 'API 상태 확인이 끝난 뒤 이미지 생성을 다시 시도하세요.')
      return
    }
    if (request.headers.expect) {
      sendError(response, 417, 'Expect 요청 헤더는 지원하지 않습니다.')
      return
    }
    const mediaType = String(request.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      sendError(response, 415, '생성 요청은 application/json 형식이어야 합니다.')
      return
    }
    if (request.headers['transfer-encoding']) {
      sendError(response, 411, '생성 요청에는 Content-Length가 필요합니다.')
      return
    }
    const declaredLength = Number(request.headers['content-length'])
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 2) {
      sendError(response, 411, '생성 요청에는 유효한 Content-Length가 필요합니다.')
      return
    }
    if (declaredLength > MAXIMUM_REQUEST_BYTES) {
      sendError(response, 413, '생성 요청이 안전한 크기 제한을 초과했습니다.')
      return
    }

    activeGeneration = true
    let released = false
    let bodySettled = false
    let upstreamStarted = false
    const release = () => {
      if (released) return
      released = true
      activeGeneration = false
    }
    const chunks: Buffer[] = []
    let received = 0
    const bodyTimeout = setTimeout(() => {
      if (bodySettled || upstreamStarted) return
      bodySettled = true
      release()
      response.setHeader('connection', 'close')
      response.once('finish', () => request.socket.destroy())
      sendError(response, 408, '생성 요청 본문 전송 시간이 초과되었습니다.')
      request.resume()
    }, generationBodyTimeoutMs(declaredLength))
    const stopBodyTimer = () => clearTimeout(bodyTimeout)

    request.on('data', (chunk: Buffer) => {
      if (bodySettled) return
      received += chunk.byteLength
      if (received <= MAXIMUM_REQUEST_BYTES) chunks.push(chunk)
    })
    request.once('aborted', () => {
      if (upstreamStarted || bodySettled) return
      bodySettled = true
      stopBodyTimer()
      release()
    })
    request.once('error', () => {
      if (upstreamStarted || bodySettled) return
      bodySettled = true
      stopBodyTimer()
      release()
      sendError(response, 400, '생성 요청을 읽지 못했습니다.')
    })
    response.once('close', () => {
      if (upstreamStarted || bodySettled) return
      bodySettled = true
      stopBodyTimer()
      release()
    })
    request.once('end', () => {
      if (bodySettled) return
      bodySettled = true
      stopBodyTimer()
      if (received !== declaredLength || received > MAXIMUM_REQUEST_BYTES) {
        release()
        sendError(response, received > MAXIMUM_REQUEST_BYTES ? 413 : 400, '생성 요청 크기가 올바르지 않습니다.')
        return
      }
      const body = Buffer.concat(chunks, received)
      const validationError = validateGenerationPayload(body)
      if (validationError) {
        release()
        sendError(response, validationError.status, validationError.message)
        return
      }
      upstreamStarted = true
      forwardToDrawThings({
        request,
        response,
        targetOrigin,
        body,
        maximumResponseBytes: MAXIMUM_GENERATION_RESPONSE_BYTES,
        release,
      })
    })
  }
}

function drawThingsApiGateway(): Plugin {
  const middleware = createDrawThingsApiMiddleware()
  return {
    name: 'draw-things-api-gateway',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  appType: 'mpa',
  plugins: [drawThingsApiGateway(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: configuredAllowedHosts(),
    headers: DEVELOPMENT_SECURITY_HEADERS,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: configuredAllowedHosts(),
    headers: SECURITY_HEADERS,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
