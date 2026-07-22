import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { echoGrpc } from './grpc.ts'
import { generateHttpImages, getHttpOptions } from './http-upstream.ts'
import { defaultDrawThingsModelDirectories, listLocalDrawThingsModels } from './model-catalog.ts'
import {
  DEFAULT_BRIDGE_PORT,
  DEFAULT_DEV_ORIGINS,
  DEFAULT_DRAW_THINGS_PORT,
  MAX_CONTROL_BODY_BYTES,
  MAX_GENERATE_BODY_BYTES,
  handlePreflight,
  isLoopbackBindAddress,
  isPlainObject,
  normalizeBridgeBindAddress,
  normalizeConnection,
  normalizeLoopbackHost,
  normalizeOrigin,
  publicConnection,
  readJsonBody,
  sanitizeError,
  validateHostHeader,
  validateOrigin,
  validateToken,
} from './security.ts'
import { BridgeError, type NormalizedConnection, type ProbeFailure, type ProbeResult, type ProbeSuccess } from './types.ts'

const BRIDGE_VERSION = '0.1.0'
const BRIDGE_NAME = 'draw-things-web-bridge'
const ROUTES = new Map<string, readonly string[]>([
  ['/v1/bridge/health', ['GET']],
  ['/v1/discover', ['POST']],
  ['/v1/test', ['POST']],
  ['/v1/options', ['POST']],
  ['/v1/models', ['POST']],
  ['/v1/generate', ['POST']],
])
const CANCEL_PATH = /^\/v1\/cancel\/([A-Za-z0-9_-]{1,80})$/

interface ActiveGeneration {
  controller: AbortController
  cancelled: boolean
}

export interface BridgeServerOptions {
  port?: number
  bind?: string
  origins?: readonly string[]
  token?: string
  modelDirectories?: readonly string[]
}

export interface ParsedCliOptions {
  port: number
  bind: string
  origins: string[]
  token?: string
  modelDirectories: string[]
  help: boolean
}

function requestPath(request: IncomingMessage): string {
  const raw = request.url
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    throw new BridgeError('INVALID_REQUEST_TARGET', 'Only origin-form request targets are accepted.', 400)
  }
  const parsed = new URL(raw, 'http://bridge.invalid')
  if (parsed.search || parsed.hash) {
    throw new BridgeError('QUERY_NOT_ALLOWED', 'Query strings and fragments are not accepted.', 400)
  }
  return parsed.pathname
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.writableEnded) return
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', body.length)
  response.end(body)
}

function errorPayload(error: unknown) {
  const safe = sanitizeError(error)
  return {
    status: safe.status,
    body: {
      ok: false,
      message: safe.message,
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.details === undefined ? {} : { details: safe.details }),
      },
    },
  }
}

function candidateConnection(
  protocol: 'http' | 'grpc',
  input: Record<string, unknown>,
  tls: boolean,
): NormalizedConnection {
  return normalizeConnection({
    protocol,
    host: input.host,
    port: input.port,
    tls,
    verifyTls: false,
    tlsFingerprintSha256: input.tlsFingerprintSha256,
    sharedSecret: input.sharedSecret,
    clientName: input.clientName,
    timeoutMs: input.timeoutMs ?? 2_500,
  })
}

function probeFailure(connection: NormalizedConnection, startedAt: number, error: unknown): ProbeFailure {
  const safe = sanitizeError(error)
  return {
    ok: false,
    protocol: connection.protocol,
    latencyMs: Date.now() - startedAt,
    connection: publicConnection(connection),
    error: {
      code: safe.code,
      message: safe.message,
      status: safe.status,
      ...(safe.details === undefined ? {} : { details: safe.details }),
    },
    warnings: [],
  }
}

function endpointFor(connection: NormalizedConnection): string {
  const host = connection.host === '::1' ? '[::1]' : connection.host
  return `${connection.tls ? 'https' : 'http'}://${host}:${connection.port}`
}

function metadataArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => isPlainObject(item))
}

