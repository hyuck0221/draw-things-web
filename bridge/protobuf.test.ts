import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeEchoReply, decodeGrpcFrames, encodeEchoRequest, frameGrpcMessage } from './protobuf.ts'

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
