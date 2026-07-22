import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  decodeEchoReply,
  decodeGrpcFrames,
  decodeImageGenerationResponse,
  encodeEchoRequest,
  encodeImageGenerationRequest,
  frameGrpcMessage,
  GrpcFrameDecoder,
} from './protobuf.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

function lengthDelimited(field: number, value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value) : value
  if (bytes.length >= 128) throw new Error('test helper only supports short fields')
  return Buffer.concat([Buffer.from([(field << 3) | 2, bytes.length]), bytes])
}

describe('Draw Things Echo protobuf', () => {
  it('encodes the exact EchoRequest field numbers', () => {
    expect(encodeEchoRequest('web', 'secret')).toEqual(Buffer.from([
      0x0a, 0x03, 0x77, 0x65, 0x62,
      0x12, 0x06, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74,
    ]))
  })

  it('decodes files, JSON model browsing metadata, auth state, and uint64 ids', () => {
    const metadata = Buffer.concat([
      lengthDelimited(1, '[{"file":"model.ckpt"}]'),
      lengthDelimited(2, '[{"file":"style.safetensors"}]'),
    ])
    const encoded = Buffer.concat([
      lengthDelimited(1, 'HELLO draw-things-web'),
      lengthDelimited(2, 'model.ckpt'),
      lengthDelimited(3, metadata),
      Buffer.from([0x20, 0x01]),
      Buffer.from([0x30, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]),
    ])

    const value = decodeEchoReply(encoded)
    expect(value.message).toBe('HELLO draw-things-web')
    expect(value.files).toEqual(['model.ckpt'])
    expect(value.metadata.models).toEqual([{ file: 'model.ckpt' }])
    expect(value.metadata.loras).toEqual([{ file: 'style.safetensors' }])
    expect(value.modelBrowsingAvailable).toBe(true)
    expect(value.sharedSecretMissing).toBe(true)
    expect(value.serverIdentifier).toBe('9223372036854775807')
  })

  it('handles gzip-compressed native gRPC response framing', () => {
    const protobuf = lengthDelimited(1, 'HELLO')
    const compressed = gzipSync(protobuf)
    const header = Buffer.alloc(5)
    header[0] = 1
    header.writeUInt32BE(compressed.length, 1)
    expect(decodeGrpcFrames(Buffer.concat([header, compressed]), 'gzip')).toEqual([protobuf])
    expect(decodeGrpcFrames(frameGrpcMessage(protobuf), undefined)).toEqual([protobuf])
  })
})

describe('Draw Things GenerateImage protobuf', () => {
  it('encodes configuration, identity, shared secret, and chunk support with official field numbers', () => {
    expect(encodeImageGenerationRequest({
      prompt: 'cat',
      negativePrompt: '',
      configuration: Buffer.from([1, 2]),
      user: 'web',
      sharedSecret: 's',
    })).toEqual(Buffer.from([
      0x10, 0x01,
      0x2a, 0x03, 0x63, 0x61, 0x74,
      0x3a, 0x02, 0x01, 0x02,
      0x52, 0x03, 0x77, 0x65, 0x62,
      0x58, 0x02,
      0x6a, 0x01, 0x73,
      0x70, 0x01,
    ]))
  })

  it('decodes progress, tensor chunks, scale, and projected download size', () => {
    const sampling = Buffer.from([0x1a, 0x02, 0x08, 0x07])
    const encoded = Buffer.concat([
      lengthDelimited(1, Buffer.from([1, 2, 3])),
      lengthDelimited(2, sampling),
      Buffer.from([0x28, 0x02]),
      Buffer.from([0x38, 0xac, 0x02]),
      Buffer.from([0x40, 0x01]),
    ])
    expect(decodeImageGenerationResponse(encoded)).toEqual({
      generatedImages: [Buffer.from([1, 2, 3])],
      currentSignpost: { phase: 'sampling', step: 7 },
      scaleFactor: 2,
      downloadSize: 300,
      chunkState: 'more',
    })
  })

  it('decodes gRPC frames incrementally across arbitrary network chunks', () => {
    const first = frameGrpcMessage(Buffer.from('first'))
    const second = frameGrpcMessage(Buffer.from('second'))
    const wire = Buffer.concat([first, second])
    const decoder = new GrpcFrameDecoder(undefined, 1024)
    expect(decoder.push(wire.subarray(0, 3))).toEqual([])
    expect(decoder.push(wire.subarray(3, 9))).toEqual([])
    expect(decoder.push(wire.subarray(9))).toEqual([Buffer.from('first'), Buffer.from('second')])
    expect(() => decoder.finish()).not.toThrow()
  })

  it('assembles large fragmented frames without repeatedly concatenating the pending payload', () => {
    const payload = Buffer.alloc(4 * 1024 * 1024, 0x5a)
    const wire = frameGrpcMessage(payload)
    const decoder = new GrpcFrameDecoder(undefined, payload.length)
    const concat = vi.spyOn(Buffer, 'concat')
    const frames: Buffer[] = []
    let concatCalls: number
    try {
      for (let offset = 0; offset < wire.length; offset += 16 * 1024) {
        frames.push(...decoder.push(wire.subarray(offset, offset + 16 * 1024)))
      }
      decoder.finish()
      concatCalls = concat.mock.calls.length
    } finally {
      concat.mockRestore()
    }
    expect(concatCalls).toBe(0)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.equals(payload)).toBe(true)
  })
})