function frontendCapabilities(probe: ProbeResult) {
  if (!probe.ok) {
    return {
      protocol: probe.protocol,
      canGenerate: false,
      canImageToImage: false,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: probe.protocol === 'grpc',
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [probe.error.message],
    }
  }
  if (probe.protocol === 'http') {
    return {
      protocol: 'http' as const,
      canGenerate: true,
      canImageToImage: true,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: false,
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [
        'Draw Things HTTP API는 생성 중간 미리보기와 단계별 진행률을 제공하지 않습니다.',
        'HTTP 연결을 취소해도 Draw Things 내부 생성 작업은 계속될 수 있습니다.',
      ],
    }
  }

  const metadata = probe.echo?.metadata
  let models = metadataArray(metadata?.models)
  if (models.length === 0) models = (probe.echo?.files ?? []).map((file) => ({ file }))
  return {
    protocol: 'grpc' as const,
    canGenerate: false,
    canImageToImage: false,
    canStreamProgress: false,
    canCancel: false,
    canBrowseModels: probe.capabilities.modelBrowsing,
    requiresHttpModeForCanvas: true,
    sharedSecretRequired: probe.echo?.sharedSecretMissing ?? false,
    models,
    loras: metadataArray(metadata?.loras),
    controls: metadataArray(metadata?.controlNets),
    textualInversions: metadataArray(metadata?.textualInversions),
    serverIdentifier: probe.echo?.serverIdentifier,
    limitations: [probe.capabilities.reason ?? '이미지 캔버스 생성에는 Draw Things HTTP API 모드가 필요합니다.'],
  }
}

function connectionTestResult(probe: ProbeResult) {
  const checkedAt = Date.now()
  const endpoint = endpointFor(probe.connection)
  if (!probe.ok) {
    const offlineCodes = new Set(['CONNECTION_REFUSED', 'ECONNREFUSED', 'ECONNRESET', 'UPSTREAM_TIMEOUT'])
    const tlsCodes = new Set(['TLS_VERIFICATION_FAILED', 'TLS_FINGERPRINT_MISMATCH', 'DEPTH_ZERO_SELF_SIGNED_CERT'])
    return {
      ok: false,
      latencyMs: probe.latencyMs,
      checkedAt,
      phase: offlineCodes.has(probe.error.code)
        ? 'offline'
        : tlsCodes.has(probe.error.code) ? 'cors-or-tls-blocked' : 'api-mismatch',
      message: probe.error.message,
      endpoint,
      capabilities: frontendCapabilities(probe),
      diagnosticCode: probe.error.code,
    }
  }
  const grpc = probe.protocol === 'grpc'
  return {
    ok: true,
    latencyMs: probe.latencyMs,
    checkedAt,
    phase: 'online',
    message: grpc
      ? 'Draw Things gRPC에 연결했습니다. 캔버스 생성에는 API 서버를 HTTP 모드로 전환하세요.'
      : 'Draw Things HTTP API에 연결했습니다.',
    endpoint,
    ...(probe.echo?.message ? { serverMessage: probe.echo.message } : {}),
    capabilities: frontendCapabilities(probe),
    ...(probe.options ? { remoteOptions: probe.options } : {}),
    warnings: probe.warnings,
    certificate: probe.certificate,
  }
}

export async function probeConnection(connection: NormalizedConnection): Promise<ProbeResult> {
  const startedAt = Date.now()
  try {
    if (connection.protocol === 'http') {
      const result = await getHttpOptions(connection)
      const success: ProbeSuccess = {
        ok: true,
        protocol: 'http',
        latencyMs: Date.now() - startedAt,
        connection: publicConnection(connection),
        capabilities: {
          options: true,
          modelBrowsing: false,
          generation: true,
          generationTransport: 'http',
          txt2img: true,
          img2img: true,
        },
        options: result.options,
        certificate: result.certificate,
        warnings: result.warnings,
      }
      return success
    }

    const result = await echoGrpc(connection)
    const warnings = [...result.warnings]
    if (result.echo.sharedSecretMissing) {
      warnings.push('Draw Things requires a matching sharedSecret before model metadata can be browsed.')
    }
    const reason = 'Native gRPC generation uses Draw Things FlatBuffer configuration and proprietary tensor payloads. Switch Draw Things API Server to HTTP mode for txt2img/img2img generation from this web connector.'
    const success: ProbeSuccess = {
      ok: true,
      protocol: 'grpc',
      latencyMs: Date.now() - startedAt,
      connection: publicConnection(connection),
      capabilities: {
        options: true,
        modelBrowsing: !result.echo.sharedSecretMissing,
        generation: false,
        generationTransport: null,
        txt2img: false,
        img2img: false,
        reason,
      },
      echo: result.echo,
      certificate: result.certificate,
      warnings,
    }
    return success
  } catch (error) {
    return probeFailure(connection, startedAt, error)
  }
}

