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

function encodeBytesField(field: number, value: Buffer): Buffer {
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(value.length), value])
}

function encodeVarintField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([encodeVarint(field << 3), encodeVarint(value)])
}

export function encodeEchoRequest(name: string, sharedSecret?: string): Buffer {
  const fields = [encodeStringField(1, name)]
  if (sharedSecret !== undefined) fields.push(encodeStringField(2, sharedSecret))
  return Buffer.concat(fields)
}

export interface ImageGenerationRequestInput {
  prompt: string
  negativePrompt: string
  configuration: Buffer
  user: string
  sharedSecret?: string
  chunked?: boolean
}

export function encodeImageGenerationRequest(input: ImageGenerationRequestInput): Buffer {
  if (Buffer.byteLength(input.prompt, 'utf8') > 1024 * 1024
    || Buffer.byteLength(input.negativePrompt, 'utf8') > 1024 * 1024) {
    throw new BridgeError('GRPC_PROMPT_TOO_LARGE', 'gRPC prompts are limited to 1 MiB each.', 413)
  }
  if (input.configuration.length === 0 || input.configuration.length > 4 * 1024 * 1024) {
    throw new BridgeError('GRPC_CONFIGURATION_TOO_LARGE', 'gRPC configuration is empty or too large.', 413)
  }
  const fields = [
    encodeVarintField(2, 1),
    ...(input.prompt ? [encodeStringField(5, input.prompt)] : []),
    ...(input.negativePrompt ? [encodeStringField(6, input.negativePrompt)] : []),
    encodeBytesField(7, input.configuration),
    encodeStringField(10, input.user),
    encodeVarintField(11, 2), // DeviceType.LAPTOP
    ...(input.sharedSecret ? [encodeStringField(13, input.sharedSecret)] : []),
    ...(input.chunked === false ? [] : [encodeVarintField(14, 1)]),
  ]
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
    modelBrowsingAvailable: false,
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
      result.modelBrowsingAvailable = true
      result.files.push(readLengthDelimited(buffer, cursor).toString('utf8'))
    } else if (field === 3 && wireType === 2) {
      result.modelBrowsingAvailable = true
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

export interface GrpcGenerationSignpost {
  phase:
    | 'text-encoded'
    | 'image-encoded'
    | 'sampling'
    | 'image-decoded'
    | 'second-pass-image-encoded'
    | 'second-pass-sampling'
    | 'second-pass-image-decoded'
    | 'face-restored'
    | 'image-upscaled'
    | 'unknown'
  step?: number
}

export interface ImageGenerationResponseDecoded {
  generatedImages: Buffer[]
  currentSignpost?: GrpcGenerationSignpost
  previewImage?: Buffer
  scaleFactor?: number
  downloadSize?: number | string
  chunkState: 'last' | 'more' | 'unknown'
}

function decodeSignpost(buffer: Buffer): GrpcGenerationSignpost {
  const phases: Record<number, GrpcGenerationSignpost['phase']> = {
    1: 'text-encoded',
    2: 'image-encoded',
    3: 'sampling',
    4: 'image-decoded',
    5: 'second-pass-image-encoded',
    6: 'second-pass-sampling',
    7: 'second-pass-image-decoded',
    8: 'face-restored',
    9: 'image-upscaled',
  }
  const cursor: Cursor = { offset: 0 }
  let result: GrpcGenerationSignpost = { phase: 'unknown' }
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor))
    const field = tag >>> 3
    const wireType = tag & 7
    if (wireType !== 2 || field < 1 || field > 9) {
      skipField(buffer, cursor, wireType)
      continue
    }
    const value = readLengthDelimited(buffer, cursor)
    result = { phase: phases[field] ?? 'unknown' }
    if (field === 3 || field === 6) {
      const samplingCursor: Cursor = { offset: 0 }
      while (samplingCursor.offset < value.length) {
        const samplingTag = Number(readVarint(value, samplingCursor))
        const samplingField = samplingTag >>> 3
        const samplingWireType = samplingTag & 7
        if (samplingField === 1 && samplingWireType === 0) {
          result.step = Number(readVarint(value, samplingCursor))
        } else {
          skipField(value, samplingCursor, samplingWireType)
        }
      }
    }
  }
  return result
}

