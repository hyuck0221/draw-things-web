import type { DrawThingsModel, GenerationParameters, ParameterValue } from '../../domain/types'
import { PARAMETER_DEFINITIONS, SAMPLERS, SEED_MODES } from './parameters'

export type RecommendedSettingsMatch = 'exact' | 'normalized-prefix' | 'parent-prefix' | 'version'

export interface RecommendedSettings {
  schemaVersion: 1
  profileName: string
  profileVersion?: string
  configurationModel?: string
  match: RecommendedSettingsMatch
  source: 'local-config-cache'
  parameters: GenerationParameters
}

interface ConfigurationSpecification {
  name: string
  version?: string
  configuration: Record<string, unknown>
}

interface MatchCandidate {
  specification: ConfigurationSpecification
  match: RecommendedSettingsMatch
}

const MODEL_SUFFIXES = new Set(['f16', 'svd', 'q5p', 'q6p', 'q8p', 'i8x'])

// JSGenerationConfiguration uses camelCase while the HTTP API and this UI use
// command-line-style snake_case names. Keep this explicit: unknown cache keys
// must never become request parameters merely because their spelling looks safe.
const JS_TO_HTTP_PARAMETER = {
  width: 'width',
  height: 'height',
  seed: 'seed',
  steps: 'steps',
  guidanceScale: 'guidance_scale',
  strength: 'strength',
  sampler: 'sampler',
  hiresFix: 'hires_fix',
  hiresFixWidth: 'hires_fix_width',
  hiresFixHeight: 'hires_fix_height',
  hiresFixStrength: 'hires_fix_strength',
  tiledDecoding: 'tiled_decoding',
  decodingTileWidth: 'decoding_tile_width',
  decodingTileHeight: 'decoding_tile_height',
  decodingTileOverlap: 'decoding_tile_overlap',
  tiledDiffusion: 'tiled_diffusion',
  diffusionTileWidth: 'diffusion_tile_width',
  diffusionTileHeight: 'diffusion_tile_height',
  diffusionTileOverlap: 'diffusion_tile_overlap',
  upscaler: 'upscaler',
  upscalerScaleFactor: 'upscaler_scale',
  imageGuidanceScale: 'image_guidance',
  seedMode: 'seed_mode',
  clipSkip: 'clip_skip',
  controls: 'controls',
  loras: 'loras',
  maskBlur: 'mask_blur',
  maskBlurOutset: 'mask_blur_outset',
  sharpness: 'sharpness',
  clipWeight: 'clip_weight',
  negativePromptForImagePrior: 'negative_prompt_for_image_prior',
  imagePriorSteps: 'image_prior_steps',
  refinerModel: 'refiner_model',
  originalImageHeight: 'original_height',
  originalImageWidth: 'original_width',
  cropTop: 'crop_top',
  cropLeft: 'crop_left',
  targetImageHeight: 'target_height',
  targetImageWidth: 'target_width',
  aestheticScore: 'aesthetic_score',
  negativeAestheticScore: 'negative_aesthetic_score',
  zeroNegativePrompt: 'zero_negative_prompt',
  refinerStart: 'refiner_start',
  negativeOriginalImageHeight: 'negative_original_height',
  negativeOriginalImageWidth: 'negative_original_width',
  batchCount: 'batch_count',
  batchSize: 'batch_size',
  numFrames: 'num_frames',
  fps: 'fps',
  motionScale: 'motion_scale',
  guidingFrameNoise: 'guiding_frame_noise',
  startFrameGuidance: 'start_frame_guidance',
  shift: 'shift',
  stage2Steps: 'stage_2_steps',
  stage2Guidance: 'stage_2_guidance',
  stage2Shift: 'stage_2_shift',
  stochasticSamplingGamma: 'stochastic_sampling_gamma',
  preserveOriginalAfterInpaint: 'preserve_original_after_inpaint',
  t5TextEncoder: 't5_text_encoder_decoding',
  separateClipL: 'separate_clip_l',
  clipLText: 'clip_l_text',
  separateOpenClipG: 'separate_open_clip_g',
  openClipGText: 'open_clip_g_text',
  speedUpWithGuidanceEmbed: 'speed_up_with_guidance_embed',
  guidanceEmbed: 'guidance_embed',
  resolutionDependentShift: 'resolution_dependent_shift',
  teaCache: 'tea_cache',
  teaCacheStart: 'tea_cache_start',
  teaCacheEnd: 'tea_cache_end',
  teaCacheThreshold: 'tea_cache_threshold',
  teaCacheMaxSkipSteps: 'tea_cache_max_skip_steps',
  separateT5: 'separate_t5',
  t5Text: 't5_text',
  causalInference: 'causal_inference',
  causalInferencePad: 'causal_inference_pad',
  cfgZeroStar: 'cfg_zero_star',
  cfgZeroInitSteps: 'cfg_zero_init_steps',
  compressionArtifacts: 'compression_artifacts',
  compressionArtifactsQuality: 'compression_artifacts_quality',
  colorCalibration: 'color_calibration',
  expandPromptToJson: 'expand_prompt_to_json',
  faceRestoration: 'face_restoration',
} as const

