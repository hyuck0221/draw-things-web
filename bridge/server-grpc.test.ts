import { type Server as HttpServer } from 'node:http'
import { createServer as createHttp2Server, type Http2Server, type ServerHttp2Stream } from 'node:http2'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeServer } from './server.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

const httpServers: HttpServer[] = []
const grpcServers: Http2Server[] = []

async function listenHttp(server: HttpServer): Promise<number> {
  httpServers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

async function listenGrpc(server: Http2Server): Promise<number> {
  grpcServers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

afterEach(async () => {
  await Promise.all([
    ...httpServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    ...grpcServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  ])
})

function varint(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value
  do {
    let byte = remaining % 128
    remaining = Math.floor(remaining / 128)
    if (remaining > 0) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0)
  return Buffer.from(bytes)
}

function bytesField(field: number, value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value) : value
  return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
}

function integerField(field: number, value: number): Buffer {
  return Buffer.concat([varint(field << 3), varint(value)])
}

function grpcFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(5)
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function readVarint(buffer: Buffer, offset: number): { value: number; next: number } {
  let value = 0
  let multiplier = 1
  let cursor = offset
  while (cursor < buffer.length) {
    const byte = buffer[cursor++]!
    value += (byte & 0x7f) * multiplier
    if ((byte & 0x80) === 0) return { value, next: cursor }
    multiplier *= 128
  }
  throw new Error('Truncated protobuf varint')
}

function protobufBytesField(buffer: Buffer, targetField: number): Buffer | undefined {
  let cursor = 0
  while (cursor < buffer.length) {
    const key = readVarint(buffer, cursor)
    cursor = key.next
    const field = Math.floor(key.value / 8)
    const wireType = key.value & 7
    if (wireType === 0) {
      cursor = readVarint(buffer, cursor).next
      continue
    }
    if (wireType !== 2) throw new Error(`Unsupported protobuf wire type ${wireType}`)
    const length = readVarint(buffer, cursor)
    cursor = length.next
    const value = buffer.subarray(cursor, cursor + length.value)
    if (field === targetField) return value
    cursor += length.value
  }
  return undefined
}

function flatbufferField(buffer: Buffer, slot: number): number {
  const table = buffer.readUInt32LE(0)
  const vtable = table - buffer.readInt32LE(table)
  const entry = vtable + 4 + slot * 2
  if (entry + 2 > vtable + buffer.readUInt16LE(vtable)) return 0
  const offset = buffer.readUInt16LE(entry)
  return offset === 0 ? 0 : table + offset
}

function flatbufferVectorLength(buffer: Buffer, slot: number): number {
  const field = flatbufferField(buffer, slot)
  if (!field) return 0
  const vector = field + buffer.readUInt32LE(field)
  return buffer.readUInt32LE(vector)
}

function tensor(): Buffer {
  const header = Buffer.alloc(68)
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(2, 8)
  header.writeUInt32LE(0x20_000, 12)
  header.writeUInt32LE(1, 20)
  header.writeUInt32LE(1, 24)
  header.writeUInt32LE(1, 28)
  header.writeUInt32LE(3, 32)
  const values = Buffer.alloc(6)
  ;[0xbc00, 0x0000, 0x3c00].forEach((value, index) => values.writeUInt16LE(value, index * 2))
  return Buffer.concat([header, values])
}

function respond(stream: ServerHttp2Stream, payloads: Buffer[]): void {
  stream.respond({ ':status': 200, 'content-type': 'application/grpc' }, { waitForTrailers: true })
  stream.once('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '0' }))
  stream.end(Buffer.concat(payloads.map(grpcFrame)))
}

describe('bridge gRPC canvas integration', () => {
  it('reports txt2img capabilities and streams a generated PNG as NDJSON', async () => {
    let generateWireBody: Buffer | undefined
    const grpc = createHttp2Server()
    grpc.on('stream', (stream: ServerHttp2Stream, headers) => {
      const requestChunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => requestChunks.push(Buffer.from(chunk)))
      stream.once('end', () => {
        if (headers[':path'] === '/ImageGenerationService/Echo') {
          respond(stream, [Buffer.concat([
            bytesField(1, 'HELLO bridge'),
            bytesField(3, Buffer.alloc(0)),
          ])])
          return
        }
        if (headers[':path'] === '/ImageGenerationService/GenerateImage') {
          generateWireBody = Buffer.concat(requestChunks)
          respond(stream, [bytesField(1, tensor())])
          return
        }
        stream.respond({ ':status': 404 })
        stream.end()
      })
    })
    const grpcPort = await listenGrpc(grpc)
    const bridge = createBridgeServer({ port: 0, origins: ['https://canvas.example'] })
    const bridgePort = await listenHttp(bridge)
    const headers = { Origin: 'https://canvas.example', 'Content-Type': 'application/json' }
    const connection = {
      protocol: 'grpc',
      host: '127.0.0.1',
      port: grpcPort,
      tls: false,
      timeoutMs: 2_000,
    }

    const test = await fetch(`http://127.0.0.1:${bridgePort}/v1/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ connection }),
    })
    expect(await test.json()).toMatchObject({
      ok: true,
      phase: 'online',
      capabilities: {
        protocol: 'grpc',
        canGenerate: true,
        canImageToImage: false,
        canStreamProgress: true,
        canCancel: true,
        canBrowseModels: true,
        requiresHttpModeForCanvas: false,
      },
    })

    const generation = await fetch(`http://127.0.0.1:${bridgePort}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection,
        request: {
          id: 'grpc-job',
          mode: 'txt2img',
          prompt: 'cat',
          negativePrompt: '',
          parameters: {
            model: 'model.ckpt',
            width: 512,
            height: 512,
            restore_faces: true,
            controls: [{ file: 'control.ckpt', weight: 1 }],
          },
        },
      }),
    })
    const events = (await generation.text()).trim().split('\n').map((line) => JSON.parse(line))
    expect(events).toMatchObject([
      { type: 'accepted', requestId: 'grpc-job' },
      { type: 'result', requestId: 'grpc-job', images: [expect.any(String)] },
    ])
    expect(Buffer.from(String(events[1]?.images[0]), 'base64').subarray(0, 8))
      .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(generateWireBody).toBeDefined()
    const framedLength = generateWireBody!.readUInt32BE(1)
    const requestMessage = generateWireBody!.subarray(5, 5 + framedLength)
    const configuration = protobufBytesField(requestMessage, 7)
    expect(configuration).toBeDefined()
    expect(flatbufferVectorLength(configuration!, 19)).toBe(0)
    expect(flatbufferField(configuration!, 22)).toBe(0)

    const unsupported = await fetch(`http://127.0.0.1:${bridgePort}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection,
        request: {
          id: 'grpc-img2img',
          mode: 'img2img',
          prompt: 'cat',
          negativePrompt: '',
          parameters: { model: 'model.ckpt', width: 512, height: 512 },
          initImage: 'AA==',
        },
      }),
    })
    expect(unsupported.status).toBe(409)
    expect(await unsupported.json()).toMatchObject({
      ok: false,
      error: {
        code: 'GRPC_IMG2IMG_NOT_IMPLEMENTED',
        details: { generationTransport: 'grpc', supportedModes: ['txt2img'] },
      },
    })
  })

  it('does not claim model browsing when authenticated Echo omits its metadata payload', async () => {
    const grpc = createHttp2Server()
    grpc.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => respond(stream, [bytesField(1, 'HELLO bridge')]))
    })
    const grpcPort = await listenGrpc(grpc)
    const bridge = createBridgeServer({ port: 0, origins: ['https://canvas.example'] })
    const bridgePort = await listenHttp(bridge)
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/test`, {
      method: 'POST',
      headers: { Origin: 'https://canvas.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: {
          protocol: 'grpc', host: '127.0.0.1', port: grpcPort, tls: false, timeoutMs: 2_000,
        },
      }),
    })
    expect(await response.json()).toMatchObject({
      ok: true,
      capabilities: { canGenerate: true, canBrowseModels: false },
      warnings: [expect.stringContaining('model browsing is disabled')],
    })
  })

  it('does not advertise generation until Draw Things accepts a shared secret', async () => {
    const grpc = createHttp2Server()
    grpc.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => {
        respond(stream, [Buffer.concat([
          bytesField(1, 'HELLO bridge'),
          integerField(4, 1),
        ])])
      })
    })
    const grpcPort = await listenGrpc(grpc)
    const bridge = createBridgeServer({ port: 0, origins: ['https://canvas.example'] })
    const bridgePort = await listenHttp(bridge)
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/test`, {
      method: 'POST',
      headers: { Origin: 'https://canvas.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: {
          protocol: 'grpc',
          host: '127.0.0.1',
          port: grpcPort,
          tls: false,
          timeoutMs: 2_000,
        },
      }),
    })
    expect(await response.json()).toMatchObject({
      ok: true,
      message: expect.stringContaining('공유 비밀'),
      capabilities: {
        canGenerate: false,
        canStreamProgress: false,
        canCancel: false,
        sharedSecretRequired: true,
      },
    })
  })

  it('ends an active gRPC NDJSON stream with cancelled and no later events', async () => {
    let markUpstreamClosed = () => {}
    const upstreamClosed = new Promise<void>((resolve) => { markUpstreamClosed = resolve })
    const grpc = createHttp2Server()
    grpc.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('error', () => {})
      stream.on('close', markUpstreamClosed)
      stream.on('data', () => {})
      stream.once('end', () => {
        stream.respond({ ':status': 200, 'content-type': 'application/grpc' })
      })
    })
    const grpcPort = await listenGrpc(grpc)
    const bridge = createBridgeServer({ port: 0, origins: ['https://canvas.example'] })
    const bridgePort = await listenHttp(bridge)
    const headers = { Origin: 'https://canvas.example', 'Content-Type': 'application/json' }
    const generation = await fetch(`http://127.0.0.1:${bridgePort}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        connection: {
          protocol: 'grpc', host: '127.0.0.1', port: grpcPort, tls: false, timeoutMs: 2_000,
        },
        request: {
          id: 'cancel-grpc-job',
          mode: 'txt2img',
          prompt: 'cat',
          negativePrompt: '',
          parameters: { model: 'model.ckpt', width: 512, height: 512 },
        },
      }),
    })
    const cancel = await fetch(`http://127.0.0.1:${bridgePort}/v1/cancel/cancel-grpc-job`, {
      method: 'POST',
      headers,
    })
    expect(await cancel.json()).toMatchObject({ ok: true, cancelled: true })
    const events = (await generation.text()).trim().split('\n').map((line) => JSON.parse(line))
    expect(events).toEqual([
      expect.objectContaining({ type: 'accepted', requestId: 'cancel-grpc-job' }),
      expect.objectContaining({ type: 'cancelled', requestId: 'cancel-grpc-job' }),
    ])
    expect(events.some((event) => event.type === 'progress' || event.type === 'result')).toBe(false)
    await upstreamClosed
  })
})
