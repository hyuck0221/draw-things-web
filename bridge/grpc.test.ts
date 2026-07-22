import { createServer, type Http2Server, type ServerHttp2Stream } from 'node:http2'
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
  type Socket,
} from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { echoGrpc, generateGrpcImages } from './grpc.ts'
import { type NormalizedConnection } from './types.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

const servers: Http2Server[] = []
const tcpServers: TcpServer[] = []

async function listen(server: Http2Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

async function listenTcp(server: TcpServer): Promise<number> {
  tcpServers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

function withinOneSecond<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Operation did not settle within one second.')), 1_000)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

afterEach(async () => {
  await Promise.all([
    ...servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    ...tcpServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
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

function bytesField(field: number, value: Buffer): Buffer {
  return Buffer.concat([varint((field << 3) | 2), varint(value.length), value])
}

function integerField(field: number, value: number): Buffer {
  return Buffer.concat([varint(field << 3), varint(value)])
}

function grpcFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(5)
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function rawFloat16Tensor(): Buffer {
  const header = Buffer.alloc(68)
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(2, 8)
  header.writeUInt32LE(0x20_000, 12)
  header.writeUInt32LE(1, 20)
  header.writeUInt32LE(1, 24)
  header.writeUInt32LE(2, 28)
  header.writeUInt32LE(3, 32)
  const values = Buffer.alloc(12)
  const words = [0xbc00, 0x0000, 0x3c00, 0xb800, 0x3800, 0x3400]
  words.forEach((value, index) => values.writeUInt16LE(value, index * 2))
  return Buffer.concat([header, values])
}

function latentPreviewTensor(): Buffer {
  const header = Buffer.alloc(68)
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(2, 8)
  header.writeUInt32LE(0x20_000, 12)
  header.writeUInt32LE(1, 20)
  header.writeUInt32LE(1, 24)
  header.writeUInt32LE(1, 28)
  header.writeUInt32LE(4, 32)
  const values = Buffer.alloc(8)
  ;[0xbc00, 0x0000, 0x3c00, 0x3800]
    .forEach((value, index) => values.writeUInt16LE(value, index * 2))
  return Buffer.concat([header, values])
}

function wideLatentPreviewTensor(): Buffer {
  const header = Buffer.alloc(68)
  header.writeUInt32LE(1, 4)
  header.writeUInt32LE(2, 8)
  header.writeUInt32LE(0x20_000, 12)
  header.writeUInt32LE(1, 20)
  header.writeUInt32LE(1, 24)
  header.writeUInt32LE(1, 28)
  header.writeUInt32LE(16, 32)
  return Buffer.concat([header, Buffer.alloc(32)])
}

function connection(port: number): NormalizedConnection {
  return {
    protocol: 'grpc',
    host: '127.0.0.1',
    port,
    tls: false,
    verifyTls: false,
    clientName: 'Draw Things Local Canvas Test',
    sharedSecret: 'pair-secret',
    timeoutMs: 2_000,
  }
}

function respondWithTrailers(stream: ServerHttp2Stream, wire: Buffer): void {
  stream.respond({ ':status': 200, 'content-type': 'application/grpc' }, { waitForTrailers: true })
  stream.once('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '0' }))
  stream.write(wire.subarray(0, 2))
  stream.write(wire.subarray(2, 11))
  stream.end(wire.subarray(11))
}

describe('Draw Things native gRPC generation', () => {
  it('streams progress, joins tensor chunks, and returns a browser PNG', async () => {
    const tensor = rawFloat16Tensor()
    let requestWire = Buffer.alloc(0)
    let requestPath = ''
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream, headers) => {
      requestPath = String(headers[':path'] ?? '')
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      stream.once('end', () => {
        requestWire = Buffer.concat(chunks)
        const samplingSignpost = bytesField(3, integerField(1, 3))
        const progress = Buffer.concat([
          bytesField(2, samplingSignpost),
          bytesField(4, tensor),
        ])
        const firstChunk = Buffer.concat([
          bytesField(1, tensor.subarray(0, 31)),
          integerField(8, 1),
        ])
        const lastChunk = Buffer.concat([
          bytesField(1, tensor.subarray(31)),
          integerField(5, 1),
        ])
        respondWithTrailers(stream, Buffer.concat([
          grpcFrame(progress),
          grpcFrame(firstChunk),
          grpcFrame(lastChunk),
        ]))
      })
    })
    const port = await listen(server)
    const progress: Array<Record<string, unknown>> = []

    const result = await generateGrpcImages(
      connection(port),
      'cat',
      'blur',
      { model: 'model.ckpt', width: 512, height: 512, steps: 16 },
      undefined,
      (value) => { progress.push(value as unknown as Record<string, unknown>) },
    )

    expect(requestPath).toBe('/ImageGenerationService/GenerateImage')
    expect(requestWire.subarray(0, 1)).toEqual(Buffer.from([0]))
    expect(requestWire.includes(Buffer.from('cat'))).toBe(true)
    expect(requestWire.includes(Buffer.from('blur'))).toBe(true)
    expect(requestWire.includes(Buffer.from('model.ckpt'))).toBe(true)
    expect(requestWire.includes(Buffer.from('pair-secret'))).toBe(true)
    expect(progress).toMatchObject([
      { signpost: { phase: 'sampling', step: 3 } },
      { previewImage: expect.any(String) },
    ])
    expect(Buffer.from(String(progress[1]?.previewImage), 'base64').subarray(0, 8))
      .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(result.scaleFactor).toBe(1)
    expect(result.images).toHaveLength(1)
    const png = Buffer.from(result.images[0]!, 'base64')
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(1)
  })

  it('cancels queued stream processing without emitting later progress or a result', async () => {
    const resultTensor = rawFloat16Tensor()
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => {
        const progressOne = bytesField(2, bytesField(3, integerField(1, 1)))
        const progressTwo = bytesField(2, bytesField(3, integerField(1, 2)))
        respondWithTrailers(stream, Buffer.concat([
          grpcFrame(progressOne),
          grpcFrame(progressTwo),
          grpcFrame(bytesField(1, resultTensor)),
        ]))
      })
    })
    const port = await listen(server)
    const controller = new AbortController()
    let releaseFirstProgress = () => {}
    let markFirstProgressStarted = () => {}
    const firstProgressGate = new Promise<void>((resolve) => { releaseFirstProgress = resolve })
    const firstProgressStarted = new Promise<void>((resolve) => { markFirstProgressStarted = resolve })
    const progressSteps: number[] = []
    const generation = generateGrpcImages(
      connection(port),
      'cat',
      '',
      { model: 'model.ckpt', width: 512, height: 512 },
      controller.signal,
      async (progress) => {
        if (progress.signpost?.step === undefined) return
        progressSteps.push(progress.signpost.step)
        if (progressSteps.length === 1) {
          markFirstProgressStarted()
          await firstProgressGate
        }
      },
    )
    await firstProgressStarted
    controller.abort()
    releaseFirstProgress()
    await expect(generation).rejects.toMatchObject({ code: 'ABORTED', status: 499 })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(progressSteps).toEqual([1])
  })

  it('does not miss cancellation between the preflight check and listener registration', async () => {
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('error', () => {})
      stream.on('data', () => {})
    })
    const port = await listen(server)
    let abortedReads = 0
    const signal = {
      get aborted() {
        abortedReads += 1
        return abortedReads >= 3
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal

    await expect(generateGrpcImages(
      connection(port),
      'cat',
      '',
      { model: 'model.ckpt', width: 512, height: 512 },
      signal,
    )).rejects.toMatchObject({ code: 'ABORTED', status: 499 })
  })

  it('cancels within one second while a TCP peer stalls the TLS handshake', async () => {
    let acceptedSocket: Socket | undefined
    let markAccepted = () => {}
    const accepted = new Promise<void>((resolve) => { markAccepted = resolve })
    const stalledTlsServer = createTcpServer((socket) => {
      acceptedSocket = socket
      socket.on('error', () => {})
      markAccepted()
    })
    const port = await listenTcp(stalledTlsServer)
    const controller = new AbortController()

    try {
      const generation = generateGrpcImages(
        { ...connection(port), tls: true, verifyTls: false, timeoutMs: 5_000 },
        'cat',
        '',
        { model: 'model.ckpt', width: 512, height: 512 },
        controller.signal,
      )
      await withinOneSecond(accepted)
      controller.abort()
      await expect(withinOneSecond(generation)).rejects.toMatchObject({ code: 'ABORTED', status: 499 })
    } finally {
      acceptedSocket?.destroy()
    }
  })

  it('rejects a generation stream that ends without an authoritative grpc-status', async () => {
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => {
        stream.respond({ ':status': 200, 'content-type': 'application/grpc' })
        stream.end(grpcFrame(bytesField(1, rawFloat16Tensor())))
      })
    })
    const port = await listen(server)

    await expect(generateGrpcImages(
      connection(port),
      'cat',
      '',
      { model: 'model.ckpt', width: 512, height: 512 },
    )).rejects.toMatchObject({ code: 'GRPC_STATUS_MISSING', status: 502 })
  })

  it('rejects an Echo response that ends without an authoritative grpc-status', async () => {
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => {
        stream.respond({ ':status': 200, 'content-type': 'application/grpc' })
        stream.end(grpcFrame(bytesField(1, Buffer.from('HELLO'))))
      })
    })
    const port = await listen(server)
    await expect(echoGrpc(connection(port))).rejects.toMatchObject({
      code: 'GRPC_STATUS_MISSING',
      status: 502,
    })
  })

  it('does not misrender a four-channel model latent as an RGB preview', async () => {
    const server = createServer()
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => {})
      stream.once('end', () => {
        respondWithTrailers(stream, Buffer.concat([
          grpcFrame(bytesField(4, latentPreviewTensor())),
          grpcFrame(bytesField(4, wideLatentPreviewTensor())),
          grpcFrame(bytesField(1, rawFloat16Tensor())),
        ]))
      })
    })
    const port = await listen(server)
    const previews: string[] = []
    const result = await generateGrpcImages(
      connection(port),
      'cat',
      '',
      { model: 'model.ckpt', width: 512, height: 512 },
      undefined,
      (progress) => {
        if (progress.previewImage) previews.push(progress.previewImage)
      },
    )
    expect(previews).toEqual([])
    expect(result.images).toHaveLength(1)
  })
})