function validateDiscoverBody(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new BridgeError('INVALID_DISCOVER_REQUEST', 'Discovery request must be a JSON object.')
  }
  normalizeLoopbackHost(value.host)
  if (value.sharedSecret !== undefined && typeof value.sharedSecret !== 'string') {
    throw new BridgeError('INVALID_SHARED_SECRET', 'sharedSecret must be a string.')
  }
  if (value.ports !== undefined) {
    if (!Array.isArray(value.ports) || value.ports.length < 1 || value.ports.length > 4
      || value.ports.some((port) => !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65_535)) {
      throw new BridgeError('INVALID_DISCOVERY_PORTS', 'ports must contain 1-4 integers from 1 to 65535.')
    }
  }
  return value
}

async function handleDiscover(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = validateDiscoverBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES))
  const requestedPorts = Array.isArray(body.ports)
    ? body.ports as number[]
    : [body.port === undefined ? DEFAULT_DRAW_THINGS_PORT : Number(body.port)]
  const ports = [...new Set(requestedPorts)]
  const candidates = ports.flatMap((port) => {
    const input = { ...body, port }
    return [
      candidateConnection('http', input, false),
      candidateConnection('grpc', input, true),
      candidateConnection('grpc', input, false),
    ]
  })
  const results = await Promise.all(candidates.map(probeConnection))
  const endpoints = results.filter((result): result is ProbeSuccess => result.ok).map((result) => ({
    id: `loopback-${result.protocol}-${result.connection.tls ? 'tls' : 'plain'}-${result.connection.port}`,
    name: result.protocol === 'http'
      ? `Draw Things HTTP :${result.connection.port}`
      : `Draw Things gRPC${result.connection.tls ? ' TLS' : ''} :${result.connection.port}`,
    protocol: result.protocol,
    host: result.connection.host,
    port: result.connection.port,
    tls: result.connection.tls,
    source: 'loopback',
    latencyMs: result.latencyMs,
    message: result.echo?.message ?? (result.protocol === 'http' ? 'Draw Things HTTP API' : undefined),
  }))
  writeJson(response, 200, {
    ok: results.some((result) => result.ok),
    host: normalizeLoopbackHost(body.host),
    ports,
    endpoints,
    results,
  })
}

function getConnectionBody(value: unknown, purpose: 'control' | 'generation' = 'control') {
  if (!isPlainObject(value)) throw new BridgeError('INVALID_REQUEST', 'Request body must be a JSON object.')
  return {
    body: value,
    connection: normalizeConnection(value.connection, purpose),
  }
}

async function handleTest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES))
  writeJson(response, 200, connectionTestResult(await probeConnection(connection)))
}

async function handleOptions(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES))
  writeJson(response, 200, await probeConnection(connection))
}

function modelMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value) || typeof value.file !== 'string' || !value.file.trim()) return undefined
  return {
    file: value.file.trim(),
    ...(typeof value.name === 'string' && value.name.trim() ? { name: value.name.trim() } : {}),
    ...(typeof value.version === 'string' && value.version.trim() ? { version: value.version.trim() } : {}),
    ...(typeof value.modifier === 'string' && value.modifier.trim() ? { modifier: value.modifier.trim() } : {}),
    ...(typeof value.source === 'string' ? { source: value.source } : {}),
  }
}

