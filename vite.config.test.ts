// @vitest-environment node

import { createServer, request as requestHttp, type Server } from 'node:http'
import { createConnection } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  apiRequestKind,
  createDrawThingsApiMiddleware,
  generationBodyTimeoutMs,
  upstreamHostname,
} from './vite.config'

describe('Draw Things API route guard', () => {
  it('allows only the canonical route and method combinations', () => {
    expect(apiRequestKind('/sdapi/v1/options?fresh=1', 'GET')).toBe('options')
    expect(apiRequestKind('/sdapi/v1/txt2img', 'POST')).toBe('generation')
    expect(apiRequestKind('/sdapi/v1/img2img', 'POST')).toBe('generation')
    expect(apiRequestKind('/sdapi/v1/options', 'DELETE')).toBe('rejected')
    expect(apiRequestKind('/sdapi/v1/sd-models', 'GET')).toBe('rejected')
  })

  it('rejects encoded and dot-segment paths before proxy normalization', () => {
    const bypassAttempts = [
      '/sdapi/%2e%2e/',
      '/sdapi/%2e%2e/%73dapi/v1/options',
      '/sdapi/%2e%2e/%73dapi/v1/txt2img',
      '/sdapi/%2e%2e/s%64api/v1/img2img',
      '/sdapi%2fv1%2foptions',
    ]
    for (const path of bypassAttempts) {
      expect(apiRequestKind(path, path.endsWith('options') ? 'GET' : 'POST')).toBe('rejected')
    }
  })

  it('leaves non-API application paths alone', () => {
    expect(apiRequestKind('/', 'GET')).toBe('unrelated')
    expect(apiRequestKind('/assets/index.js', 'GET')).toBe('unrelated')
    expect(apiRequestKind('/sdapi-not-an-api', 'GET')).toBe('rejected')
  })

  it('bounds incomplete generation uploads to a short, configurable timeout', () => {
    const previous = process.env.DRAW_THINGS_BODY_TIMEOUT_MS
    process.env.DRAW_THINGS_BODY_TIMEOUT_MS = '350'
    expect(generationBodyTimeoutMs(128 * 1024 * 1024)).toBe(350)
    if (previous === undefined) delete process.env.DRAW_THINGS_BODY_TIMEOUT_MS
    else process.env.DRAW_THINGS_BODY_TIMEOUT_MS = previous

    expect(generationBodyTimeoutMs(1)).toBe(17_000)
    expect(generationBodyTimeoutMs(128 * 1024 * 1024)).toBe(180_000)
  })

  it('passes IPv6 upstream literals to Node without URL brackets', () => {
    expect(upstreamHostname(new URL('http://[::1]:7860'))).toBe('::1')
    expect(upstreamHostname(new URL('http://127.0.0.1:7860'))).toBe('127.0.0.1')
  })
})

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('테스트 서버 포트를 열지 못했습니다.'))
      else resolve(address.port)
    })
  })
}

function close(server: Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}

