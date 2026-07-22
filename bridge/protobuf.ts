import { gunzipSync } from 'node:zlib'
import { BridgeError, type EchoMetadata, type EchoReplyDecoded } from './types.ts'

const EMPTY_METADATA: EchoMetadata = {
  models: [],
  loras: [],
  controlNets: [],
  textualInversions: [],
  upscalers: [],
}

function encodeVarint(value: number | bigint): Buffer {
  let remaining = BigInt(value)
  if (remaining < 0n) throw new BridgeError('PROTOBUF_ENCODE_ERROR', 'Cannot encode a negative varint.')
  const bytes: number[] = []
  do {
    let byte = Number(remaining & 0x7fn)
    remaining >>= 7n
    if (remaining > 0n) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0n)
  return Buffer.from(bytes)
}

function encodeStringField(field: number, value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(bytes.length), bytes])
}

export function encodeEchoRequest(name: string, sharedSecret?: string): Buffer {
  const fields = [encodeStringField(1, name)]
  if (sharedSecret !== undefined) fields.push(encodeStringField(2, sharedSecret))
  return Buffer.concat(fields)
}

interface Cursor {
  offset: number
}

function readVarint(buffer: Buffer, cursor: Cursor): bigint {
  let result = 0n
  let shift = 0n
  for (let index = 0; index < 10; index += 1) {
    if (cursor.offset >= buffer.length) {
      throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Truncated protobuf varint.', 502)
    }
    const byte = buffer[cursor.offset++]!
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return result
    shift += 7n
  }
  throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Protobuf varint exceeds 10 bytes.', 502)
}

function readLengthDelimited(buffer: Buffer, cursor: Cursor): Buffer {
  const lengthValue = readVarint(buffer, cursor)
  if (lengthValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Protobuf field length is too large.', 502)
  }
  const length = Number(lengthValue)
  const end = cursor.offset + length
  if (length < 0 || end > buffer.length) {
    throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Truncated protobuf field.', 502)
  }
  const value = buffer.subarray(cursor.offset, end)
  cursor.offset = end
  return value
}

function skipField(buffer: Buffer, cursor: Cursor, wireType: number): void {
  switch (wireType) {
    case 0:
      readVarint(buffer, cursor)
      return
    case 1:
      cursor.offset += 8
      break
    case 2:
      readLengthDelimited(buffer, cursor)
      return
    case 5:
      cursor.offset += 4
      break
    default:
      throw new BridgeError('PROTOBUF_DECODE_ERROR', `Unsupported protobuf wire type ${wireType}.`, 502)
  }
  if (cursor.offset > buffer.length) {
    throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Truncated protobuf fixed-width field.', 502)
  }
}

function jsonMetadata(bytes: Buffer): unknown {
  if (bytes.length === 0) return []
  const json = bytes.toString('utf8')
  try {
    return JSON.parse(json)
  } catch {
    return {
      parseError: 'Draw Things returned invalid JSON metadata.',
      rawBase64: bytes.toString('base64'),
    }
  }
}

function decodeMetadataOverride(buffer: Buffer): EchoMetadata {
  const result: EchoMetadata = { ...EMPTY_METADATA }
  const cursor: Cursor = { offset: 0 }
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor))
    const field = tag >>> 3
    const wireType = tag & 7
    if (wireType !== 2 || field < 1 || field > 5) {
      skipField(buffer, cursor, wireType)
      continue
    }
    const value = jsonMetadata(readLengthDelimited(buffer, cursor))
    if (field === 1) result.models = value
    if (field === 2) result.loras = value
    if (field === 3) result.controlNets = value
    if (field === 4) result.textualInversions = value
    if (field === 5) result.upscalers = value
  }
  return result
}

function bigintToJson(value: bigint): number | string {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()
}

function decodeThresholds(buffer: Buffer): EchoReplyDecoded['thresholds'] {
  const cursor: Cursor = { offset: 0 }
  let community = 0
  let plus = 0
  let expireAt: number | string = 0
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor))
    const field = tag >>> 3
    const wireType = tag & 7
    if ((field === 1 || field === 2) && wireType === 1) {
      if (cursor.offset + 8 > buffer.length) {
        throw new BridgeError('PROTOBUF_DECODE_ERROR', 'Truncated threshold value.', 502)
      }
      const value = buffer.readDoubleLE(cursor.offset)
      cursor.offset += 8
      if (field === 1) community = value
      if (field === 2) plus = value
    } else if (field === 3 && wireType === 0) {
      expireAt = bigintToJson(readVarint(buffer, cursor))
    } else {
      skipField(buffer, cursor, wireType)
    }
  }
  return { community, plus, expireAt }
}

export function decodeEchoReply(buffer: Buffer): EchoReplyDecoded {
  const result: EchoReplyDecoded = {
    message: '',
    files: [],
    metadata: { ...EMPTY_METADATA },
    sharedSecretMissing: false,
    serverIdentifier: '0',
  }
  const cursor: Cursor = { offset: 0 }
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor))
    const field = tag >>> 3
    const wireType = tag & 7
    if (field === 1 && wireType === 2) {
      result.message = readLengthDelimited(buffer, cursor).toString('utf8')
    } else if (field === 2 && wireType === 2) {
      result.files.push(readLengthDelimited(buffer, cursor).toString('utf8'))
    } else if (field === 3 && wireType === 2) {
      result.metadata = decodeMetadataOverride(readLengthDelimited(buffer, cursor))
    } else if (field === 4 && wireType === 0) {
      result.sharedSecretMissing = readVarint(buffer, cursor) !== 0n
    } else if (field === 5 && wireType === 2) {
      result.thresholds = decodeThresholds(readLengthDelimited(buffer, cursor))
    } else if (field === 6 && wireType === 0) {
      result.serverIdentifier = readVarint(buffer, cursor).toString()
    } else {
      skipField(buffer, cursor, wireType)
    }
  }
  return result
}

export function frameGrpcMessage(payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(5)
  header[0] = 0
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

export function decodeGrpcFrames(
  data: Buffer,
  encoding: string | undefined,
  maximumMessageBytes = 64 * 1024 * 1024,
): Buffer[] {
  const frames: Buffer[] = []
  let offset = 0
  while (offset < data.length) {
    if (data.length - offset < 5) {
      throw new BridgeError('GRPC_FRAME_ERROR', 'Truncated gRPC frame header.', 502)
    }
    const compressed = data[offset]!
    const length = data.readUInt32BE(offset + 1)
    offset += 5
    if (length > maximumMessageBytes || offset + length > data.length) {
      throw new BridgeError('GRPC_FRAME_ERROR', 'Invalid or oversized gRPC frame.', 502)
    }
    const payload = data.subarray(offset, offset + length)
    offset += length
    if (compressed === 0) {
      frames.push(payload)
    } else if (compressed === 1 && encoding?.toLowerCase() === 'gzip') {
      const decompressed = gunzipSync(payload, { maxOutputLength: maximumMessageBytes })
      frames.push(decompressed)
    } else {
      throw new BridgeError(
        'GRPC_COMPRESSION_UNSUPPORTED',
        `Unsupported gRPC compression encoding: ${encoding ?? 'missing'}.`,
        502,
      )
    }
  }
  return frames
}