async function handleModels(
  request: IncomingMessage,
  response: ServerResponse,
  modelDirectories?: readonly string[],
): Promise<void> {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES))
  const local = await listLocalDrawThingsModels(modelDirectories)
  const models = new Map<string, Record<string, unknown>>()
  const sources = new Set<string>()
  for (const value of local.models) {
    const model = modelMetadata(value)
    if (!model) continue
    models.set(String(model.file), model)
    sources.add('local-metadata')
  }
  const warnings = [...local.warnings]

  if (connection.protocol === 'grpc') {
    const probe = await probeConnection(connection)
    if (probe.ok) {
      const echoModels = metadataArray(probe.echo?.metadata.models)
      for (const value of echoModels) {
        const model = modelMetadata({ ...value, source: 'grpc-echo' })
        if (model) models.set(String(model.file), model)
      }
      if (echoModels.length > 0) sources.add('grpc-echo')
      warnings.push(...probe.warnings)
    } else {
      warnings.push(`gRPC Echo 모델 목록을 읽지 못했습니다: ${probe.error.message}`)
    }
  } else {
    try {
      const result = await getHttpOptions(connection)
      const current = result.options.model
      if (typeof current === 'string' && current.trim() && !models.has(current.trim())) {
        models.set(current.trim(), { file: current.trim(), name: current.trim(), source: 'http-current' })
        sources.add('http-current')
      }
      warnings.push(...result.warnings)
    } catch (error) {
      const safe = sanitizeError(error)
      warnings.push(`현재 HTTP 모델을 확인하지 못했습니다: ${safe.message}`)
    }
  }

  const source = sources.size > 1 ? 'combined' : (sources.values().next().value ?? 'none')
  writeJson(response, 200, {
    ok: true,
    models: [...models.values()].sort((left, right) => String(left.name ?? left.file).localeCompare(String(right.name ?? right.file), 'ko')),
    source,
    checkedAt: Date.now(),
    stale: false,
    directoriesScanned: local.directoriesScanned,
    warnings: [...new Set(warnings)],
  })
}

function generationId(value: unknown): string {
  if (value === undefined) return randomUUID()
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new BridgeError('INVALID_GENERATION_ID', 'id must contain 1-80 letters, numbers, underscores, or hyphens.')
  }
  return value
}

const HTTP_UNWRITABLE_PARAMETERS = new Set([
  'compression_artifacts',
  'compression_artifacts_quality',
  'color_calibration',
  'expand_prompt_to_json',
])

function safeHttpParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(parameters).filter(([key, value]) => {
    if (HTTP_UNWRITABLE_PARAMETERS.has(key)) return false
    if (key === 'tea_cache_end' && Number(value) < 0) return false
    return true
  }))
}

function stripDataUrl(value: string): string {
  const comma = value.indexOf(',')
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value
}

function generationInput(body: Record<string, unknown>): {
  id: string
  mode: 'txt2img' | 'img2img'
  parameters: Record<string, unknown>
} {
  if (isPlainObject(body.request)) {
    const request = body.request
    if (request.mode !== 'txt2img' && request.mode !== 'img2img') {
      throw new BridgeError('INVALID_GENERATION_MODE', 'request.mode must be "txt2img" or "img2img".')
    }
    if (!isPlainObject(request.parameters)) {
      throw new BridgeError('INVALID_PARAMETERS', 'request.parameters must be a JSON object.')
    }
    if (typeof request.prompt !== 'string' || typeof request.negativePrompt !== 'string') {
      throw new BridgeError('INVALID_PROMPT', 'request.prompt and request.negativePrompt must be strings.')
    }
    const parameters: Record<string, unknown> = {
      ...safeHttpParameters(request.parameters),
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
    }
    if (request.mode === 'img2img' && request.initImage !== undefined) {
      if (typeof request.initImage !== 'string') {
        throw new BridgeError('INVALID_INIT_IMAGE', 'request.initImage must be a data URL or base64 string.')
      }
      parameters.init_images = [stripDataUrl(request.initImage)]
    }
    return {
      id: generationId(request.id),
      mode: request.mode,
      parameters,
    }
  }

  if (body.mode !== 'txt2img' && body.mode !== 'img2img') {
    throw new BridgeError('INVALID_GENERATION_MODE', 'mode must be "txt2img" or "img2img".')
  }
  if (!isPlainObject(body.parameters)) {
    throw new BridgeError('INVALID_PARAMETERS', 'parameters must be a JSON object.')
  }
  return {
    id: generationId(body.id),
    mode: body.mode,
    parameters: body.parameters,
  }
}

