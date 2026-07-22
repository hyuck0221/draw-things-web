import type {
  ConnectionTestResult,
  GenerationEvent,
  GenerationRequest,
  ModelCatalogResult,
  ServerCapabilities,
} from '../../domain/types'
import { EMPTY_CAPABILITIES } from '../defaults'
import { sanitizeHttpParameters } from './parameters'

const API_PATH = '/sdapi/v1'
const DEFAULT_TIMEOUT_MS = 3_500
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_GENERATION_RESPONSE_BYTES = 128 * 1024 * 1024
const MAX_GENERATED_IMAGES = 4

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
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw new DrawThingsClientError('Draw Things 응답이 안전한 크기 제한을 초과했습니다.', 'response-too-large')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
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
    const message = typeof body === 'object' && body && 'message' in body
      ? String((body as { message: unknown }).message)
      : `요청이 실패했습니다. (HTTP ${response.status})`
    throw new DrawThingsClientError(message, `http-${response.status}`)
  }
  return body as T
}

function httpCapabilities(): ServerCapabilities {
  return {
    ...EMPTY_CAPABILITIES,
    canGenerate: true,
    canImageToImage: true,
    limitations: [
      'Draw Things HTTP API는 생성 중간 미리보기와 단계별 진행률을 제공하지 않습니다.',
      'HTTP 요청 연결을 끊어도 앱 내부 생성 작업은 계속될 수 있습니다.',
      'HTTP API는 설치된 모델 전체 목록 대신 현재 선택한 모델만 제공합니다.',
    ],
  }
}

function validateOptionsResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DrawThingsClientError('Draw Things options 응답이 JSON 객체가 아닙니다.', 'invalid-response')
  }
  const options = value as Record<string, unknown>
  const numericKeys = ['width', 'height', 'steps'] as const
  if (typeof options.model !== 'string'
    || numericKeys.some((key) => typeof options[key] !== 'number' || !Number.isFinite(options[key]))) {
    throw new DrawThingsClientError('Draw Things options 응답에 필수 생성 설정이 없습니다.', 'invalid-response')
  }
  return options
}

export async function testConnection(): Promise<ConnectionTestResult> {
  const startedAt = performance.now()
  try {
    const response = await fetchWithTimeout(`${API_PATH}/options`)
    const options = validateOptionsResponse(await readJson<unknown>(response))
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: Date.now(),
      phase: 'online',
      message: 'Draw Things HTTP API에 연결되었습니다.',
      endpoint: `${API_PATH}/options`,
      capabilities: httpCapabilities(),
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
      endpoint: `${API_PATH}/options`,
      capabilities: EMPTY_CAPABILITIES,
      diagnosticCode: clientError.code,
    }
  }
}

export async function listInstalledModels(
  currentModel = '',
): Promise<ModelCatalogResult> {
  const tested = await testConnection()
  const remoteModel = tested.ok && typeof tested.remoteOptions?.model === 'string'
    ? tested.remoteOptions.model.trim()
    : ''
  const model = remoteModel || currentModel.trim()
  return {
    ok: tested.ok,
    models: model ? [{ file: model, name: model, source: 'http-current' }] : [],
    source: model ? 'http-current' : 'none',
    checkedAt: Date.now(),
    stale: !tested.ok,
    directoriesScanned: 0,
    warnings: [tested.ok
      ? 'Draw Things HTTP API는 설치 모델 전체 목록을 제공하지 않아 현재 모델만 표시합니다.'
      : `현재 모델을 다시 확인하지 못했습니다: ${tested.message}`],
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
): AsyncGenerator<GenerationEvent> {
  const startedAt = performance.now()
  yield { type: 'accepted', requestId: request.id, message: 'Draw Things가 요청을 받았습니다.' }
  const endpoint = request.mode === 'img2img' ? 'img2img' : 'txt2img'
  const response = await fetch(`${API_PATH}/${endpoint}`, {
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
