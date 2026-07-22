import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMETERS } from '../defaults'
import {
  PARAMETER_DEFINITIONS,
  isParameterVisible,
  parameterMaximum,
  parameterReadOnlyReason,
  sanitizeHttpParameters,
} from './parameters'

describe('Draw Things parameter catalog', () => {
  it('tracks the complete HTTP catalog plus native gRPC-only controls', () => {
    expect(PARAMETER_DEFINITIONS).toHaveLength(86)
    expect(new Set(PARAMETER_DEFINITIONS.map((item) => item.key)).size).toBe(86)
  })

  it('omits upstream HTTP keys that currently always return 422', () => {
    const safe = sanitizeHttpParameters(DEFAULT_PARAMETERS)
    expect(safe).not.toHaveProperty('compression_artifacts')
    expect(safe).not.toHaveProperty('compression_artifacts_quality')
    expect(safe).not.toHaveProperty('color_calibration')
    expect(safe).not.toHaveProperty('expand_prompt_to_json')
    expect(safe).not.toHaveProperty('tea_cache_end')
    expect(safe).not.toHaveProperty('upscaler')
    expect(safe).not.toHaveProperty('stage_2_steps')
    expect(safe).not.toHaveProperty('face_restoration')
  })

  it('shows and unlocks protocol-specific native gRPC parameters', () => {
    const stage2Steps = PARAMETER_DEFINITIONS.find((item) => item.key === 'stage_2_steps')!
    const restoreFaces = PARAMETER_DEFINITIONS.find((item) => item.key === 'restore_faces')!
    const controls = PARAMETER_DEFINITIONS.find((item) => item.key === 'controls')!
    const width = PARAMETER_DEFINITIONS.find((item) => item.key === 'width')!
    const compression = PARAMETER_DEFINITIONS.find((item) => item.key === 'compression_artifacts')!

    expect(isParameterVisible(stage2Steps, DEFAULT_PARAMETERS, 'txt2img', 'http')).toBe(false)
    expect(isParameterVisible(stage2Steps, DEFAULT_PARAMETERS, 'txt2img', 'grpc')).toBe(true)
    expect(isParameterVisible(restoreFaces, DEFAULT_PARAMETERS, 'txt2img', 'grpc')).toBe(false)
    expect(isParameterVisible(controls, DEFAULT_PARAMETERS, 'txt2img', 'grpc')).toBe(false)
    expect(parameterMaximum(width, 'http')).toBe(8_192)
    expect(parameterMaximum(width, 'grpc')).toBe(4_096)
    expect(parameterReadOnlyReason(compression, 'http')).toContain('422')
    expect(parameterReadOnlyReason(compression, 'grpc')).toBeUndefined()
  })

  it('keeps an explicitly selected upscaler', () => {
    const safe = sanitizeHttpParameters({
      ...DEFAULT_PARAMETERS,
      upscaler: 'realesrgan_x2.ckpt',
      upscaler_scale: 2,
    })
    expect(safe).toMatchObject({
      upscaler: 'realesrgan_x2.ckpt',
      upscaler_scale: 2,
    })
  })
})
