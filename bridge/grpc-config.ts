import { randomBytes } from 'node:crypto'
import { Builder, type Offset } from 'flatbuffers'
import { BridgeError } from './types.ts'

const CONFIG_FIELD_COUNT = 88
const MAX_DIMENSION = 4_096
const MAX_TOTAL_PIXELS = 64 * 1024 * 1024
const MAX_TOTAL_FRAME_PIXELS = 256 * 1024 * 1024
const MAX_LORAS = 64
const MAX_CONTROLS = 32
const MAX_TARGET_BLOCKS = 128

const SAMPLERS = [
  'DPM++ 2M Karras', 'Euler a', 'DDIM', 'PLMS', 'DPM++ SDE Karras', 'UniPC', 'LCM',
  'Euler A Substep', 'DPM++ SDE Substep', 'TCD', 'Euler A Trailing',
  'DPM++ SDE Trailing', 'DPM++ 2M AYS', 'Euler A AYS', 'DPM++ SDE AYS',
  'DPM++ 2M Trailing', 'DDIM Trailing', 'UniPC Trailing', 'UniPC AYS', 'TCD Trailing',
] as const

const SEED_MODES = ['Legacy', 'Torch CPU Compatible', 'Scale Alike', 'NVIDIA GPU Compatible'] as const
const CONTROL_MODES = new Map([
  ['balanced', 0],
  ['prompt', 1],
  ['control', 2],
])
const CONTROL_INPUT_TYPES = new Map([
  ['', 0], ['unspecified', 0], ['custom', 1], ['depth', 2], ['canny', 3], ['scribble', 4],
  ['pose', 5], ['normalbae', 6], ['color', 7], ['lineart', 8], ['softedge', 9],
  ['seg', 10], ['inpaint', 11], ['ip2p', 12], ['shuffle', 13], ['mlsd', 14],
  ['tile', 15], ['blur', 16], ['lowquality', 17], ['gray', 18],
])
const LORA_MODES = new Map([['all', 0], ['base', 1], ['refiner', 2]])
const COMPRESSION_METHODS = new Map([['disabled', 0], ['h264', 1], ['h265', 2], ['jpeg', 3]])
const COLOR_CALIBRATIONS = new Map([['none', 0], ['disabled', 0], ['lab', 1]])

type Parameters = Record<string, unknown>

function finiteNumber(
  parameters: Parameters,
  key: string,
  fallback: number,
  minimum = -Number.MAX_VALUE,
  maximum = Number.MAX_VALUE,
): number {
  const raw = parameters[key]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function integer(
  parameters: Parameters,
  key: string,
  fallback: number,
  minimum = -2_147_483_648,
  maximum = 2_147_483_647,
): number {
  const value = finiteNumber(parameters, key, fallback, minimum, maximum)
  if (!Number.isInteger(value)) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be an integer.`)
  }
  return value
}

function bool(parameters: Parameters, key: string, fallback: boolean): boolean {
  const value = parameters[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be a boolean.`)
  }
  return value
}

function optionalString(parameters: Parameters, key: string, maximum = 4_096): string | undefined {
  const value = parameters[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be a string.`)
  }
  const normalized = value.trim()
  if (!normalized) return undefined
  if (Buffer.byteLength(normalized, 'utf8') > maximum) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} is too long.`)
  }
  return normalized
}

function requiredString(parameters: Parameters, key: string): string {
  const value = optionalString(parameters, key)
  if (!value) throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} is required for gRPC generation.`)
  return value
}

function enumValue(
  parameters: Parameters,
  key: string,
  values: readonly string[],
  fallback: string,
): number {
  const raw = parameters[key] ?? fallback
  if (typeof raw !== 'string') {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be a string.`)
  }
  const index = values.indexOf(raw)
  if (index < 0) throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} is not supported by Draw Things gRPC.`)
  return index
}

function mappedEnum(
  parameters: Parameters,
  key: string,
  values: ReadonlyMap<string, number>,
  fallback: string,
): number {
  const raw = parameters[key] ?? fallback
  if (typeof raw !== 'string') {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be a string.`)
  }
  const value = values.get(raw.trim().toLowerCase())
  if (value === undefined) throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} is not supported by Draw Things gRPC.`)
  return value
}

function pixelBlocks(parameters: Parameters, key: string, fallback: number): number {
  const pixels = integer(parameters, key, fallback, 64, MAX_DIMENSION)
  if (pixels % 64 !== 0) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be divisible by 64 for Draw Things gRPC.`)
  }
  return pixels / 64
}

