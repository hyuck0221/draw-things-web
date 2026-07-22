import { describe, expect, it } from 'vitest'
import { randomHex, randomUuid } from './ids'

describe('secure browser identifiers', () => {
  it('creates UUID v4 values without crypto.randomUUID', () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('creates a 256-bit hexadecimal pairing token', () => {
    expect(randomHex(32)).toMatch(/^[0-9a-f]{64}$/)
  })
})
