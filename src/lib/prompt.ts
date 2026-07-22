import type { WorkspaceSession } from '../domain/types'

export function latestEffectivePrompt(session: WorkspaceSession) {
  const completedRequests = new Set(session.turns
    .filter((turn) => turn.role === 'assistant' && turn.status === 'complete' && turn.requestId)
    .map((turn) => turn.requestId))
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index]
    if (turn?.role === 'user' && turn.effectivePrompt && (!turn.requestId || completedRequests.has(turn.requestId))) {
      return turn.effectivePrompt
    }
  }
  return ''
}

export function composeEffectivePrompt(
  session: WorkspaceSession,
  prompt: string,
  continueContext = session.continuationEnabled,
) {
  const next = prompt.trim()
  if (!continueContext || !next) return next
  if (next.startsWith('!')) return next.slice(1).trim()
  const previous = latestEffectivePrompt(session).trim()
  if (!previous || next.toLocaleLowerCase().includes(previous.toLocaleLowerCase())) return next
  return `${previous}, ${next}`
}
