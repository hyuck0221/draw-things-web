import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMETERS } from '../defaults'
import { PARAMETER_DEFINITIONS, sanitizeHttpParameters } from './parameters'

describe('Draw Things parameter catalog', () => {
  it('tracks every parameter exposed by allParameters()', () => {
    expect(PARAMETER_DEFINITIONS).toHaveLength(84)
    expect(new Set(PARAMETER_DEFINITIONS.map((item) => item.key)).size).toBe(84)
  })

  it('omits upstream HTTP keys that currently always return 422', () => {
    const safe = sanitizeHttpParameters(DEFAULT_PARAMETERS)
    expect(safe).not.toHaveProperty('compression_artifacts')
    expect(safe).not.toHaveProperty('compression_artifacts_quality')
    expect(safe).not.toHaveProperty('color_calibration')
    expect(safe).not.toHaveProperty('expand_prompt_to_json')
    expect(safe).not.toHaveProperty('tea_cache_end')
  })
})
