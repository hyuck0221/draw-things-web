import { describe, expect, it } from 'vitest'
import { shellQuote } from './shell'

describe('shellQuote', () => {
  it('keeps command substitutions and single quotes inert', () => {
    expect(shellQuote("token'$(touch /tmp/unsafe)`id`"))
      .toBe("'token'\"'\"'$(touch /tmp/unsafe)`id`'")
  })
})
