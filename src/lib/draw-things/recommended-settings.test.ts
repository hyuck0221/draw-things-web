import { describe, expect, it } from 'vitest'
import type { DrawThingsModel } from '../../domain/types'
import { PARAMETER_DEFINITIONS } from './parameters'
import {
  applyRecommendedSettings,
  didModelTypeChange,
  readRecommendedSettings,
  recommendedModelPrefix,
  resolveRecommendedSettings,
} from './recommended-settings'

const model = (overrides: Partial<DrawThingsModel> = {}): DrawThingsModel => ({
  file: 'selected_model_q8p.ckpt',
  version: 'architecture-v1',
  defaultScale: 16,
  ...overrides,
})

const specification = (
  name: string,
  configuration: Record<string, unknown>,
  version = 'architecture-v1',
) => ({ name, version, configuration })

describe('Draw Things recommended settings resolver', () => {
  it('normalizes the same quantization suffixes as the native resolver', () => {
    expect(recommendedModelPrefix('model_name_q8p.ckpt')).toBe('model_name')
    expect(recommendedModelPrefix('model_name_q5p_svd.ckpt')).toBe('model_name')
    expect(recommendedModelPrefix('model_name_i8x.ckpt')).toBe('model_name')
  })

  it('prefers exact model, then normalized prefix, parent prefix, and version', () => {
    const configs = [
      specification('Version', { model: 'unrelated.ckpt', steps: 40 }),
      specification('Parent', { model: 'selected_q5p.ckpt', steps: 30 }),
      specification('Normalized', { model: 'selected_model_f16.ckpt', steps: 20 }),
      specification('Exact', { model: 'selected_model_q8p.ckpt', steps: 10 }),
    ]

    expect(resolveRecommendedSettings(model(), configs)).toMatchObject({
      profileName: 'Exact',
      match: 'exact',
      parameters: { model: 'selected_model_q8p.ckpt', steps: 10 },
    })
    expect(resolveRecommendedSettings(model({ file: 'selected_model_q6p.ckpt' }), configs)).toMatchObject({
      profileName: 'Normalized',
      match: 'normalized-prefix',
    })
    expect(resolveRecommendedSettings(model({ file: 'selected_extra_q6p.ckpt' }), configs)).toMatchObject({
      profileName: 'Parent',
      match: 'parent-prefix',
    })
    expect(resolveRecommendedSettings(model({ file: 'other.ckpt' }), configs)).toMatchObject({
      profileName: 'Version',
      match: 'version',
    })
  })

  it('uses a matching LoRA profile before the plain exact profile like Draw Things', () => {
    const configs = [
      specification('Plain', { model: 'selected_model_q8p.ckpt', steps: 20, loras: [] }),
      specification('Turbo', {
        model: 'selected_model_q8p.ckpt',
        steps: 4,
        loras: [{ file: 'turbo_lora.ckpt', weight: 1, mode: 'all', ignored: 'drop-me' }],
      }),
    ]

    expect(resolveRecommendedSettings(model(), configs)?.profileName).toBe('Plain')
    const turbo = resolveRecommendedSettings(model(), configs, ['turbo_lora.ckpt'])
    expect(turbo).toMatchObject({ profileName: 'Turbo', parameters: { steps: 4 } })
    expect(turbo?.parameters.loras).toEqual([{ file: 'turbo_lora.ckpt', weight: 1, mode: 'all' }])
  })

  it('maps only explicit JS configuration keys to validated UI snake_case parameters', () => {
    const resolved = resolveRecommendedSettings(model(), [specification('Safe profile', {
      model: 'selected_model_q8p.ckpt',
      width: 1024,
      height: 1024,
      guidanceScale: 4.5,
      imageGuidanceScale: 1.5,
      sampler: 10,
      seedMode: 2,
      t5TextEncoder: true,
      upscalerScaleFactor: 0,
      teaCacheEnd: -1,
      originalImageWidth: 0,
      prototypePollution: 'blocked',
      arbitrary_snake_case: 123,
      stage2Steps: 999,
    })])

    expect(resolved?.parameters).toMatchObject({
      model: 'selected_model_q8p.ckpt',
      width: 1024,
      height: 1024,
      guidance_scale: 4.5,
      image_guidance: 1.5,
      sampler: 'Euler A Trailing',
      seed_mode: 'Scale Alike',
      t5_text_encoder_decoding: true,
      upscaler_scale: 0,
      stage_2_steps: 999,
    })
    expect(resolved?.parameters).not.toHaveProperty('guidanceScale')
    expect(resolved?.parameters).not.toHaveProperty('prototypePollution')
    expect(resolved?.parameters).not.toHaveProperty('arbitrary_snake_case')
    expect(resolved?.parameters).not.toHaveProperty('tea_cache_end')
    expect(resolved?.parameters).not.toHaveProperty('original_width')

    const allowed = new Set(PARAMETER_DEFINITIONS.map((definition) => definition.key))
    expect(Object.keys(resolved?.parameters ?? {}).every((key) => allowed.has(key))).toBe(true)
  })

  it('drops invalid enums, ranges, and non-finite values from a corrupted cache', () => {
    const resolved = resolveRecommendedSettings(model(), [specification('Corrupt', {
      model: 'selected_model_q8p.ckpt',
      width: 9,
      steps: 1.5,
      sampler: 999,
      seedMode: -1,
      guidanceScale: Number.POSITIVE_INFINITY,
      teaCache: 'yes',
    })])

    expect(resolved?.parameters).toEqual({
      model: 'selected_model_q8p.ckpt',
    })
  })

  it('returns no recommendation when configs.json has no usable match', () => {
    expect(resolveRecommendedSettings(model({ version: undefined }), [])).toBeUndefined()
    expect(resolveRecommendedSettings(model({ version: undefined }), [
      specification('Other', { model: 'other.ckpt', steps: 10 }, 'other-version'),
    ])).toBeUndefined()
  })

  it('offers native-style recommendations only when the model architecture changes', () => {
    expect(didModelTypeChange(
      model({ file: 'first.ckpt', version: 'flux1' }),
      model({ file: 'second.ckpt', version: 'flux1' }),
    )).toBe(false)
    expect(didModelTypeChange(
      model({ file: 'first.ckpt', version: 'sdxl_base_v0.9' }),
      model({ file: 'second.ckpt', version: 'flux1' }),
    )).toBe(true)
    expect(didModelTypeChange(
      model({ file: 'unknown-a.ckpt', version: undefined }),
      model({ file: 'known.ckpt', version: 'flux1' }),
    )).toBe(true)
    expect(didModelTypeChange(
      model({ file: 'unknown-a.ckpt', version: undefined }),
      model({ file: 'unknown-b.ckpt', version: undefined }),
    )).toBe(false)
    expect(didModelTypeChange(undefined, model())).toBe(true)
  })

  it('resets from native defaults while preserving size and seed before the profile overlay', () => {
    const recommendation = resolveRecommendedSettings(model(), [specification('Recommended', {
      model: 'selected_model_q8p.ckpt',
      width: 768,
      steps: 8,
      sampler: 10,
    })])
    expect(recommendation).toBeDefined()

    const applied = applyRecommendedSettings(
      { width: 640, height: 896, seed: 42, steps: 99, guidance_scale: 12, loras: [{ file: 'old.ckpt' }] },
      { width: 1024, height: 1024, seed: -1, original_width: 1024, original_height: 1024 },
      recommendation!,
    )

    // The profile's explicit width wins after the current dimensions are preserved.
    expect(applied.width).toBe(768)
    expect(applied.height).toBe(896)
    expect(applied.seed).toBe(42)
    expect(applied.steps).toBe(8)
    expect(applied.guidance_scale).toBe(4.5)
    expect(applied.sampler).toBe('Euler A Trailing')
    expect(applied.loras).toEqual([])
    expect(applied.original_width).toBe(1024)
    expect(applied.model).toBe('selected_model_q8p.ckpt')
  })

  it('revalidates bridge metadata before the frontend applies it', () => {
    const selected = model({
      recommendedSettings: {
        schemaVersion: 1,
        profileName: 'Tampered profile',
        match: 'version',
        source: 'local-config-cache',
        parameters: {
          model: 'wrong.ckpt',
          steps: 12,
          sampler: 'not-a-sampler',
          unknown_option: true,
        },
      },
    })

    expect(readRecommendedSettings(selected)).toEqual({
      schemaVersion: 1,
      profileName: 'Tampered profile',
      match: 'version',
      source: 'local-config-cache',
      parameters: { model: 'selected_model_q8p.ckpt', steps: 12 },
    })
  })
})