async function writeNdjson(response: ServerResponse, value: unknown): Promise<void> {
  if (response.writableEnded || response.destroyed) return
  const line = `${JSON.stringify(value)}\n`
  if (response.write(line)) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain)
      response.off('error', onError)
      response.off('close', onClose)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      cleanup()
      reject(new BridgeError('CLIENT_DISCONNECTED', 'The browser closed the generation stream.', 499))
    }
    response.once('drain', onDrain)
    response.once('error', onError)
    response.once('close', onClose)
  })
}

async function handleGenerate(
  request: IncomingMessage,
  response: ServerResponse,
  active: Map<string, ActiveGeneration>,
): Promise<void> {
  const { body, connection } = getConnectionBody(
    await readJsonBody(request, MAX_GENERATE_BODY_BYTES),
    'generation',
  )
  if (connection.protocol !== 'http') {
    throw new BridgeError(
      'HTTP_MODE_REQUIRED',
      'Native gRPC image generation is not exposed because Draw Things uses a proprietary tensor/FlatBuffer payload. Switch the Draw Things API Server protocol to HTTP.',
      409,
      { generationTransport: 'http' },
    )
  }
  const { id, mode, parameters } = generationInput(body)
  if (active.has(id)) throw new BridgeError('GENERATION_ID_IN_USE', 'A generation with this id is already active.', 409)

  const state: ActiveGeneration = { controller: new AbortController(), cancelled: false }
  active.set(id, state)
  let completed = false
  const startedAt = Date.now()
  let heartbeat: NodeJS.Timeout | undefined
  request.once('aborted', () => state.controller.abort())
  response.once('close', () => {
    if (!completed && !response.writableEnded) state.controller.abort()
  })

  response.statusCode = 200
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Transfer-Encoding', 'chunked')
  response.setHeader('X-Accel-Buffering', 'no')
  response.flushHeaders()

  try {
    await writeNdjson(response, {
      type: 'accepted',
      requestId: id,
      message: 'Draw Things가 생성 요청을 받았습니다.',
    })
    heartbeat = setInterval(() => {
      void writeNdjson(response, {
        type: 'progress',
        requestId: id,
        progress: 4,
        message: 'Draw Things에서 이미지를 생성하고 있습니다…',
      }).catch(() => state.controller.abort())
    }, 15_000)
    heartbeat.unref()

    const result = await generateHttpImages(connection, mode, parameters, state.controller.signal)
    await writeNdjson(response, {
      type: 'result',
      requestId: id,
      images: result.images,
      durationMs: Date.now() - startedAt,
    })
    completed = true
    response.end()
  } catch (error) {
    const safe = sanitizeError(error)
    if (!response.destroyed) {
      await writeNdjson(response, state.cancelled || safe.code === 'ABORTED'
        ? { type: 'cancelled', requestId: id, message: '이미지 생성을 취소했습니다.' }
        : {
            type: 'error',
            requestId: id,
            message: safe.message,
            code: safe.code,
          })
      completed = true
      response.end()
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    active.delete(id)
  }
}

function handleCancel(
  response: ServerResponse,
  active: Map<string, ActiveGeneration>,
  id: string,
): void {
  const generation = active.get(id)
  if (!generation) {
    writeJson(response, 200, { ok: true, id, cancelled: false, reason: 'not_active' })
    return
  }
  generation.cancelled = true
  generation.controller.abort()
  writeJson(response, 200, { ok: true, id, cancelled: true })
}

function expectedMethods(path: string): readonly string[] | undefined {
  return ROUTES.get(path) ?? (CANCEL_PATH.test(path) ? ['POST'] : undefined)
}

export function createBridgeServer(options: BridgeServerOptions = {}): Server {
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new BridgeError('INVALID_BRIDGE_PORT', 'Bridge port must be an integer from 0 to 65535.')
  }
  const bind = normalizeBridgeBindAddress(options.bind)
  if (!isLoopbackBindAddress(bind) && (typeof options.token !== 'string' || options.token.length < 32)) {
    throw new BridgeError('REMOTE_BIND_TOKEN_REQUIRED', 'A token of at least 32 characters is required for a Tailscale bind.')
  }
  if (!isLoopbackBindAddress(bind) && !options.origins?.length) {
    throw new BridgeError('REMOTE_BIND_ORIGIN_REQUIRED', 'At least one explicit --origin is required for a Tailscale bind.')
  }
  const origins = options.origins?.length ? options.origins : DEFAULT_DEV_ORIGINS
  const allowedOrigins = new Set(origins.map(normalizeOrigin))
  const active = new Map<string, ActiveGeneration>()

  const server = createServer((request, response) => {
    void (async () => {
      setCommonHeaders(response)
      const address = server.address()
      const expectedPort = address && typeof address !== 'string'
        ? address.port
        : requestedPort
      validateHostHeader(request, expectedPort, bind)
      const allowedOrigin = validateOrigin(request, response, allowedOrigins)
      const path = requestPath(request)
      const methods = expectedMethods(path)
      if (!methods) throw new BridgeError('NOT_FOUND', 'Bridge endpoint not found.', 404)

      if (request.method === 'OPTIONS') {
        handlePreflight(request, response, methods)
        return
      }
      validateToken(request, options.token)
      if (!request.method || !methods.includes(request.method)) {
        response.setHeader('Allow', methods.join(', '))
        throw new BridgeError('METHOD_NOT_ALLOWED', 'HTTP method is not allowed for this endpoint.', 405)
      }

      if (path === '/v1/bridge/health') {
        writeJson(response, 200, {
          ok: true,
          name: BRIDGE_NAME,
          version: BRIDGE_VERSION,
          bind,
          port: expectedPort,
          paired: true,
          allowedOrigin,
          tokenRequired: Boolean(options.token),
          allowedOrigins: [...allowedOrigins],
          activeGenerations: active.size,
          now: new Date().toISOString(),
        })
      } else if (path === '/v1/discover') {
        await handleDiscover(request, response)
      } else if (path === '/v1/test') {
        await handleTest(request, response)
      } else if (path === '/v1/options') {
        await handleOptions(request, response)
      } else if (path === '/v1/models') {
        await handleModels(request, response, options.modelDirectories)
      } else if (path === '/v1/generate') {
        await handleGenerate(request, response, active)
      } else {
        const match = CANCEL_PATH.exec(path)
        if (!match?.[1]) throw new BridgeError('NOT_FOUND', 'Bridge endpoint not found.', 404)
        handleCancel(response, active, match[1])
      }
    })().catch((error) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.destroy(error instanceof Error ? error : undefined)
        return
      }
      const payload = errorPayload(error)
      writeJson(response, payload.status, payload.body)
    })
  })

  server.requestTimeout = 120_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 64
  server.maxConnections = 32
  server.maxRequestsPerSocket = 1_000
  return server
}

