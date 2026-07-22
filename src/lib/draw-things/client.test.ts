import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONNECTION } from '../defaults'
import { discoverEndpoints, drawThingsBaseUrl, generate, listInstalledModels, normalizeGeneratedImage, testConnection } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('drawThingsBaseUrl', () => {
  it('formats IPv4 and a base path', () => {
    expect(
      drawThingsBaseUrl({ ...DEFAULT_CONNECTION, host: '127.0.0.1', apiBasePath: '/api/' }),
    ).toBe('http://127.0.0.1:7859/api')
  })

  it('wraps raw IPv6 hosts in brackets', () => {
    expect(drawThingsBaseUrl({ ...DEFAULT_CONNECTION, host: '::1', tls: true })).toBe(
      'https://[::1]:7859',
    )
  })
})

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

describe('discoverEndpoints', () => {
  it('forwards the configured loopback identity and gRPC credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ endpoints: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const connection = {
      ...DEFAULT_CONNECTION,
      protocol: 'grpc' as const,
      host: '::1',
      sharedSecret: 'draw-things-secret',
      clientName: 'Canvas test',
      tlsFingerprintSha256: 'AA:BB',
      bridgePairingToken: 'bridge-token',
    }

    await discoverEndpoints(connection)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:47821/v1/discover')
    expect(init.headers).toMatchObject({ 'x-draw-things-pairing-token': 'bridge-token' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      host: '::1',
      ports: [7859, 7860],
      sharedSecret: 'draw-things-secret',
      clientName: 'Canvas test',
      tlsFingerprintSha256: 'AA:BB',
    })
  })
})

describe('listInstalledModels', () => {
  it('refreshes the current model from direct HTTP options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'remote-current.ckpt' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listInstalledModels(
      { ...DEFAULT_CONNECTION, transport: 'direct' },
      'stale-current.ckpt',
    )

    expect(result).toMatchObject({
      ok: true,
      source: 'http-current',
      models: [{ file: 'remote-current.ckpt' }],
    })
  })

  it('uses the pairing token when requesting the connector catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      models: [{ file: 'local.ckpt', name: 'Local' }],
      source: 'local-metadata',
      checkedAt: 1,
      stale: false,
      directoriesScanned: 1,
      warnings: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listInstalledModels({
      ...DEFAULT_CONNECTION,
      bridgeUrl: 'http://100.121.194.59:47821',
      bridgePairingToken: 'bridge-token',
    }, 'current.ckpt', ['detail_lora.ckpt'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://100.121.194.59:47821/v1/models')
    expect(init.headers).toMatchObject({ 'x-draw-things-pairing-token': 'bridge-token' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      currentModel: 'current.ckpt',
      selectedLoRAs: ['detail_lora.ckpt'],
    })
    expect((init as RequestInit & { targetAddressSpace?: string }).targetAddressSpace).toBe('local')
    expect(result.models).toEqual([expect.objectContaining({ file: 'local.ckpt' })])
  })
})

describe('testConnection local-network diagnostics', () => {
  it('reports a denied Android/Chrome local-network permission explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    })

    const result = await testConnection({
      ...DEFAULT_CONNECTION,
      bridgeUrl: 'https://mac.example-tailnet.ts.net:47822',
      bridgePairingToken: 'bridge-token',
    })

    expect(result).toMatchObject({
      ok: false,
      phase: 'permission-denied',
      diagnosticCode: 'local-network-permission-denied',
    })
    expect(result.message).toContain('Android Chrome')
  })

  it('preserves an authenticated connector HTTP error even when the permission is denied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'A valid bridge pairing token is required.' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )))
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    })

    const result = await testConnection({
      ...DEFAULT_CONNECTION,
      bridgeUrl: 'https://mac.example-tailnet.ts.net:47822',
      bridgePairingToken: 'wrong-token',
    })

    expect(result).toMatchObject({
      ok: false,
      phase: 'api-mismatch',
      diagnosticCode: 'http-401',
      message: 'A valid bridge pairing token is required.',
    })
  })
})

describe('generate', () => {
  it('aborts a direct HTTP generation when the caller cancels it', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const stream = generate({ ...DEFAULT_CONNECTION, transport: 'direct' }, {
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
})
