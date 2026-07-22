import type {
  BridgeHealth,
  ConnectionConfig,
  ConnectionTestResult,
  DiscoveredEndpoint,
  GenerationEvent,
  GenerationRequest,
  ModelCatalogResult,
  ServerCapabilities,
} from '../../domain/types'
import { EMPTY_CAPABILITIES } from '../defaults'
import { targetAddressSpaceForHost } from '../network'
import { sanitizeHttpParameters } from './parameters'

const DEFAULT_TIMEOUT_MS = 3_500

interface LocalNetworkRequestInit extends RequestInit {
  targetAddressSpace?: 'loopback' | 'local' | 'public'
}

export class DrawThingsClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DrawThingsClientError'
  }
}

function hostForUrl(host: string) {
  const trimmed = host.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed
  return trimmed.includes(':') ? `[${trimmed}]` : trimmed
}

export function drawThingsBaseUrl(connection: ConnectionConfig) {
  const scheme = connection.tls ? 'https' : 'http'
  const path = connection.apiBasePath.trim().replace(/^\/+|\/+$/g, '')
  return `${scheme}://${hostForUrl(connection.host)}:${connection.port}${path ? `/${path}` : ''}`
}

function normalizeBridgeUrl(url: string) {
  return url.trim().replace(/\/+$/g, '')
}

function bridgeHeaders(connection: ConnectionConfig): HeadersInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (connection.bridgePairingToken) {
    headers['x-draw-things-pairing-token'] = connection.bridgePairingToken
  }
  return headers
}

function bridgeTargetAddressSpace(connection: ConnectionConfig): LocalNetworkRequestInit['targetAddressSpace'] {
  try {
    return targetAddressSpaceForHost(new URL(normalizeBridgeUrl(connection.bridgeUrl)).hostname)
  } catch {
    return 'public'
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: LocalNetworkRequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DrawThingsClientError('연결 시간이 초과되었습니다.', 'timeout', error)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new DrawThingsClientError(
      `예상하지 못한 응답 형식입니다. (HTTP ${response.status})`,
      'invalid-response',
    )
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `요청이 실패했습니다. (HTTP ${response.status})`
    throw new DrawThingsClientError(message, `http-${response.status}`)
  }
  return body as T
}

function directCapabilities(): ServerCapabilities {
  return {
    ...EMPTY_CAPABILITIES,
    protocol: 'http',
    canGenerate: true,
    canImageToImage: true,
    canCancel: false,
    limitations: [
      'Draw Things HTTP API는 생성 중간 미리보기와 단계별 진행률을 제공하지 않습니다.',
      'HTTP 요청 연결을 끊어도 앱 내부 생성 작업은 계속될 수 있습니다.',
    ],
  }
}

export async function bridgeHealth(connection: ConnectionConfig): Promise<BridgeHealth> {
  const response = await fetchWithTimeout(
    `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/bridge/health`,
    {
      headers: bridgeHeaders(connection),
      targetAddressSpace: bridgeTargetAddressSpace(connection),
    },
    1_500,
  )
  return readJson<BridgeHealth>(response)
}

export async function testConnection(
  connection: ConnectionConfig,
): Promise<ConnectionTestResult> {
  const startedAt = performance.now()
  try {
    if (connection.transport === 'bridge') {
      const response = await fetchWithTimeout(
        `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/test`,
        {
          method: 'POST',
          headers: bridgeHeaders(connection),
          body: JSON.stringify({ connection }),
          targetAddressSpace: bridgeTargetAddressSpace(connection),
        },
      )
      const result = await readJson<ConnectionTestResult>(response)
      return { ...result, latencyMs: Math.round(performance.now() - startedAt) }
    }

    if (connection.protocol === 'grpc') {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
        phase: 'api-mismatch',
        message: '브라우저의 네이티브 gRPC 연결에는 로컬 커넥터가 필요합니다.',
        endpoint: drawThingsBaseUrl(connection),
        capabilities: {
          ...EMPTY_CAPABILITIES,
          protocol: 'grpc',
          requiresHttpModeForCanvas: true,
          limitations: ['직접 gRPC는 브라우저 CORS와 전용 텐서 응답 형식 때문에 사용할 수 없습니다.'],
        },
        diagnosticCode: 'grpc-requires-bridge',
      }
    }

    const response = await fetchWithTimeout(
      `${drawThingsBaseUrl(connection)}/sdapi/v1/options`,
      { targetAddressSpace: targetAddressSpaceForHost(connection.host) },
    )
    const options = await readJson<Record<string, unknown>>(response)
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: Date.now(),
      phase: 'online',
      message: 'Draw Things HTTP API에 직접 연결되었습니다.',
      endpoint: drawThingsBaseUrl(connection),
      capabilities: directCapabilities(),
      remoteOptions: options,
    }
  } catch (error) {
    const clientError =
      error instanceof DrawThingsClientError
        ? error
        : new DrawThingsClientError(
            '브라우저가 로컬 API 응답을 읽지 못했습니다. CORS, TLS 또는 로컬 네트워크 권한을 확인하세요.',
            'cors-or-tls',
            error,
          )
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: Date.now(),
      phase: clientError.code === 'timeout' ? 'offline' : 'cors-or-tls-blocked',
      message: clientError.message,
      endpoint: drawThingsBaseUrl(connection),
      capabilities: { ...EMPTY_CAPABILITIES, protocol: connection.protocol },
      diagnosticCode: clientError.code,
    }
  }
}