function nextArgument(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new BridgeError('MISSING_ARGUMENT', `${flag} requires a value.`)
  return value
}

export function parseCliArguments(args: string[]): ParsedCliOptions {
  let port = DEFAULT_BRIDGE_PORT
  let bind = '127.0.0.1'
  const origins: string[] = []
  let token: string | undefined
  const modelDirectories: string[] = []
  let help = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    const separator = argument.indexOf('=')
    const flag = separator >= 0 ? argument.slice(0, separator) : argument
    const inlineValue = separator >= 0 ? argument.slice(separator + 1) : undefined
    if (flag === '--help' || flag === '-h') {
      help = true
    } else if (flag === '--port') {
      const value = inlineValue ?? nextArgument(args, index, flag)
      if (inlineValue === undefined) index += 1
      port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new BridgeError('INVALID_BRIDGE_PORT', '--port must be an integer from 1 to 65535.')
      }
    } else if (flag === '--bind') {
      const value = inlineValue ?? nextArgument(args, index, flag)
      if (inlineValue === undefined) index += 1
      bind = normalizeBridgeBindAddress(value)
    } else if (flag === '--origin') {
      const value = inlineValue ?? nextArgument(args, index, flag)
      if (inlineValue === undefined) index += 1
      origins.push(normalizeOrigin(value))
    } else if (flag === '--token' || flag === '--pairing-code') {
      const value = inlineValue ?? nextArgument(args, index, flag)
      if (inlineValue === undefined) index += 1
      if (value.length < 6 || value.length > 4096) {
        throw new BridgeError('INVALID_TOKEN', `${flag} must contain 6-4096 characters.`)
      }
      if (token !== undefined && token !== value) {
        throw new BridgeError('CONFLICTING_TOKEN', '--token and --pairing-code must match when both are supplied.')
      }
      token = value
    } else if (flag === '--models-dir') {
      const value = inlineValue ?? nextArgument(args, index, flag)
      if (inlineValue === undefined) index += 1
      if (!value.trim()) throw new BridgeError('INVALID_MODELS_DIRECTORY', '--models-dir must not be empty.')
      modelDirectories.push(resolve(value))
    } else {
      throw new BridgeError('UNKNOWN_ARGUMENT', `Unknown argument: ${argument}`)
    }
  }
  if (!isLoopbackBindAddress(bind) && (!token || token.length < 32)) {
    throw new BridgeError('REMOTE_BIND_TOKEN_REQUIRED', 'A token of at least 32 characters is required with a Tailscale --bind.')
  }
  if (!isLoopbackBindAddress(bind) && origins.length === 0) {
    throw new BridgeError('REMOTE_BIND_ORIGIN_REQUIRED', 'An explicit --origin is required with a Tailscale --bind.')
  }
  return {
    port,
    bind,
    origins: origins.length ? [...new Set(origins)] : [...DEFAULT_DEV_ORIGINS],
    token,
    modelDirectories: [...new Set(modelDirectories)],
    help,
  }
}