function objectArray(parameters: Parameters, key: string, maximum: number): Parameters[] {
  const raw = parameters[key]
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > maximum || raw.some((value) => value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', `${key} must be an array with at most ${maximum} objects.`)
  }
  return raw as Parameters[]
}

function offsetVector(builder: Builder, offsets: Offset[]): Offset {
  builder.startVector(4, offsets.length, 4)
  for (let index = offsets.length - 1; index >= 0; index -= 1) builder.addOffset(offsets[index]!)
  return builder.endVector()
}

function stringVector(builder: Builder, values: string[]): Offset {
  return offsetVector(builder, values.map((value) => builder.createString(value)))
}

function buildLora(builder: Builder, value: Parameters): Offset | undefined {
  const file = optionalString(value, 'file')
  if (!file) return undefined
  const fileOffset = builder.createString(file)
  const mode = value.mode === undefined || value.mode === null || value.mode === ''
    ? 0
    : mappedEnum(value, 'mode', LORA_MODES, 'all')
  const weight = finiteNumber(value, 'weight', 0.6, -10, 10)
  builder.startObject(3)
  builder.addFieldOffset(0, fileOffset, 0)
  builder.addFieldFloat32(1, weight, 0.6)
  builder.addFieldInt8(2, mode, 0)
  return builder.endObject()
}

function buildControl(builder: Builder, value: Parameters): Offset | undefined {
  const file = optionalString(value, 'file')
  if (!file) return undefined
  const targetBlocksRaw = value.targetBlocks ?? []
  if (!Array.isArray(targetBlocksRaw) || targetBlocksRaw.length > MAX_TARGET_BLOCKS
    || targetBlocksRaw.some((block) => typeof block !== 'string' || !block.trim()
      || Buffer.byteLength(block.trim(), 'utf8') > 4_096)) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', 'control targetBlocks must be a bounded string array.')
  }
  const targetBlocks = stringVector(builder, targetBlocksRaw.map((block) => String(block).trim()))
  const fileOffset = builder.createString(file)
  const weight = finiteNumber(value, 'weight', 1, -10, 10)
  const guidanceStart = finiteNumber(value, 'guidanceStart', 0, 0, 1)
  const guidanceEnd = finiteNumber(value, 'guidanceEnd', 1, 0, 1)
  if (guidanceStart > guidanceEnd) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', 'control guidanceStart cannot exceed guidanceEnd.')
  }
  const noPrompt = bool(value, 'noPrompt', false)
  const globalAveragePooling = bool(value, 'globalAveragePooling', true)
  const downSamplingRate = finiteNumber(value, 'downSamplingRate', 1, 0.01, 64)
  const controlMode = mappedEnum(value, 'controlImportance', CONTROL_MODES, 'balanced')
  const inputOverride = mappedEnum(value, 'inputOverride', CONTROL_INPUT_TYPES, 'unspecified')
  builder.startObject(10)
  builder.addFieldOffset(0, fileOffset, 0)
  builder.addFieldFloat32(1, weight, 1)
  builder.addFieldFloat32(2, guidanceStart, 0)
  builder.addFieldFloat32(3, guidanceEnd, 1)
  builder.addFieldInt8(4, Number(noPrompt), 0)
  builder.addFieldInt8(5, Number(globalAveragePooling), 1)
  builder.addFieldFloat32(6, downSamplingRate, 1)
  builder.addFieldInt8(7, controlMode, 0)
  builder.addFieldOffset(8, targetBlocks, 0)
  builder.addFieldInt8(9, inputOverride, 0)
  return builder.endObject()
}

function randomSeed(): number {
  return randomBytes(4).readUInt32LE(0)
}

