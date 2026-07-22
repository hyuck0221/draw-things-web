import { describe, expect, it } from 'vitest'
import type { WorkspaceSession } from '../domain/types'
import { composeEffectivePrompt } from './prompt'

const session: WorkspaceSession = {
  id: 'session',
  title: 'test',
  createdAt: 1,
  updatedAt: 1,
  items: [],
  selectedItemId: undefined,
  view: { x: 0, y: 0, zoom: 1 },
  continuationEnabled: true,
  turns: [
    {
      id: 'turn',
      role: 'user',
      content: '첫 장면',
      effectivePrompt: 'a quiet forest, cinematic light',
      createdAt: 1,
    },
  ],
}

describe('composeEffectivePrompt', () => {
  it('continues from the latest effective prompt', () => {
    expect(composeEffectivePrompt(session, 'add a red fox')).toBe(
      'a quiet forest, cinematic light, add a red fox',
    )
  })

  it('supports an explicit context reset with !', () => {
    expect(composeEffectivePrompt(session, '!a blue ocean')).toBe('a blue ocean')
  })

  it('does not continue when disabled', () => {
    expect(composeEffectivePrompt(session, 'new image', false)).toBe('new image')
  })

  it('skips failed and cancelled requests when continuing context', () => {
    const withFailedTurns: WorkspaceSession = {
      ...session,
      turns: [
        ...session.turns,
        { id: 'failed-user', role: 'user', content: 'failed', effectivePrompt: 'failed context', createdAt: 2, requestId: 'failed' },
        { id: 'failed-assistant', role: 'assistant', content: 'error', createdAt: 2, requestId: 'failed', status: 'error' },
        { id: 'cancelled-user', role: 'user', content: 'cancelled', effectivePrompt: 'cancelled context', createdAt: 3, requestId: 'cancelled' },
        { id: 'cancelled-assistant', role: 'assistant', content: 'cancelled', createdAt: 3, requestId: 'cancelled', status: 'cancelled' },
      ],
    }

    expect(composeEffectivePrompt(withFailedTurns, 'add rain')).toBe(
      'a quiet forest, cinematic light, add rain',
    )
  })
})
