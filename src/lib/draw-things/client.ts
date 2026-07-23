import type {
  ConnectionTestResult,
  DrawThingsModel,
  GenerationEvent,
  GenerationRequest,
  ModelCatalogResult,
  ServerCapabilities,
} from '../../domain/types'
import { EMPTY_CAPABILITIES } from '../defaults'
import { apiRequestUrl } from './endpoint'
import { sanitizeHttpParameters } from './parameters'

const DEFAULT_TIMEOUT_MS = 3_500
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_GENERATION_RESPONSE_BYTES = 128 * 1024 * 1024
const MAX_GENERATED_IMAGES = 400

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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
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

async function readTextWithLimit(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new DrawThingsClientError('Draw Things 응답이 안전한 크기 제한을 초과했습니다.', 'response-too-large')
  }
  if (!response.body) return response.text()
  const reader = response.body.getReader()
  let total = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new DrawThingsClientError('Draw Things 응답이 안전한 크기 제한을 초과했습니다.', 'response-too-large')
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

async function readJson<T>(response: Response, maximumBytes = MAX_JSON_RESPONSE_BYTES): Promise<T> {
  const text = await readTextWithLimit(response, maximumBytes)
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
    const errorBody = typeof body === 'object' && body ? body as Record<string, unknown> : undefined
    const candidate = [errorBody?.detail, errorBody?.message, errorBody?.error]
      .find((value) => typeof value === 'string' && value.trim())
    const message = typeof candidate === 'string'
      ? candidate.trim().slice(0, 2_000)
      : `요청이 실패했습니다. (HTTP ${response.status})`
    throw new DrawThingsClientError(message, `http-${response.status}`)
  }
  return body as T
}

function httpCapabilities(model: string): ServerCapabilities {
  const hasModel = Boolean(model.trim())
  return {
    ...EMPTY_CAPABILITIES,
    canGenerate: true,
    canImageToImage: true,
    canBrowseModels: true,
    models: hasModel ? [{ file: model, name: model, source: 'http-current' }] : [],
    limitations: [
      'Draw Things HTTP API는 생성 중간 미리보기와 단계별 진행률을 제공하지 않습니다.',
      'HTTP 요청 연결을 끊어도 앱 내부 생성 작업은 계속될 수 있습니다.',
      '모델 설치 API는 제공되지 않습니다. 설치는 Draw Things 앱에서 진행해야 합니다.',
      ...(!hasModel ? ['Draw Things에서 생성 모델을 먼저 선택해야 합니다.'] : []),
    ],
  }
}

function validateOptionsResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DrawThingsClientError('Draw Things options 응답이 JSON 객체가 아닙니다.', 'invalid-response')
  }
  const options = value as Record<string, unknown>
  const numericKeys = ['width', 'height', 'steps'] as const
  if (!('model' in options) || (options.model !== null && typeof options.model !== 'string')
    || numericKeys.some((key) => typeof options[key] !== 'number' || !Number.isFinite(options[key]))) {
    throw new DrawThingsClientError('Draw Things options 응답에 필수 생성 설정이 없습니다.', 'invalid-response')
  }
  return options
}

function gatewayRequiredResult(): ConnectionTestResult {
  return {
    ok: false,
    latencyMs: 0,
    checkedAt: Date.now(),
    phase: 'api-mismatch',
    message: 'Tailscale HTTPS 게이트웨이 주소를 먼저 저장하세요.',
    endpoint: 'Tailscale HTTPS gateway required',
    capabilities: EMPTY_CAPABILITIES,
    diagnosticCode: 'gateway-required',
  }
}

export async function testConnection(gatewayUrl?: string): Promise<ConnectionTestResult> {
  const optionsEndpoint = apiRequestUrl('/sdapi/v1/options', gatewayUrl)
  if (!optionsEndpoint) return gatewayRequiredResult()
  const startedAt = performance.now()
  try {
    const response = await fetchWithTimeout(optionsEndpoint)
    const options = validateOptionsResponse(await readJson<unknown>(response))
    const model = typeof options.model === 'string' ? options.model.trim() : ''
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: Date.now(),
      phase: 'online',
      message: model
        ? 'Draw Things HTTP API에 연결되었습니다.'
        : 'Draw Things HTTP API에 연결되었습니다. 앱에서 생성 모델을 선택하세요.',
      endpoint: optionsEndpoint,
      capabilities: httpCapabilities(model),
      remoteOptions: options,
    }
  } catch (error) {
    const clientError = error instanceof DrawThingsClientError
      ? error
      : new DrawThingsClientError(
          'Draw Things API에 도달하지 못했습니다. Draw Things와 Mac의 로컬 웹 서버 상태를 확인하세요.',
          'network-error',
          error,
        )
    const status = clientError.code.startsWith('http-')
      ? Number(clientError.code.slice(5))
      : 0
    const apiMismatch = clientError.code === 'invalid-response'
      || (status >= 400 && status < 500)
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: Date.now(),
      phase: apiMismatch ? 'api-mismatch' : 'offline',
      message: clientError.message,
      endpoint: optionsEndpoint,
      capabilities: EMPTY_CAPABILITIES,
      diagnosticCode: clientError.code,
    }
  }
}

