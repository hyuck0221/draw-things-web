import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generate,
  listInstalledModels,
  normalizeGeneratedImage,
  testConnection,
} from './client'

afterEach(() => vi.unstubAllGlobals())

describe('normalizeGeneratedImage', () => {
  it('keeps data URLs and wraps bare base64', () => {
    expect(normalizeGeneratedImage('data:image/webp;base64,abc')).toBe(
      'data:image/webp;base64,abc',
    )
    expect(normalizeGeneratedImage('abc')).toBe('data:image/png;base64,abc')
    expect(normalizeGeneratedImage('/9j/abc')).toBe('data:image/jpeg;base64,/9j/abc')
    expect(normalizeGeneratedImage('UklGRgAAAABXRUJQ')).toBe(
      'data:image/webp;base64,UklGRgAAAABXRUJQ',
    )
  })
})

describe('testConnection', () => {
  it('tests the same-origin Draw Things options endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'current.ckpt',
      width: 512,
      height: 512,
      steps: 16,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testConnection()

    expect(fetchMock).toHaveBeenCalledWith('/sdapi/v1/options', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
    expect(result).toMatchObject({
      ok: true,
      phase: 'online',
      endpoint: '/sdapi/v1/options',
      remoteOptions: { model: 'current.ckpt', steps: 16 },
    })
  })

  it('reports an API mismatch for an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(testConnection()).resolves.toMatchObject({
      ok: false,
      phase: 'api-mismatch',
      diagnosticCode: 'http-404',
    })
  })

  it('reports upstream 5xx failures as offline rather than an API mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(testConnection()).resolves.toMatchObject({
      ok: false,
      phase: 'offline',
      diagnosticCode: 'http-503',
    })
  })

  it('keeps a model-less but otherwise valid Draw Things API online', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: null,
      width: 512,
      height: 512,
      steps: 16,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await expect(testConnection()).resolves.toMatchObject({
      ok: true,
      phase: 'online',
      capabilities: { canGenerate: true },
    })
  })

  it('shows Draw Things validation detail from an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Validation Error',
      detail: 'Model missing.ckpt does not exist',
    }), { status: 422, headers: { 'content-type': 'application/json' } })))

    await expect(testConnection()).resolves.toMatchObject({
      ok: false,
      message: 'Model missing.ckpt does not exist',
      diagnosticCode: 'http-422',
    })
  })

  it.each([{}, [], { model: 'fake.ckpt' }])(
    'rejects a generic JSON response that is not a Draw Things options document',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })))

      await expect(testConnection()).resolves.toMatchObject({
        ok: false,
        phase: 'api-mismatch',
        diagnosticCode: 'invalid-response',
      })
    },
  )
})

describe('listInstalledModels', () => {
  it('merges the current HTTP model with locally installed model metadata', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(
      url === '/local-api/v1/models'
        ? JSON.stringify({
            models: [
              { file: 'remote-current.ckpt', name: 'Current display name', source: 'local-metadata' },
              { file: 'other.ckpt', name: 'Other', source: 'local-metadata' },
            ],
            directoriesScanned: 1,
            warnings: [],
          })
        : JSON.stringify({ model: 'remote-current.ckpt', width: 512, height: 512, steps: 16 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listInstalledModels('stale-current.ckpt')

    expect(result).toMatchObject({
      ok: true,
      source: 'local-and-http-current',
      currentModel: 'remote-current.ckpt',
      stale: false,
      directoriesScanned: 1,
      models: [
        { file: 'remote-current.ckpt', name: 'Current display name' },
        { file: 'other.ckpt', name: 'Other' },
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it('keeps the local current model as stale fallback while the API is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await listInstalledModels('remembered.ckpt')

    expect(result).toMatchObject({
      ok: false,
      source: 'http-current',
      currentModel: 'remembered.ckpt',
      stale: true,
      models: [{ file: 'remembered.ckpt' }],
    })
  })
})

describe('generate', () => {
  it('posts txt2img to the same origin and omits a blank upscaler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      images: ['abc'],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const stream = generate({
      id: 'same-origin-test',
      mode: 'txt2img',
      prompt: 'a lighthouse',
      negativePrompt: 'blurry',
      parameters: { width: 512, upscaler: '   ', upscaler_scale: 0 },
    })

    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'accepted' }, done: false })
    await expect(stream.next()).resolves.toMatchObject({
      value: { type: 'result', images: ['data:image/png;base64,abc'] },
      done: false,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/sdapi/v1/txt2img')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({
      width: 512,
      upscaler_scale: 0,
      prompt: 'a lighthouse',
      negative_prompt: 'blurry',
    })
  })

  it('posts a stripped img2img source to the relative endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ images: ['aGVsbG8='] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const stream = generate({
      id: 'img2img-test',
      mode: 'img2img',
      prompt: 'variation',
      negativePrompt: '',
      parameters: {},
      initImage: 'data:image/png;base64,aGVsbG8=',
    })

    await stream.next()
    await stream.next()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/sdapi/v1/img2img')
    expect(JSON.parse(String(init.body))).toMatchObject({ init_images: ['aGVsbG8='] })
  })

  it('aborts an HTTP generation when the caller cancels it', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const stream = generate({
      id: 'cancel-test',
      mode: 'txt2img',
      prompt: 'test',
      negativePrompt: '',
      parameters: {},
    }, controller.signal)

    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'accepted' }, done: false })
    const result = stream.next()
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('rejects generation responses with more than the official maximum image count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      images: Array.from({ length: 401 }, () => 'a'),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    const stream = generate({
      id: 'too-many-images',
      mode: 'txt2img',
      prompt: 'test',
      negativePrompt: '',
      parameters: {},
    })

    await stream.next()
    await expect(stream.next()).rejects.toMatchObject({ code: 'invalid-generation-response' })
  })

  it('rejects a declared generation response above the byte limit before reading it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(128 * 1024 * 1024 + 1),
      },
    })))
    const stream = generate({
      id: 'oversized-response',
      mode: 'txt2img',
      prompt: 'test',
      negativePrompt: '',
      parameters: {},
    })

    await stream.next()
    await expect(stream.next()).rejects.toMatchObject({ code: 'response-too-large' })
  })
})
