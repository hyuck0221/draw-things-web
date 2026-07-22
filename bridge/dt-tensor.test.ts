import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeDrawThingsTensor, drawThingsTensorToPng } from './dt-tensor.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

const CCV_16F = 0x20_000
const FPZIP_IDENTIFIER = 0x0f_7217

function tensorHeader(identifier = 0, channels = 3): Buffer {
  const header = Buffer.alloc(68)
  header.writeUInt32LE(identifier, 0)
  header.writeUInt32LE(1, 4) // CPU tensor
  header.writeUInt32LE(2, 8) // NHWC
  header.writeUInt32LE(CCV_16F, 12)
  header.writeUInt32LE(1, 20)
  header.writeUInt32LE(1, 24)
  header.writeUInt32LE(2, 28)
  header.writeUInt32LE(channels, 32)
  return header
}

function rawFloat16Tensor(): Buffer {
  const values = Buffer.alloc(12)
  ;[0xbc00, 0x0000, 0x3c00, 0xb800, 0x3800, 0x3400]
    .forEach((value, index) => values.writeUInt16LE(value, index * 2))
  return Buffer.concat([tensorHeader(), values])
}

function rawArgbFloat16Tensor(): Buffer {
  const values = Buffer.alloc(16)
  ;[
    0x3c00, 0xbc00, 0x0000, 0x3c00,
    0x3800, 0xb800, 0x3800, 0x3400,
  ].forEach((value, index) => values.writeUInt16LE(value, index * 2))
  return Buffer.concat([tensorHeader(0, 4), values])
}

function pngScanlines(png: Buffer): Buffer {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const idat: Buffer[] = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  return inflateSync(Buffer.concat(idat))
}

describe('Draw Things NNC tensor conversion', () => {
  it('maps the official [-1, 1] Float16 RGB range to browser PNG bytes', async () => {
    const tensor = rawFloat16Tensor()
    const image = await decodeDrawThingsTensor(tensor)
    expect(image).toMatchObject({ width: 2, height: 1, channels: 3 })
    expect([...image.rgb]).toEqual([0, 127, 255, 63, 191, 159])

    const png = await drawThingsTensorToPng(tensor)
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(1)
    expect([...pngScanlines(png)]).toEqual([0, 0, 127, 255, 63, 191, 159])
  })

  it('decodes the FPZIP response-compression format without an npm runtime dependency', async () => {
    const fpzip = Buffer.from(
      'ZnB5KYcO8RHtAv0AAAH+AAAA/wAAAP8AE4TCvYDPmdGoLFM48Q0AAA==',
      'base64',
    )
    const tensor = Buffer.concat([tensorHeader(FPZIP_IDENTIFIER), fpzip])
    const image = await decodeDrawThingsTensor(tensor)
    expect([...image.rgb]).toEqual([0, 127, 255, 63, 191, 159])
  })

  it('maps Draw Things ARGB tensors to RGBA PNG without shifting alpha into RGB', async () => {
    const tensor = rawArgbFloat16Tensor()
    const image = await decodeDrawThingsTensor(tensor)
    expect(image).toMatchObject({ width: 2, height: 1, channels: 4 })
    expect([...image.rgb]).toEqual([0, 127, 255, 63, 191, 159])
    expect([...(image.alpha ?? [])]).toEqual([255, 128])

    const png = await drawThingsTensorToPng(tensor)
    expect(png[25]).toBe(6)
    expect([...pngScanlines(png)]).toEqual([0, 0, 127, 255, 255, 63, 191, 159, 128])
  })

  it('rejects unknown codecs and mismatched raw payloads', async () => {
    await expect(decodeDrawThingsTensor(Buffer.alloc(3))).rejects.toMatchObject({
      code: 'INVALID_DRAW_THINGS_TENSOR',
    })
    const unknown = tensorHeader(0x123456)
    await expect(decodeDrawThingsTensor(unknown)).rejects.toMatchObject({
      code: 'UNSUPPORTED_DRAW_THINGS_TENSOR_CODEC',
    })
    await expect(decodeDrawThingsTensor(tensorHeader())).rejects.toMatchObject({
      code: 'INVALID_DRAW_THINGS_TENSOR',
    })
  })
})