export async function discoverEndpoints(
  connection: ConnectionConfig,
): Promise<DiscoveredEndpoint[]> {
  if (connection.transport !== 'bridge') return []
  const response = await fetchWithTimeout(
    `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/discover`,
    {
      method: 'POST',
      headers: bridgeHeaders(connection),
      body: JSON.stringify({
        host: connection.host,
        ports: [...new Set([connection.port, 7859, 7860])],
        sharedSecret: connection.sharedSecret,
        clientName: connection.clientName,
        tlsFingerprintSha256: connection.tlsFingerprintSha256,
      }),
      targetAddressSpace: bridgeTargetAddressSpace(connection),
    },
    7_000,
  )
  const body = await readJson<{ endpoints: DiscoveredEndpoint[] }>(response)
  return body.endpoints
}

export async function listInstalledModels(
  connection: ConnectionConfig,
  currentModel = '',
): Promise<ModelCatalogResult> {
  if (connection.transport !== 'bridge') {
    const tested = await testConnection(connection)
    const remoteModel = tested.ok && typeof tested.remoteOptions?.model === 'string'
      ? tested.remoteOptions.model.trim()
      : ''
    const model = remoteModel || currentModel.trim()
    return {
      ok: true,
      models: model ? [{ file: model, name: model, source: 'http-current' }] : [],
      source: model ? 'http-current' : 'none',
      checkedAt: Date.now(),
      stale: false,
      directoriesScanned: 0,
      warnings: [tested.ok
        ? '직접 HTTP 연결은 설치 모델 전체 목록을 제공하지 않아 현재 모델만 표시합니다.'
        : `현재 모델을 다시 확인하지 못했습니다: ${tested.message}`],
    }
  }
  const response = await fetchWithTimeout(
    `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/models`,
    {
      method: 'POST',
      headers: bridgeHeaders(connection),
      body: JSON.stringify({ connection }),
      targetAddressSpace: bridgeTargetAddressSpace(connection),
    },
    8_000,
  )
  return readJson<ModelCatalogResult>(response)
}

function stripDataUrl(value: string) {
  const comma = value.indexOf(',')
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value
}

export function normalizeGeneratedImage(value: string) {
  if (value.startsWith('data:')) return value
  const compact = value.replace(/\s/g, '')
  let mime = 'image/png'
  if (compact.startsWith('/9j/')) mime = 'image/jpeg'
  else if (compact.startsWith('R0lGOD')) mime = 'image/gif'
  else {
    try {
      const signature = atob(compact.slice(0, 32))
      if (signature.slice(0, 4) === 'RIFF' && signature.slice(8, 12) === 'WEBP') mime = 'image/webp'
      else if (signature.slice(4, 12) === 'ftypavif') mime = 'image/avif'
    } catch {
      // Draw Things normally returns valid base64; keep PNG as the safe fallback.
    }
  }
  return `data:${mime};base64,${compact}`
}

function directRequestBody(request: GenerationRequest) {
  const body: Record<string, unknown> = {
    ...sanitizeHttpParameters(request.parameters),
    prompt: request.prompt,
    negative_prompt: request.negativePrompt,
  }
  if (request.mode === 'img2img' && request.initImage) {
    body.init_images = [stripDataUrl(request.initImage)]
  }
  return body
}

async function* directGenerate(
  connection: ConnectionConfig,
  request: GenerationRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerationEvent> {
  const startedAt = performance.now()
  yield { type: 'accepted', requestId: request.id, message: 'Draw Things가 요청을 받았습니다.' }
  const endpoint = request.mode === 'img2img' ? 'img2img' : 'txt2img'
  const response = await fetch(`${drawThingsBaseUrl(connection)}/sdapi/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(directRequestBody(request)),
    signal,
    targetAddressSpace: targetAddressSpaceForHost(connection.host),
  } as LocalNetworkRequestInit)
  const body = await readJson<{ images: string[] }>(response)
  yield {
    type: 'result',
    requestId: request.id,
    images: body.images.map(normalizeGeneratedImage),
    durationMs: Math.round(performance.now() - startedAt),
  }
}

async function* bridgeGenerate(
  connection: ConnectionConfig,
  request: GenerationRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerationEvent> {
  const response = await fetch(
    `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/generate`,
    {
      method: 'POST',
      headers: bridgeHeaders(connection),
      body: JSON.stringify({ connection, request }),
      signal,
      targetAddressSpace: bridgeTargetAddressSpace(connection),
    } as LocalNetworkRequestInit,
  )
  if (!response.ok || !response.body) {
    await readJson(response)
    throw new DrawThingsClientError('브리지가 스트림을 열지 못했습니다.', 'bridge-stream')
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    pending += value
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      yield JSON.parse(line) as GenerationEvent
    }
  }
  if (pending.trim()) yield JSON.parse(pending) as GenerationEvent
}

export function generate(
  connection: ConnectionConfig,
  request: GenerationRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerationEvent> {
  if (connection.protocol === 'grpc' && connection.transport === 'direct') {
    throw new DrawThingsClientError(
      'gRPC 이미지 생성은 로컬 커넥터에서도 HTTP API 모드 전환이 필요합니다.',
      'grpc-generation-unsupported',
    )
  }
  return connection.transport === 'bridge'
    ? bridgeGenerate(connection, request, signal)
    : directGenerate(connection, request, signal)
}

export async function cancelGeneration(connection: ConnectionConfig, requestId: string) {
  if (connection.transport !== 'bridge') return false
  const response = await fetchWithTimeout(
    `${normalizeBridgeUrl(connection.bridgeUrl)}/v1/cancel/${encodeURIComponent(requestId)}`,
    {
      method: 'POST',
      headers: bridgeHeaders(connection),
      targetAddressSpace: bridgeTargetAddressSpace(connection),
    },
    2_000,
  )
  const body = await readJson<{ cancelled: boolean }>(response)
  return body.cancelled
}