function usage(): string {
  return `Draw Things Web local connector ${BRIDGE_VERSION}

Usage:
  draw-things-bridge.mjs [--port 47821] [--bind 127.0.0.1] [--origin https://app.example]... [--token SECRET] [--models-dir PATH]...

Options:
  --port <number>          Connector port (default: 47821)
  --bind <address>         127.0.0.1, ::1, or this Mac's Tailscale IP
  --origin <origin>        Exact allowed website Origin; repeat for multiple sites
  --token <secret>         Optional bearer / X-Draw-Things-Bridge-Token value
  --pairing-code <secret>  Alias for --token
  --models-dir <path>      Additional Draw Things model folder; repeat as needed
  --help                   Show this help

The connector only binds loopback or an explicit Tailscale address and only contacts Draw Things on loopback.
Tailscale binds require an explicit origin and a token of at least 32 characters.
Without --origin, localhost Vite development origins on ports 5173 and 4173 are allowed.`
}

export async function startBridge(args = process.argv.slice(2)): Promise<Server | undefined> {
  const cli = parseCliArguments(args)
  if (cli.help) {
    process.stdout.write(`${usage()}\n`)
    return undefined
  }
  const defaults = await defaultDrawThingsModelDirectories()
  const server = createBridgeServer({
    ...cli,
    modelDirectories: [...new Set([...defaults, ...cli.modelDirectories])],
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(cli.port, cli.bind, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const displayHost = cli.bind.includes(':') ? `[${cli.bind}]` : cli.bind
  process.stdout.write(`Draw Things Web bridge listening on http://${displayHost}:${cli.port}\n`)
  process.stdout.write(`Allowed origins: ${cli.origins.join(', ')}\n`)
  process.stdout.write(`Pairing token: ${cli.token ? 'required' : 'disabled'}\n`)

  const shutdown = () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5_000).unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return server
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined
if (entry === import.meta.url) {
  startBridge().catch((error) => {
    const safe = sanitizeError(error)
    process.stderr.write(`${safe.code}: ${safe.message}\n`)
    process.exitCode = 1
  })
}