/** Encodes Draw Things v1.20260716.0 GenerationConfiguration (config.fbs). */
export function encodeGenerationConfiguration(parameters: Parameters): Buffer {
  const width = integer(parameters, 'width', 1024, 64, MAX_DIMENSION)
  const height = integer(parameters, 'height', 1024, 64, MAX_DIMENSION)
  if (width % 64 !== 0 || height % 64 !== 0) {
    throw new BridgeError('INVALID_GRPC_PARAMETER', 'width and height must be divisible by 64 for Draw Things gRPC.')
  }
  const batchCount = integer(parameters, 'batch_count', 1, 1, 100)
  const batchSize = integer(parameters, 'batch_size', 1, 1, 4)
  const numFrames = integer(parameters, 'num_frames', 14, 1, 201)
  if (width * height * batchCount * batchSize > MAX_TOTAL_PIXELS) {
    throw new BridgeError('GRPC_GENERATION_TOO_LARGE', 'Requested gRPC image pixels exceed the connector safety limit.', 413)
  }
  if (width * height * batchCount * batchSize * numFrames > MAX_TOTAL_FRAME_PIXELS) {
    throw new BridgeError('GRPC_GENERATION_TOO_LARGE', 'Requested gRPC image/video frame pixels exceed the connector safety limit.', 413)
  }
  const seedInput = integer(parameters, 'seed', -1, -1, 4_294_967_295)
  const seed = seedInput < 0 ? randomSeed() : seedInput
  const model = requiredString(parameters, 'model')
  const faceRestoration = optionalString(parameters, 'face_restoration')

  const builder = new Builder(2_048)
  const modelOffset = builder.createString(model)
  const upscalerOffset = optionalString(parameters, 'upscaler')
  const refinerOffset = optionalString(parameters, 'refiner_model')
  const faceOffset = faceRestoration
  const nameOffset = optionalString(parameters, 'name')
  const clipLTextOffset = optionalString(parameters, 'clip_l_text', 1024 * 1024)
  const openClipGTextOffset = optionalString(parameters, 'open_clip_g_text', 1024 * 1024)
  const t5TextOffset = optionalString(parameters, 't5_text', 1024 * 1024)
  const stringOffsets = {
    upscaler: upscalerOffset ? builder.createString(upscalerOffset) : 0,
    refiner: refinerOffset ? builder.createString(refinerOffset) : 0,
    face: faceOffset ? builder.createString(faceOffset) : 0,
    name: nameOffset ? builder.createString(nameOffset) : 0,
    clipL: clipLTextOffset ? builder.createString(clipLTextOffset) : 0,
    openClipG: openClipGTextOffset ? builder.createString(openClipGTextOffset) : 0,
    t5: t5TextOffset ? builder.createString(t5TextOffset) : 0,
  }
  const controlOffsets = objectArray(parameters, 'controls', MAX_CONTROLS)
    .map((value) => buildControl(builder, value)).filter((value): value is Offset => value !== undefined)
  const loraOffsets = objectArray(parameters, 'loras', MAX_LORAS)
    .map((value) => buildLora(builder, value)).filter((value): value is Offset => value !== undefined)
  const controls = offsetVector(builder, controlOffsets)
  const loras = offsetVector(builder, loraOffsets)

  const causalInferenceInput = integer(parameters, 'causal_inference', 0, 0, 1_000)
  const causalInferenceEnabled = bool(parameters, 'causal_inference_enabled', causalInferenceInput > 0)
  const causalInference = causalInferenceInput > 0 ? causalInferenceInput : 3

  builder.startObject(CONFIG_FIELD_COUNT)
  builder.addFieldInt64(0, BigInt(integer(parameters, 'configuration_id', 0, 0, Number.MAX_SAFE_INTEGER)), 0n)
  builder.addFieldInt16(1, width / 64, 0)
  builder.addFieldInt16(2, height / 64, 0)
  builder.addFieldInt32(3, seed, 0)
  builder.addFieldInt32(4, integer(parameters, 'steps', 16, 1, 1_000), 0)
  builder.addFieldFloat32(5, finiteNumber(parameters, 'guidance_scale', 5, 0, 100), 0)
  builder.addFieldFloat32(6, finiteNumber(parameters, 'strength', 1, 0, 1), 0)
  builder.addFieldOffset(7, modelOffset, 0)
  builder.addFieldInt8(8, enumValue(parameters, 'sampler', SAMPLERS, 'DPM++ 2M AYS'), 0)
  builder.addFieldInt32(9, batchCount, 1)
  builder.addFieldInt32(10, batchSize, 1)
  builder.addFieldInt8(11, Number(bool(parameters, 'hires_fix', false)), 0)
  builder.addFieldInt16(12, pixelBlocks(parameters, 'hires_fix_width', width), 0)
  builder.addFieldInt16(13, pixelBlocks(parameters, 'hires_fix_height', height), 0)
  builder.addFieldFloat32(14, finiteNumber(parameters, 'hires_fix_strength', 0.7, 0, 1), 0.7)
  builder.addFieldOffset(15, stringOffsets.upscaler, 0)
  builder.addFieldFloat32(16, finiteNumber(parameters, 'image_guidance', 1.5, 0, 100), 1.5)
  builder.addFieldInt8(17, enumValue(parameters, 'seed_mode', SEED_MODES, 'Scale Alike'), 0)
  builder.addFieldInt32(18, integer(parameters, 'clip_skip', 2, 1, 100), 1)
  builder.addFieldOffset(19, controls, 0)
  builder.addFieldOffset(20, loras, 0)
  builder.addFieldFloat32(21, finiteNumber(parameters, 'mask_blur', 2.5, 0, 100), 0)
  builder.addFieldOffset(22, stringOffsets.face, 0)
  // Slots 23 and 24 are deprecated decode_with_attention flags and intentionally retain schema defaults.
  builder.addFieldFloat32(25, finiteNumber(parameters, 'clip_weight', 1, 0, 1), 1)
  builder.addFieldInt8(26, Number(bool(parameters, 'negative_prompt_for_image_prior', true)), 1)
  builder.addFieldInt32(27, integer(parameters, 'image_prior_steps', 5, 1, 1_000), 5)
  builder.addFieldOffset(28, stringOffsets.refiner, 0)
  builder.addFieldInt32(29, integer(parameters, 'original_height', height, 1, MAX_DIMENSION), 0)
  builder.addFieldInt32(30, integer(parameters, 'original_width', width, 1, MAX_DIMENSION), 0)
  builder.addFieldInt32(31, integer(parameters, 'crop_top', 0, -MAX_DIMENSION, MAX_DIMENSION), 0)
  builder.addFieldInt32(32, integer(parameters, 'crop_left', 0, -MAX_DIMENSION, MAX_DIMENSION), 0)
  builder.addFieldInt32(33, integer(parameters, 'target_height', height, 1, MAX_DIMENSION), 0)
  builder.addFieldInt32(34, integer(parameters, 'target_width', width, 1, MAX_DIMENSION), 0)
  builder.addFieldFloat32(35, finiteNumber(parameters, 'aesthetic_score', 6, -100, 100), 6)
  builder.addFieldFloat32(36, finiteNumber(parameters, 'negative_aesthetic_score', 2.5, -100, 100), 2.5)
  builder.addFieldInt8(37, Number(bool(parameters, 'zero_negative_prompt', true)), 0)
  builder.addFieldFloat32(38, finiteNumber(parameters, 'refiner_start', 0.7, 0, 1), 0.7)
  builder.addFieldInt32(39, integer(parameters, 'negative_original_height', 512, 1, MAX_DIMENSION), 0)
  builder.addFieldInt32(40, integer(parameters, 'negative_original_width', 512, 1, MAX_DIMENSION), 0)
  builder.addFieldOffset(41, stringOffsets.name, 0)
  builder.addFieldInt32(42, integer(parameters, 'fps', 5, 1, 240), 5)
  builder.addFieldInt32(43, integer(parameters, 'motion_scale', 127, 0, 1_000), 127)
  builder.addFieldFloat32(44, finiteNumber(parameters, 'guiding_frame_noise', 0.02, 0, 1), 0.02)
  builder.addFieldFloat32(45, finiteNumber(parameters, 'start_frame_guidance', 1, 0, 100), 1)
  builder.addFieldInt32(46, numFrames, 14)
  builder.addFieldInt32(47, integer(parameters, 'mask_blur_outset', 0, -MAX_DIMENSION, MAX_DIMENSION), 0)
  builder.addFieldFloat32(48, finiteNumber(parameters, 'sharpness', 0, 0, 100), 0)
  builder.addFieldFloat32(49, finiteNumber(parameters, 'shift', 1, 0, 100), 1)
  builder.addFieldInt32(50, integer(parameters, 'stage_2_steps', 10, 1, 1_000), 10)
  builder.addFieldFloat32(51, finiteNumber(parameters, 'stage_2_guidance', 1, 0, 100), 1)
  builder.addFieldFloat32(52, finiteNumber(parameters, 'stage_2_shift', 1, 0, 100), 1)
  builder.addFieldInt8(53, Number(bool(parameters, 'tiled_decoding', false)), 0)
  builder.addFieldInt16(54, pixelBlocks(parameters, 'decoding_tile_width', 640), 10)
  builder.addFieldInt16(55, pixelBlocks(parameters, 'decoding_tile_height', 640), 10)
  builder.addFieldInt16(56, pixelBlocks(parameters, 'decoding_tile_overlap', 128), 2)
  builder.addFieldFloat32(57, finiteNumber(parameters, 'stochastic_sampling_gamma', 0.3, 0, 1), 0.3)
  builder.addFieldInt8(58, Number(bool(parameters, 'preserve_original_after_inpaint', true)), 1)
  builder.addFieldInt8(59, Number(bool(parameters, 'tiled_diffusion', false)), 0)
  builder.addFieldInt16(60, pixelBlocks(parameters, 'diffusion_tile_width', 1024), 16)
  builder.addFieldInt16(61, pixelBlocks(parameters, 'diffusion_tile_height', 1024), 16)
  builder.addFieldInt16(62, pixelBlocks(parameters, 'diffusion_tile_overlap', 128), 2)
  builder.addFieldInt8(63, integer(parameters, 'upscaler_scale', 0, 0, 255), 0)
  builder.addFieldInt8(64, Number(bool(parameters, 't5_text_encoder_decoding', true)), 1)
  builder.addFieldInt8(65, Number(bool(parameters, 'separate_clip_l', false)), 0)
  builder.addFieldOffset(66, stringOffsets.clipL, 0)
  builder.addFieldInt8(67, Number(bool(parameters, 'separate_open_clip_g', false)), 0)
  builder.addFieldOffset(68, stringOffsets.openClipG, 0)
  builder.addFieldInt8(69, Number(bool(parameters, 'speed_up_with_guidance_embed', true)), 1)
  builder.addFieldFloat32(70, finiteNumber(parameters, 'guidance_embed', 3.5, 0, 100), 3.5)
  builder.addFieldInt8(71, Number(bool(parameters, 'resolution_dependent_shift', true)), 1)
  builder.addFieldInt32(72, integer(parameters, 'tea_cache_start', 5, 0, 10_000), 5)
  builder.addFieldInt32(73, integer(parameters, 'tea_cache_end', -1, -1, 10_000), -1)
  builder.addFieldFloat32(74, finiteNumber(parameters, 'tea_cache_threshold', 0.06, 0, 1), 0.06)
  builder.addFieldInt8(75, Number(bool(parameters, 'tea_cache', false)), 0)
  builder.addFieldInt8(76, Number(bool(parameters, 'separate_t5', false)), 0)
  builder.addFieldOffset(77, stringOffsets.t5, 0)
  builder.addFieldInt32(78, integer(parameters, 'tea_cache_max_skip_steps', 3, 1, 10_000), 3)
  builder.addFieldInt8(79, Number(causalInferenceEnabled), 0)
  builder.addFieldInt32(80, causalInference, 3)
  builder.addFieldInt32(81, integer(parameters, 'causal_inference_pad', 0, 0, 10_000), 0)
  builder.addFieldInt8(82, Number(bool(parameters, 'cfg_zero_star', false)), 0)
  builder.addFieldInt32(83, integer(parameters, 'cfg_zero_init_steps', 0, 0, 10_000), 0)
  builder.addFieldInt8(84, mappedEnum(parameters, 'compression_artifacts', COMPRESSION_METHODS, 'disabled'), 0)
  builder.addFieldFloat32(85, finiteNumber(parameters, 'compression_artifacts_quality', 43.1, 0, 100), 43.1)
  builder.addFieldInt8(86, mappedEnum(parameters, 'color_calibration', COLOR_CALIBRATIONS, 'none'), 0)
  builder.addFieldInt8(87, Number(bool(parameters, 'expand_prompt_to_json', false)), 0)
  const root = builder.endObject()
  builder.finish(root)
  return Buffer.from(builder.asUint8Array())
}
