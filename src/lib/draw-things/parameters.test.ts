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
  it('tracks the supported HTTP parameter catalog', () => {
    expect(PARAMETER_DEFINITIONS).toHaveLength(84)
    expect(new Set(PARAMETER_DEFINITIONS.map((item) => item.key)).size).toBe(84)
    expect(PARAMETER_DEFINITIONS.map((item) => item.key)).not.toContain('stage_2_steps')
    expect(PARAMETER_DEFINITIONS.map((item) => item.key)).not.toContain('face_restoration')
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

  it('uses the Draw Things HTTP visibility, limits, and read-only rules', () => {
    const strength = PARAMETER_DEFINITIONS.find((item) => item.key === 'strength')!
    const width = PARAMETER_DEFINITIONS.find((item) => item.key === 'width')!
    const compression = PARAMETER_DEFINITIONS.find((item) => item.key === 'compression_artifacts')!

    expect(isParameterVisible(strength, DEFAULT_PARAMETERS, 'txt2img')).toBe(false)
    expect(isParameterVisible(strength, DEFAULT_PARAMETERS, 'img2img')).toBe(true)
    expect(parameterMaximum(width)).toBe(8_192)
    expect(parameterReadOnlyReason(compression)).toContain('422')
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

  it('omits an upscaler containing only whitespace', () => {
    const safe = sanitizeHttpParameters({ upscaler: '\t  ', upscaler_scale: 0 })
    expect(safe).not.toHaveProperty('upscaler')
    expect(safe).toHaveProperty('upscaler_scale', 0)
  })
})