interface LocalModelCatalogResponse {
  models: DrawThingsModel[]
  directoriesScanned: number
  warnings: string[]
}

async function fetchLocalModelCatalog(gatewayUrl?: string): Promise<LocalModelCatalogResponse> {
  const endpoint = apiRequestUrl('/local-api/v1/models', gatewayUrl)
  if (!endpoint) throw new DrawThingsClientError('Tailscale HTTPS 게이트웨이 주소를 먼저 저장하세요.', 'gateway-required')
  const response = await fetchWithTimeout(endpoint)
  const body = await readJson<unknown>(response)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DrawThingsClientError('로컬 모델 목록 응답이 올바르지 않습니다.', 'invalid-model-catalog')
  }
  const value = body as Record<string, unknown>
  if (!Array.isArray(value.models)) {
    throw new DrawThingsClientError('로컬 모델 목록 응답이 올바르지 않습니다.', 'invalid-model-catalog')
  }
  const models = value.models.filter((candidate): candidate is DrawThingsModel => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    const file = (candidate as Record<string, unknown>).file
    return typeof file === 'string' && file.trim().toLowerCase().endsWith('.ckpt')
  })
  return {
    models,
    directoriesScanned: Number.isSafeInteger(value.directoriesScanned)
      ? Number(value.directoriesScanned)
      : 0,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  }
}

export async function listInstalledModels(
  currentModel = '',
  gatewayUrl?: string,
): Promise<ModelCatalogResult> {
  const [tested, localCatalog] = await Promise.all([
    testConnection(gatewayUrl),
    fetchLocalModelCatalog(gatewayUrl).then(
      (catalog) => ({ catalog }),
      (error: unknown) => ({ error }),
    ),
  ])
  const remoteModel = tested.ok && typeof tested.remoteOptions?.model === 'string'
    ? tested.remoteOptions.model.trim()
    : ''
  const model = remoteModel || currentModel.trim()
  const catalog = 'catalog' in localCatalog ? localCatalog.catalog : undefined
  const merged = new Map<string, DrawThingsModel>()
  if (model) merged.set(model, { file: model, name: model, source: 'http-current' })
  for (const installed of catalog?.models ?? []) {
    const file = installed.file.trim()
    if (file) merged.set(file, installed)
  }
  const warnings = [...(catalog?.warnings ?? [])]
  if ('error' in localCatalog) {
    warnings.push('로컬 설치 모델 목록을 읽지 못해 현재 모델만 표시합니다.')
  }
  if (!tested.ok) warnings.push(`현재 모델을 다시 확인하지 못했습니다: ${tested.message}`)
  const hasLocalModels = Boolean(catalog?.models.length)
  return {
    ok: tested.ok,
    models: [...merged.values()],
    source: hasLocalModels && model
      ? 'local-and-http-current'
      : hasLocalModels ? 'local-metadata' : model ? 'http-current' : 'none',
    ...(model ? { currentModel: model } : {}),
    checkedAt: Date.now(),
    stale: !tested.ok,
    directoriesScanned: catalog?.directoriesScanned ?? 0,
    warnings,
  }
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

function requestBody(request: GenerationRequest) {
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

export async function* generate(
  request: GenerationRequest,
  signal?: AbortSignal,
  gatewayUrl?: string,
): AsyncGenerator<GenerationEvent> {
  const startedAt = performance.now()
  yield { type: 'accepted', requestId: request.id, message: 'Draw Things가 요청을 받았습니다.' }
  const endpoint = request.mode === 'img2img' ? 'img2img' : 'txt2img'
  const requestUrl = apiRequestUrl(`/sdapi/v1/${endpoint}`, gatewayUrl)
  if (!requestUrl) {
    throw new DrawThingsClientError('Tailscale HTTPS 게이트웨이 주소를 먼저 저장하세요.', 'gateway-required')
  }
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody(request)),
    signal,
  })
  const body = await readJson<unknown>(response, MAX_GENERATION_RESPONSE_BYTES)
  if (!body || typeof body !== 'object' || !('images' in body)
    || !Array.isArray(body.images) || body.images.length < 1
    || body.images.length > MAX_GENERATED_IMAGES
    || body.images.some((image) => typeof image !== 'string')) {
    throw new DrawThingsClientError('Draw Things 이미지 응답 형식이 올바르지 않습니다.', 'invalid-generation-response')
  }
  yield {
    type: 'result',
    requestId: request.id,
    images: body.images.map(normalizeGeneratedImage),
    durationMs: Math.round(performance.now() - startedAt),
  }
}
