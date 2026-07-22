import { deflateSync } from 'node:zlib'
import { decompressFpzip } from './fpzip.ts'
import { BridgeError } from './types.ts'

const TENSOR_HEADER_BYTES = 68
const FPZIP_IDENTIFIER = 0x0f_7217
const CCV_32F = 0x04_000
const CCV_64F = 0x10_000
const CCV_16F = 0x20_000
const MAX_IMAGE_DIMENSION = 4_096
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024
// The safety boundary is payload-sized; retain space for the serialized NNC header.
const MAX_TENSOR_BYTES = 128 * 1024 * 1024 + TENSOR_HEADER_BYTES

export interface DrawThingsTensorImage {
  width: number
  height: number
  channels: number
  rgb: Buffer
  alpha?: Buffer
}

function float16ToNumber(value: number): number {
  const sign = (value & 0x8000) ? -1 : 1
  const exponent = (value >>> 10) & 0x1f
  const fraction = value & 0x03ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 0x1f) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

function byteFromNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.trunc((value + 1) * 127.5)))
}

function byteFromPositiveRange(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value * 255)))
}

function tensorDimensions(tensor: Buffer) {
  if (tensor.length < TENSOR_HEADER_BYTES || tensor.length > MAX_TENSOR_BYTES) {
    throw new BridgeError('INVALID_DRAW_THINGS_TENSOR', 'Draw Things returned an invalid tensor size.', 502)
  }
  const batch = tensor.readUInt32LE(20)
  const height = tensor.readUInt32LE(24)
  const width = tensor.readUInt32LE(28)
  const channels = tensor.readUInt32LE(32)
  if (batch !== 1 || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS || (channels !== 3 && channels !== 4)) {
    throw new BridgeError(
      'INVALID_DRAW_THINGS_TENSOR',
      'Draw Things returned unsupported tensor dimensions; expected NHWC [1, height, width, 3|4].',
      502,
    )
  }
  return { width, height, channels, elements: width * height * channels }
}

export async function decodeDrawThingsTensor(tensor: Buffer): Promise<DrawThingsTensorImage> {
  const { width, height, channels, elements } = tensorDimensions(tensor)
  const identifier = tensor.readUInt32LE(0)
  const dataType = tensor.readUInt32LE(12)
  const payload = tensor.subarray(TENSOR_HEADER_BYTES)
  const rgb = Buffer.allocUnsafe(width * height * 3)
  const alpha = channels === 4 ? Buffer.allocUnsafe(width * height) : undefined

  let values: Float32Array | Float64Array | undefined
  if (identifier === FPZIP_IDENTIFIER) {
    values = await decompressFpzip(payload, elements)
  } else if (identifier !== 0) {
    throw new BridgeError(
      'UNSUPPORTED_DRAW_THINGS_TENSOR_CODEC',
      `Draw Things returned unsupported tensor codec 0x${identifier.toString(16)}.`,
      502,
    )
  }

  const expectedRawBytes = dataType === CCV_16F
    ? elements * 2
    : dataType === CCV_32F ? elements * 4 : dataType === CCV_64F ? elements * 8 : -1
  if (expectedRawBytes < 0) {
    throw new BridgeError(
      'UNSUPPORTED_DRAW_THINGS_TENSOR_TYPE',
      `Draw Things returned unsupported tensor data type 0x${dataType.toString(16)}.`,
      502,
    )
  }
  if (!values && payload.length !== expectedRawBytes) {
    throw new BridgeError('INVALID_DRAW_THINGS_TENSOR', 'Draw Things tensor payload length does not match its shape.', 502)
  }

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const input = pixel * channels
    const output = pixel * 3
    const colorChannelStart = channels - 3
    if (alpha) {
      const value = values
        ? values[input]!
        : dataType === CCV_16F
          ? float16ToNumber(payload.readUInt16LE(input * 2))
          : dataType === CCV_32F
            ? payload.readFloatLE(input * 4)
            : payload.readDoubleLE(input * 8)
      alpha[pixel] = byteFromPositiveRange(value)
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const index = input + colorChannelStart + channel
      const value = values
        ? values[index]!
        : dataType === CCV_16F
          ? float16ToNumber(payload.readUInt16LE(index * 2))
          : dataType === CCV_32F
            ? payload.readFloatLE(index * 4)
            : payload.readDoubleLE(index * 8)
      rgb[output + channel] = byteFromNormalized(value)
    }
  }
  return { width, height, channels, rgb, ...(alpha ? { alpha } : {}) }
}

let crcTable: Uint32Array | undefined

function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let index = 0; index < 256; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1
      crcTable[index] = value >>> 0
    }
  }
  let crc = 0xffff_ffff
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffff_ffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const chunk = Buffer.allocUnsafe(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length)
  return chunk
}

export function encodeRgbPng(image: DrawThingsTensorImage): Buffer {
  const { width, height, rgb, alpha } = image
  if (rgb.length !== width * height * 3) {
    throw new BridgeError('INVALID_RGB_IMAGE', 'RGB byte length does not match image dimensions.', 500)
  }
  if (alpha && alpha.length !== width * height) {
    throw new BridgeError('INVALID_RGB_IMAGE', 'Alpha byte length does not match image dimensions.', 500)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = alpha ? 6 : 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const channels = alpha ? 4 : 3
  const stride = width * channels
  const scanlines = Buffer.allocUnsafe((stride + 1) * height)
  for (let row = 0; row < height; row += 1) {
    const output = row * (stride + 1)
    scanlines[output] = 0
    if (!alpha) {
      rgb.copy(scanlines, output + 1, row * width * 3, (row + 1) * width * 3)
      continue
    }
    for (let column = 0; column < width; column += 1) {
      const pixel = row * width + column
      const source = pixel * 3
      const target = output + 1 + column * 4
      scanlines[target] = rgb[source]!
      scanlines[target + 1] = rgb[source + 1]!
      scanlines[target + 2] = rgb[source + 2]!
      scanlines[target + 3] = alpha[pixel]!
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export async function drawThingsTensorToPng(tensor: Buffer): Promise<Buffer> {
  return encodeRgbPng(await decodeDrawThingsTensor(tensor))
}