const DEFINITION_BY_KEY = new Map(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition]))
const RECOMMENDATION_MATCHES = new Set<RecommendedSettingsMatch>([
  'exact',
  'normalized-prefix',
  'parent-prefix',
  'version',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseSpecifications(values: readonly unknown[]): ConfigurationSpecification[] {
  const specifications: ConfigurationSpecification[] = []
  for (const value of values) {
    if (!isPlainRecord(value) || !isPlainRecord(value.configuration)) continue
    const name = optionalString(value.name)
    if (!name) continue
    specifications.push({
      name,
      ...(optionalString(value.version) ? { version: optionalString(value.version) } : {}),
      configuration: value.configuration,
    })
  }
  return specifications
}

export function recommendedModelPrefix(model: string) {
  const dot = model.lastIndexOf('.')
  const stem = dot > 0 ? model.slice(0, dot) : ''
  if (!stem) return ''
  const components = stem.split('_')
  while (components.length > 0 && MODEL_SUFFIXES.has(components.at(-1) ?? '')) components.pop()
  return components.join('_')
}

function configuredLoRAs(specification: ConfigurationSpecification) {
  const value = specification.configuration.loras
  if (!Array.isArray(value)) return new Set<string>()
  return new Set(value.flatMap((item) => {
    if (!isPlainRecord(item)) return []
    const file = optionalString(item.file)
    return file ? [file] : []
  }))
}

function supportsLoRAs(specification: ConfigurationSpecification, loras: ReadonlySet<string>) {
  if (loras.size === 0) return true
  const configured = configuredLoRAs(specification)
  return [...loras].every((file) => configured.has(file))
}

function matchPair(
  configurations: readonly ConfigurationSpecification[],
  loras: ReadonlySet<string>,
  first: { match: RecommendedSettingsMatch; predicate: (value: ConfigurationSpecification) => boolean },
  second?: { match: RecommendedSettingsMatch; predicate: (value: ConfigurationSpecification) => boolean },
): MatchCandidate | undefined {
  const find = (
    candidate: typeof first,
    requireLoRAs: boolean,
  ): MatchCandidate | undefined => {
    const specification = configurations.find((value) => (
      candidate.predicate(value) && (!requireLoRAs || supportsLoRAs(value, loras))
    ))
    return specification ? { specification, match: candidate.match } : undefined
  }
  if (loras.size === 0) return find(first, false) ?? (second ? find(second, false) : undefined)
  return find(first, true)
    ?? (second ? find(second, true) : undefined)
    ?? find(first, false)
    ?? (second ? find(second, false) : undefined)
}

function matchingConfiguration(
  model: DrawThingsModel,
  specifications: readonly ConfigurationSpecification[],
  selectedLoRAs: readonly string[],
): MatchCandidate | undefined {
  const prefix = recommendedModelPrefix(model.file)
  const loras = new Set(selectedLoRAs.map((file) => file.trim()).filter(Boolean))
  const configurationModel = (value: ConfigurationSpecification) => optionalString(value.configuration.model)

  const direct = matchPair(
    specifications,
    loras,
    { match: 'exact', predicate: (value) => configurationModel(value) === model.file },
    {
      match: 'normalized-prefix',
      predicate: (value) => {
        const candidate = configurationModel(value)
        return Boolean(candidate && prefix && recommendedModelPrefix(candidate) === prefix)
      },
    },
  )
  if (direct) return direct

  const parent = matchPair(specifications, loras, {
    match: 'parent-prefix',
    predicate: (value) => {
      const candidate = configurationModel(value)
      const candidatePrefix = candidate ? recommendedModelPrefix(candidate) : ''
      return Boolean(prefix && candidatePrefix && prefix.startsWith(`${candidatePrefix}_`))
    },
  })
  if (parent) return parent

  const version = optionalString(model.version)
  if (!version) return undefined
  return matchPair(specifications, loras, {
    match: 'version',
    predicate: (value) => value.version === version,
  })
}

function safeLoRAs(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined
  const result: Array<Record<string, unknown>> = []
  for (const item of value) {
    if (!isPlainRecord(item)) return undefined
    const file = item.file === null ? null : optionalString(item.file)
    const weight = Number(item.weight)
    const mode = item.mode === null ? null : optionalString(item.mode)
    if (item.file !== null && !file) return undefined
    if (!Number.isFinite(weight)) return undefined
    if (mode !== null && mode !== undefined && !['all', 'base', 'refiner'].includes(mode)) return undefined
    result.push({ file, weight, ...(mode === undefined ? {} : { mode }) })
  }
  return result
}

function safeControls(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined
  const result: Array<Record<string, unknown>> = []
  for (const item of value) {
    if (!isPlainRecord(item)) return undefined
    const file = item.file === null ? null : optionalString(item.file)
    const weight = Number(item.weight)
    const guidanceStart = Number(item.guidanceStart)
    const guidanceEnd = Number(item.guidanceEnd)
    const downSamplingRate = Number(item.downSamplingRate)
    const controlImportance = optionalString(item.controlImportance)
    const inputOverride = optionalString(item.inputOverride) ?? ''
    const targetBlocks = item.targetBlocks
    if (item.file !== null && !file) return undefined
    if (![weight, guidanceStart, guidanceEnd, downSamplingRate].every(Number.isFinite)) return undefined
    if (typeof item.noPrompt !== 'boolean' || typeof item.globalAveragePooling !== 'boolean') return undefined
    if (!controlImportance || !['balanced', 'prompt', 'control'].includes(controlImportance)) return undefined
    if (!Array.isArray(targetBlocks) || !targetBlocks.every((block) => typeof block === 'string')) return undefined
    result.push({
      file,
      weight,
      guidanceStart,
      guidanceEnd,
      noPrompt: item.noPrompt,
      globalAveragePooling: item.globalAveragePooling,
      downSamplingRate,
      controlImportance,
      inputOverride,
      targetBlocks: [...targetBlocks],
    })
  }
  return result
}

function safeParameterValue(key: string, value: unknown): ParameterValue | undefined {
  const definition = DEFINITION_BY_KEY.get(key)
  if (!definition) return undefined
  if (definition.kind === 'string') return typeof value === 'string' ? value : undefined
  if (definition.kind === 'bool') return typeof value === 'boolean' ? value : undefined
  if (definition.kind === 'loras') return safeLoRAs(value)
  if (definition.kind === 'controls') return safeControls(value)
  if (definition.kind === 'enum') {
    return typeof value === 'string' && definition.enumValues?.includes(value) ? value : undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (definition.kind === 'int' && !Number.isInteger(value)) return undefined
  if (definition.min !== undefined && value < definition.min) return undefined
  if (definition.max !== undefined && value > definition.max) return undefined
  return value
}

function convertJSValue(jsKey: keyof typeof JS_TO_HTTP_PARAMETER, value: unknown) {
  if (jsKey === 'sampler' && typeof value === 'number' && Number.isInteger(value)) return SAMPLERS[value]
  if (jsKey === 'seedMode' && typeof value === 'number' && Number.isInteger(value)) return SEED_MODES[value]
  return value
}

function normalizeConfiguration(
  configuration: Record<string, unknown>,
  model: DrawThingsModel,
): GenerationParameters {
  const parameters: GenerationParameters = { model: model.file }
  for (const [jsKey, httpKey] of Object.entries(JS_TO_HTTP_PARAMETER) as Array<[
    keyof typeof JS_TO_HTTP_PARAMETER,
    (typeof JS_TO_HTTP_PARAMETER)[keyof typeof JS_TO_HTTP_PARAMETER],
  ]>) {
    if (!(jsKey in configuration)) continue
    const safe = safeParameterValue(httpKey, convertJSValue(jsKey, configuration[jsKey]))
    if (safe !== undefined) parameters[httpKey] = safe
  }
  // A profile is often shared by quantized variants. Never let its original
  // checkpoint name replace the model the user actually selected.
  parameters.model = model.file
  return parameters
}

export function resolveRecommendedSettings(
  model: DrawThingsModel,
  rawSpecifications: readonly unknown[],
  selectedLoRAs: readonly string[] = [],
): RecommendedSettings | undefined {
  if (!optionalString(model.file)) return undefined
  const matched = matchingConfiguration(model, parseSpecifications(rawSpecifications), selectedLoRAs)
  if (!matched) return undefined
  const configurationModel = optionalString(matched.specification.configuration.model)
  return {
    schemaVersion: 1,
    profileName: matched.specification.name,
    ...(matched.specification.version ? { profileVersion: matched.specification.version } : {}),
    ...(configurationModel ? { configurationModel } : {}),
    match: matched.match,
    source: 'local-config-cache',
    parameters: normalizeConfiguration(matched.specification.configuration, model),
  }
}

export function didModelTypeChange(previous: DrawThingsModel | undefined, next: DrawThingsModel) {
  if (previous?.file === next.file) return false
  // SettingsWorkflow treats a nil previous model as a type change. Unknown
  // ModelZoo specifications have the same Stable Diffusion v1 fallback used by
  // ModelZoo.versionForModel.
  if (!previous) return true
  return (optionalString(previous.version) ?? 'v1') !== (optionalString(next.version) ?? 'v1')
}

const NATIVE_RESET_DEFAULTS: GenerationParameters = {
  steps: 20,
  guidance_scale: 4.5,
  strength: 1,
  sampler: 'UniPC AYS',
  batch_count: 1,
  batch_size: 1,
  hires_fix: false,
  hires_fix_width: 448,
  hires_fix_height: 448,
  hires_fix_strength: 0.7,
  image_guidance: 1.5,
  seed_mode: 'Scale Alike',
  clip_skip: 1,
  controls: [],
  loras: [],
  mask_blur: 1.5,
  mask_blur_outset: 0,
  sharpness: 0,
  clip_weight: 1,
  negative_prompt_for_image_prior: true,
  image_prior_steps: 5,
  refiner_model: '',
  crop_top: 0,
  crop_left: 0,
  aesthetic_score: 6,
  negative_aesthetic_score: 2.5,
  zero_negative_prompt: false,
  refiner_start: 0.85,
  num_frames: 14,
  fps: 5,
  motion_scale: 127,
  guiding_frame_noise: 0.02,
  start_frame_guidance: 1,
  shift: 1,
  stage_2_guidance: 1,
  stage_2_shift: 1,
  tiled_decoding: false,
  decoding_tile_width: 640,
  decoding_tile_height: 640,
  decoding_tile_overlap: 128,
  stochastic_sampling_gamma: 0.3,
  preserve_original_after_inpaint: true,
  tiled_diffusion: false,
  diffusion_tile_width: 1024,
  diffusion_tile_height: 1024,
  diffusion_tile_overlap: 128,
  upscaler: '',
  upscaler_scale: 0,
  t5_text_encoder_decoding: true,
  separate_clip_l: false,
  clip_l_text: '',
  separate_open_clip_g: false,
  open_clip_g_text: '',
  speed_up_with_guidance_embed: true,
  guidance_embed: 3.5,
  resolution_dependent_shift: true,
  tea_cache_start: 5,
  tea_cache_end: -1,
  tea_cache_threshold: 0.06,
  tea_cache_max_skip_steps: 3,
  tea_cache: false,
  separate_t5: false,
  t5_text: '',
  causal_inference: 0,
  causal_inference_pad: 0,
  cfg_zero_star: false,
  cfg_zero_init_steps: 0,
  compression_artifacts: 'disabled',
  compression_artifacts_quality: 43.1,
  color_calibration: 'none',
  expand_prompt_to_json: false,
  restore_faces: false,
}

export function applyRecommendedSettings(
  current: GenerationParameters,
  httpSafeDefaults: GenerationParameters,
  recommendation: RecommendedSettings,
): GenerationParameters {
  // Native SettingsWorkflow starts from GenerationConfiguration.default, but
  // explicitly preserves the current canvas size and seed before overlaying the
  // selected community profile. HTTP-invalid zero defaults use this app's safe
  // defaults until a profile supplies a valid value.
  return {
    ...httpSafeDefaults,
    ...NATIVE_RESET_DEFAULTS,
    width: current.width ?? httpSafeDefaults.width ?? 512,
    height: current.height ?? httpSafeDefaults.height ?? 512,
    seed: current.seed ?? httpSafeDefaults.seed ?? -1,
    ...recommendation.parameters,
    model: String(recommendation.parameters.model ?? ''),
  }
}

export function readRecommendedSettings(model: DrawThingsModel): RecommendedSettings | undefined {
  const value = model.recommendedSettings
  if (!isPlainRecord(value) || value.schemaVersion !== 1 || value.source !== 'local-config-cache') return undefined
  const profileName = optionalString(value.profileName)
  const match = value.match
  if (!profileName || typeof match !== 'string' || !RECOMMENDATION_MATCHES.has(match as RecommendedSettingsMatch)) return undefined
  if (!isPlainRecord(value.parameters)) return undefined
  const parameters: GenerationParameters = { model: model.file }
  for (const [key, raw] of Object.entries(value.parameters)) {
    if (key === 'model') continue
    const safe = safeParameterValue(key, raw)
    if (safe !== undefined) parameters[key] = safe
  }
  return {
    schemaVersion: 1,
    profileName,
    ...(optionalString(value.profileVersion) ? { profileVersion: optionalString(value.profileVersion) } : {}),
    ...(optionalString(value.configurationModel) ? { configurationModel: optionalString(value.configurationModel) } : {}),
    match: match as RecommendedSettingsMatch,
    source: 'local-config-cache',
    parameters,
  }
}
