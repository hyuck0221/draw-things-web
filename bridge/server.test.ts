import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request as requestHttp, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeServer, parseCliArguments } from './server.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

const servers: Server[] = []
const temporaryDirectories: string[] = []

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('loopback bridge HTTP surface', () => {
  it('preserves equals signs in inline model paths and pairing tokens', () => {
    const parsed = parseCliArguments([
      '--models-dir=/tmp/AI=Models',
      '--token=local-token==',
    ])

    expect(parsed.modelDirectories).toEqual([resolve('/tmp/AI=Models')])
    expect(parsed.token).toBe('local-token==')
  })

  it('requires an explicit origin and long token for a Tailscale bind', () => {
    expect(() => parseCliArguments(['--bind', '100.121.194.59']))
      .toThrow(/token of at least 32/)
    expect(() => parseCliArguments([
      '--bind', '100.121.194.59',
      '--token', 'a'.repeat(64),
    ])).toThrow(/explicit --origin/)

    const parsed = parseCliArguments([
      '--bind', '100.121.194.59',
      '--origin', 'http://100.121.194.59:5173',
      '--token', 'a'.repeat(64),
    ])
    expect(parsed.bind).toBe('100.121.194.59')
    expect(parsed.origins).toEqual(['http://100.121.194.59:5173'])
  })

  it('requires a loopback bind, explicit origin, and long token for Tailscale Serve', () => {
    expect(() => parseCliArguments(['--tailscale-host', 'hshim.example-tailnet.ts.net:47822']))
      .toThrow(/token of at least 32/)
    expect(() => parseCliArguments([
      '--tailscale-host', 'hshim.example-tailnet.ts.net:47822',
      '--token', 'a'.repeat(64),
    ])).toThrow(/explicit --origin/)
    expect(() => parseCliArguments([
      '--bind', '100.121.194.59',
      '--tailscale-host', 'hshim.example-tailnet.ts.net:47822',
      '--origin', 'https://canvas.example',
      '--token', 'a'.repeat(64),
    ])).toThrow(/loopback --bind/)

    const parsed = parseCliArguments([
      '--tailscale-host', 'hshim.example-tailnet.ts.net:47822',
      '--origin', 'https://canvas.example',
      '--token', 'a'.repeat(64),
    ])
    expect(parsed.bind).toBe('127.0.0.1')
    expect(parsed.tailscaleServeHosts).toEqual(['hshim.example-tailnet.ts.net:47822'])
  })

  it('accepts only the configured Tailscale Serve Host through the loopback proxy', async () => {
    const token = 'a'.repeat(64)
    const bridgePort = await listen(createBridgeServer({
      port: 0,
      origins: ['https://canvas.example'],
      token,
      tailscaleServeHosts: ['hshim.example-tailnet.ts.net:47822'],
    }))
    const requestHealth = (host: string) => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const request = requestHttp({
        hostname: '127.0.0.1',
        port: bridgePort,
        path: '/v1/bridge/health',
        headers: {
          Host: host,
          Origin: 'https://canvas.example',
          'X-Draw-Things-Pairing-Token': token,
        },
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        response.once('end', () => resolve({
          status: response.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
        }))
      })
      request.once('error', reject)
      request.end()
    })

    const accepted = await requestHealth('hshim.example-tailnet.ts.net:47822')
    expect(accepted.status).toBe(200)
    expect(accepted.body).toMatchObject({
      ok: true,
      tailscaleServeHosts: ['hshim.example-tailnet.ts.net:47822'],
    })

    const rejected = await requestHealth('other.example-tailnet.ts.net:47822')
    expect(rejected.status).toBe(403)
  })

  it('enforces exact Origin and pairing token while supporting PNA preflight', async () => {
    const bridgePort = await listen(createBridgeServer({
      port: 0,
      origins: ['https://canvas.example'],
      token: 'correct-secret',
    }))
    const url = `http://127.0.0.1:${bridgePort}/v1/bridge/health`

    const rejected = await fetch(url, { headers: { Origin: 'https://evil.example' } })
    expect(rejected.status).toBe(403)

    const unauthorized = await fetch(url, { headers: { Origin: 'https://canvas.example' } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('access-control-allow-origin')).toBe('https://canvas.example')

    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://canvas.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization, content-type',
        'Access-Control-Request-Private-Network': 'true',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')

    const healthy = await fetch(url, {
      headers: {
        Origin: 'https://canvas.example',
        'X-Draw-Things-Pairing-Token': 'correct-secret',
      },
    })
    expect(healthy.status).toBe(200)
    expect(await healthy.json()).toMatchObject({
      ok: true,
      bind: '127.0.0.1',
      paired: true,
      allowedOrigin: 'https://canvas.example',
      tokenRequired: true,
    })
  })

  it('proxies only the Draw Things options method and streams generation as NDJSON', async () => {
    let upstreamGenerationBody: Record<string, unknown> | undefined
    const drawThingsPort = await listen(createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/sdapi/v1/options') {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ model: 'test.ckpt', steps: 20 }))
        return
      }
      if (request.method === 'POST' && request.url === '/sdapi/v1/txt2img') {
        const chunks: Buffer[] = []
        request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        request.once('end', () => {
          upstreamGenerationBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ images: ['iVBORw0KGgoAAA'] }))
        })
        return
      }
      response.statusCode = 404
      response.end()
    }))
    const bridgePort = await listen(createBridgeServer({ port: 0, origins: ['https://canvas.example'] }))
    const connection = {
      protocol: 'http',
      host: '127.0.0.1',
      port: drawThingsPort,
      tls: false,
      timeoutMs: 2_000,
    }
    const headers = { Origin: 'https://canvas.example', 'Content-Type': 'application/json' }

    const test = await fetch(`http://127.0.0.1:${bridgePort}/v1/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ connection }),
    })
    expect(await test.json()).toMatchObject({
      ok: true,
      phase: 'online',
      remoteOptions: { model: 'test.ckpt', steps: 20 },
      capabilities: { protocol: 'http', canGenerate: true, canImageToImage: true },
    })

    const discovery = await fetch(`http://127.0.0.1:${bridgePort}/v1/discover`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ports: [drawThingsPort], timeoutMs: 500 }),
    })
    expect(await discovery.json()).toMatchObject({
      ok: true,
      endpoints: [{ protocol: 'http', port: drawThingsPort, tls: false, source: 'loopback' }],
    })

    const generation = await fetch(`http://127.0.0.1:${bridgePort}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection,
        request: {
          id: 'test-job',
          mode: 'txt2img',
          prompt: 'cat',
          negativePrompt: '',
          parameters: {
            width: 512,
            height: 512,
            tea_cache_end: -1,
            upscaler: '',
            upscaler_scale: 0,
          },
        },
      }),
    })
    expect(generation.headers.get('content-type')).toContain('application/x-ndjson')
    const events = (await generation.text()).trim().split('\n').map((line) => JSON.parse(line))
    expect(events).toMatchObject([
      { type: 'accepted', requestId: 'test-job' },
      { type: 'result', requestId: 'test-job', images: ['iVBORw0KGgoAAA'] },
    ])
    expect(upstreamGenerationBody).toMatchObject({
      prompt: 'cat',
      negative_prompt: '',
      width: 512,
      height: 512,
    })
    expect(upstreamGenerationBody).not.toHaveProperty('tea_cache_end')
    expect(upstreamGenerationBody).not.toHaveProperty('upscaler')
    expect(upstreamGenerationBody).toHaveProperty('upscaler_scale', 0)
  })

  it('cancels an active upstream request by generation id', async () => {
    const drawThingsPort = await listen(createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/sdapi/v1/txt2img') {
        response.statusCode = 404
        response.end()
        return
      }
      request.resume()
      const timer = setTimeout(() => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ images: [] }))
      }, 10_000)
      timer.unref()
      response.once('close', () => clearTimeout(timer))
    }))
    const bridgePort = await listen(createBridgeServer({ port: 0, origins: ['https://canvas.example'] }))
    const headers = { Origin: 'https://canvas.example', 'Content-Type': 'application/json' }
    const connection = {
      protocol: 'http',
      host: '127.0.0.1',
      port: drawThingsPort,
      tls: false,
      timeoutMs: 20_000,
    }

    const generation = await fetch(`http://127.0.0.1:${bridgePort}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection,
        request: {
          id: 'cancel-me',
          mode: 'txt2img',
          prompt: 'cat',
          negativePrompt: '',
          parameters: { width: 512, height: 512 },
        },
      }),
    })
    const reader = generation.body!.pipeThrough(new TextDecoderStream()).getReader()
    const first = await reader.read()
    expect(first.value).toContain('"type":"accepted"')

    const cancellation = await fetch(`http://127.0.0.1:${bridgePort}/v1/cancel/cancel-me`, {
      method: 'POST',
      headers,
    })
    expect(await cancellation.json()).toMatchObject({ ok: true, id: 'cancel-me', cancelled: true })

    let remainder = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      remainder += next.value
    }
    expect(remainder).toContain('"type":"cancelled"')
    expect(remainder).toContain('"requestId":"cancel-me"')
  })

  it('returns installed model metadata without exposing dependency checkpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-bridge-models-'))
    temporaryDirectories.push(root)
    const modelsDirectory = join(root, 'Models')
    await mkdir(modelsDirectory, { recursive: true })
    await writeFile(join(modelsDirectory, 'custom.json'), JSON.stringify([
      { file: 'local_main.ckpt', name: 'Local Main', version: 'sdxl' },
    ]))
    await writeFile(join(modelsDirectory, 'local_main.ckpt'), 'model')
    await writeFile(join(modelsDirectory, 'clip_dependency.ckpt'), 'dependency')

    const drawThingsPort = await listen(createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/sdapi/v1/options') {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ model: 'current_only.ckpt' }))
        return
      }
      response.statusCode = 404
      response.end()
    }))
    const bridgePort = await listen(createBridgeServer({
      port: 0,
      origins: ['https://canvas.example'],
      modelDirectories: [modelsDirectory],
    }))
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/models`, {
      method: 'POST',
      headers: { Origin: 'https://canvas.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: { protocol: 'http', host: '127.0.0.1', port: drawThingsPort, tls: false },
      }),
    })
    const result = await response.json() as { models: Array<{ file: string }>; source: string }

    expect(response.status).toBe(200)
    expect(result.source).toBe('combined')
    expect(result.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'local_main.ckpt' }),
      expect.objectContaining({ file: 'current_only.ckpt' }),
    ]))
    expect(result.models.map((model) => model.file)).not.toContain('clip_dependency.ckpt')
  })
})
