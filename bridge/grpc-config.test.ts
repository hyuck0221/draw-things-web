import { describe, expect, it } from 'vitest'
import { encodeGenerationConfiguration } from './grpc-config.ts'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

function rootTable(buffer: Buffer): number {
  return buffer.readUInt32LE(0)
}

function tableField(buffer: Buffer, table: number, slot: number): number {
  const vtable = table - buffer.readInt32LE(table)
  const vtableBytes = buffer.readUInt16LE(vtable)
  const entry = vtable + 4 + slot * 2
  if (entry + 2 > vtable + vtableBytes) return 0
  const offset = buffer.readUInt16LE(entry)
  return offset === 0 ? 0 : table + offset
}

function stringField(buffer: Buffer, table: number, slot: number): string | undefined {
  const field = tableField(buffer, table, slot)
  if (!field) return undefined
  const string = field + buffer.readUInt32LE(field)
  const length = buffer.readUInt32LE(string)
  return buffer.subarray(string + 4, string + 4 + length).toString('utf8')
}

describe('Draw Things GenerationConfiguration FlatBuffer', () => {
  it('encodes the official 88-slot schema including the latest post-processing fields', () => {
    const encoded = encodeGenerationConfiguration({
      model: 'flux_dev_f16.ckpt',
      width: 768,
      height: 512,
      seed: 4_000_000_000,
      steps: 24,
      sampler: 'DPM++ SDE AYS',
      stage_2_steps: 17,
      compression_artifacts: 'jpeg',
      compression_artifacts_quality: 77.5,
      color_calibration: 'lab',
      expand_prompt_to_json: true,
      causal_inference: 7,
      causal_inference_pad: 2,
    })
    const table = rootTable(encoded)

    expect(encoded.readUInt16LE(tableField(encoded, table, 1))).toBe(12)
    expect(encoded.readUInt16LE(tableField(encoded, table, 2))).toBe(8)
    expect(encoded.readUInt32LE(tableField(encoded, table, 3))).toBe(4_000_000_000)
    expect(encoded.readUInt32LE(tableField(encoded, table, 4))).toBe(24)
    expect(stringField(encoded, table, 7)).toBe('flux_dev_f16.ckpt')
    expect(encoded.readUInt8(tableField(encoded, table, 8))).toBe(14)
    expect(encoded.readUInt32LE(tableField(encoded, table, 50))).toBe(17)
    expect(encoded.readUInt8(tableField(encoded, table, 79))).toBe(1)
    expect(encoded.readInt32LE(tableField(encoded, table, 80))).toBe(7)
    expect(encoded.readInt32LE(tableField(encoded, table, 81))).toBe(2)
    expect(encoded.readUInt8(tableField(encoded, table, 84))).toBe(3)
    expect(encoded.readFloatLE(tableField(encoded, table, 85))).toBeCloseTo(77.5)
    expect(encoded.readUInt8(tableField(encoded, table, 86))).toBe(1)
    expect(encoded.readUInt8(tableField(encoded, table, 87))).toBe(1)
  })

  it('omits empty optional model names and accepts the frontend ControlNet defaults', () => {
    const encoded = encodeGenerationConfiguration({
      model: 'model.ckpt',
      width: 512,
      height: 512,
      upscaler: '   ',
      loras: [{ file: 'style_lora_f16.ckpt', weight: 0.6, mode: null }],
      controls: [{
        file: 'control_v11p_sd15_canny_f16.ckpt',
        weight: 1,
        guidanceStart: 0,
        guidanceEnd: 1,
        noPrompt: false,
        globalAveragePooling: true,
        downSamplingRate: 1,
        controlImportance: 'balanced',
        inputOverride: '',
        targetBlocks: [],
      }],
    })
    const table = rootTable(encoded)
    expect(tableField(encoded, table, 15)).toBe(0)
    expect(tableField(encoded, table, 19)).not.toBe(0)
    expect(tableField(encoded, table, 20)).not.toBe(0)
  })

  it('rejects unsafe dimensions and pixel totals while ignoring HTTP-only face restoration state', () => {
    expect(() => encodeGenerationConfiguration({ model: 'model.ckpt', width: 513, height: 512 }))
      .toThrow(/divisible by 64/)
    expect(() => encodeGenerationConfiguration({
      model: 'model.ckpt', width: 4096, height: 4096, batch_count: 5, batch_size: 1,
    })).toThrow(/safety limit/)
    expect(() => encodeGenerationConfiguration({
      model: 'video_model.ckpt', width: 2048, height: 2048, num_frames: 201,
    })).toThrow(/frame pixels exceed/)
    expect(() => encodeGenerationConfiguration({
      model: 'video_model.ckpt', width: 512, height: 512, num_frames: 1_000,
    })).toThrow(/num_frames must be between 1 and 201/)
    const hiddenHttpState = encodeGenerationConfiguration({
      model: 'model.ckpt', width: 512, height: 512, restore_faces: true,
    })
    expect(tableField(hiddenHttpState, rootTable(hiddenHttpState), 22)).toBe(0)
    expect(() => encodeGenerationConfiguration({
      model: 'model.ckpt',
      width: 512,
      height: 512,
      controls: [{ file: 'control.ckpt', targetBlocks: ['x'.repeat(4_097)] }],
    })).toThrow(/targetBlocks/)
  })
})