export function decodeImageGenerationResponse(buffer: Buffer): ImageGenerationResponseDecoded {
  const result: ImageGenerationResponseDecoded = { generatedImages: [], chunkState: 'last' }
  const cursor: Cursor = { offset: 0 }
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor))
    const field = tag >>> 3
    const wireType = tag & 7
    if (field === 1 && wireType === 2) {
      result.generatedImages.push(Buffer.from(readLengthDelimited(buffer, cursor)))
    } else if (field === 2 && wireType === 2) {
      result.currentSignpost = decodeSignpost(readLengthDelimited(buffer, cursor))
    } else if (field === 4 && wireType === 2) {
      result.previewImage = Buffer.from(readLengthDelimited(buffer, cursor))
    } else if (field === 5 && wireType === 0) {
      result.scaleFactor = Number(readVarint(buffer, cursor))
    } else if (field === 7 && wireType === 0) {
      result.downloadSize = bigintToJson(readVarint(buffer, cursor))
    } else if (field === 8 && wireType === 0) {
      const state = Number(readVarint(buffer, cursor))
      result.chunkState = state === 0 ? 'last' : state === 1 ? 'more' : 'unknown'
    } else {
      skipField(buffer, cursor, wireType)
    }
  }
  return result
}

export class GrpcFrameDecoder {
  private readonly header = Buffer.allocUnsafe(5)
  private headerBytes = 0
  private compressed = 0
  private payload: Buffer | undefined
  private payloadBytes = 0

  constructor(
    private readonly encoding: string | undefined,
    private readonly maximumMessageBytes = 128 * 1024 * 1024,
  ) {}

  push(chunk: Buffer): Buffer[] {
    const frames: Buffer[] = []
    let offset = 0

    while (offset < chunk.length) {
      if (this.headerBytes < this.header.length) {
        const headerBytes = Math.min(this.header.length - this.headerBytes, chunk.length - offset)
        chunk.copy(this.header, this.headerBytes, offset, offset + headerBytes)
        this.headerBytes += headerBytes
        offset += headerBytes
        if (this.headerBytes < this.header.length) break

        this.compressed = this.header[0]!
        const length = this.header.readUInt32BE(1)
        if (length > this.maximumMessageBytes) {
          throw new BridgeError('GRPC_FRAME_ERROR', 'Oversized gRPC message.', 502)
        }
        this.payload = Buffer.allocUnsafe(length)
        this.payloadBytes = 0
        if (length === 0) {
          frames.push(decodeGrpcPayload(this.compressed, this.payload, this.encoding, this.maximumMessageBytes))
          this.resetFrame()
          continue
        }
      }

      const payload = this.payload
      if (!payload) throw new BridgeError('GRPC_FRAME_ERROR', 'Invalid gRPC decoder state.', 502)
      const payloadBytes = Math.min(payload.length - this.payloadBytes, chunk.length - offset)
      chunk.copy(payload, this.payloadBytes, offset, offset + payloadBytes)
      this.payloadBytes += payloadBytes
      offset += payloadBytes
      if (this.payloadBytes === payload.length) {
        frames.push(decodeGrpcPayload(this.compressed, payload, this.encoding, this.maximumMessageBytes))
        this.resetFrame()
      }
    }

    return frames
  }

  finish(): void {
    if (this.headerBytes !== 0 || this.payload !== undefined) {
      throw new BridgeError('GRPC_FRAME_ERROR', 'Draw Things ended with a truncated gRPC frame.', 502)
    }
  }

  private resetFrame(): void {
    this.headerBytes = 0
    this.compressed = 0
    this.payload = undefined
    this.payloadBytes = 0
  }
}

function decodeGrpcPayload(
  compressed: number,
  payload: Buffer,
  encoding: string | undefined,
  maximumMessageBytes: number,
): Buffer {
  if (compressed === 0) return payload
  if (compressed === 1 && encoding?.toLowerCase() === 'gzip') {
    return gunzipSync(payload, { maxOutputLength: maximumMessageBytes })
  }
  throw new BridgeError(
    'GRPC_COMPRESSION_UNSUPPORTED',
    `Unsupported gRPC compression encoding: ${encoding ?? 'missing'}.`,
    502,
  )
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
    frames.push(decodeGrpcPayload(compressed, payload, encoding, maximumMessageBytes))
  }
  return frames
}