function requestStatus(
  port: number,
  path: string,
  body?: string,
  headers: Record<string, string | number> = {},
) {
  return new Promise<number>((resolve, reject) => {
    const request = requestHttp({
      hostname: '127.0.0.1',
      port,
      path,
      method: body === undefined ? 'GET' : 'POST',
      headers,
    }, (response) => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.once('error', reject)
    request.end(body)
  })
}

function generationBody(prompt: string) {
  return JSON.stringify({ prompt, width: 512, height: 512, batch_count: 1, batch_size: 1 })
}

async function waitUntil(predicate: () => boolean, timeout = 2_000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('조건 대기 시간이 초과되었습니다.')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe.sequential('Draw Things API gateway sockets', () => {
  let upstream: Server
  let gateway: Server
  let gatewayPort = 0
  let upstreamActive = 0
  let upstreamMaximum = 0
  let previousOrigin: string | undefined
  let previousBodyTimeout: string | undefined

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      if (request.url?.startsWith('/sdapi/v1/options')) {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ model: 'fake.ckpt', width: 512, height: 512, steps: 2 }))
        return
      }
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.once('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { prompt?: string }
        upstreamActive += 1
        upstreamMaximum = Math.max(upstreamMaximum, upstreamActive)
        setTimeout(() => {
          upstreamActive -= 1
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ images: ['iVBORw0KGgo='], parameters: {}, info: '' }))
        }, payload.prompt === 'slow' ? 600 : 10)
      })
    })
    const upstreamPort = await listen(upstream)
    previousOrigin = process.env.DRAW_THINGS_API_ORIGIN
    previousBodyTimeout = process.env.DRAW_THINGS_BODY_TIMEOUT_MS
    process.env.DRAW_THINGS_API_ORIGIN = `http://127.0.0.1:${upstreamPort}`
    process.env.DRAW_THINGS_BODY_TIMEOUT_MS = '200'
    const middleware = createDrawThingsApiMiddleware()
    gateway = createServer((request, response) => {
      middleware(request, response, () => {
        response.statusCode = 404
        response.end()
      })
    })
    gatewayPort = await listen(gateway)
  })

  beforeEach(async () => {
    await waitUntil(() => upstreamActive === 0)
    upstreamMaximum = 0
  })

  afterAll(async () => {
    await close(gateway)
    await close(upstream)
    if (previousOrigin === undefined) delete process.env.DRAW_THINGS_API_ORIGIN
    else process.env.DRAW_THINGS_API_ORIGIN = previousOrigin
    if (previousBodyTimeout === undefined) delete process.env.DRAW_THINGS_BODY_TIMEOUT_MS
    else process.env.DRAW_THINGS_BODY_TIMEOUT_MS = previousBodyTimeout
  })

  it('rejects Expect and releases a partial upload after its deadline', async () => {
    await expect(requestStatus(gatewayPort, '/sdapi/v1/options', undefined, {
      host: `localhost:${gatewayPort}`,
    })).resolves.toBe(200)
    await expect(requestStatus(gatewayPort, '/sdapi/v1/options', undefined, {
      host: 'rebind.example',
    })).resolves.toBe(403)
    const validBody = generationBody('fast')
    await expect(requestStatus(gatewayPort, '/sdapi/v1/txt2img', validBody, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(validBody),
      expect: '100-continue',
    })).resolves.toBe(417)

    const partial = await new Promise<{ status: number; elapsed: number }>((resolve, reject) => {
      const started = Date.now()
      let received = ''
      const socket = createConnection(gatewayPort, '127.0.0.1', () => {
        const lines = [
          'POST /sdapi/v1/txt2img HTTP/1.1',
          `Host: 127.0.0.1:${gatewayPort}`,
          'Content-Type: application/json',
          'Content-Length: 100',
          'Connection: close',
          '',
          '{"width":',
        ]
        socket.write(lines.join('\r\n'))
      })
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => { received += chunk })
      socket.once('error', reject)
      socket.once('end', () => {
        resolve({
          status: Number(received.split('\r\n')[0]?.split(' ')[1]),
          elapsed: Date.now() - started,
        })
      })
    })
    expect(partial.status).toBe(408)
    expect(partial.elapsed).toBeLessThan(1_000)
    await expect(requestStatus(gatewayPort, '/sdapi/v1/txt2img', validBody, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(validBody),
    })).resolves.toBe(200)
  })

  it('keeps the generation lock until Draw Things ends after the browser disconnects', async () => {
    const slowBody = generationBody('slow')
    const abandoned = requestHttp({
      hostname: '127.0.0.1',
      port: gatewayPort,
      path: '/sdapi/v1/txt2img',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(slowBody),
      },
    }, (response) => response.resume())
    abandoned.on('error', () => {})
    abandoned.end(slowBody)
    await waitUntil(() => upstreamActive === 1)
    abandoned.destroy()

    const nextBody = generationBody('fast')
    await expect(requestStatus(gatewayPort, '/sdapi/v1/txt2img', nextBody, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(nextBody),
    })).resolves.toBe(429)
    await expect(requestStatus(gatewayPort, '/sdapi/v1/options')).resolves.toBe(429)
    await waitUntil(() => upstreamActive === 0)
    await expect(requestStatus(gatewayPort, '/sdapi/v1/txt2img', nextBody, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(nextBody),
    })).resolves.toBe(200)
    expect(upstreamMaximum).toBe(1)
  })
})
