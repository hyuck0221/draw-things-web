import { CloudOff, HardDrive, MessageSquareText, Network, Settings2, Sparkles } from 'lucide-react'
import type { ConnectionPhase, ConnectionTestResult } from '../domain/types'
import { IconButton, StatusDot } from './ui'

interface TopBarProps {
  sessionTitle: string
  storageError?: string | null
  phase: ConnectionPhase
  result: ConnectionTestResult | null
  generating: boolean
  onOpenConnection: () => void
  onOpenConversation: () => void
}

function statusCopy(phase: ConnectionPhase, result: ConnectionTestResult | null, generating: boolean) {
  if (generating) return { label: '생성 중', mobileLabel: '생성 중', state: 'busy' as const }
  if (phase === 'online') {
    const canGenerate = Boolean(result?.capabilities.canGenerate)
    const needsSecret = Boolean(result?.capabilities.sharedSecretRequired)
    const needsHttp = Boolean(result?.capabilities.requiresHttpModeForCanvas)
    const blockedLabel = needsSecret
      ? { label: '연결됨 · 공유 비밀 필요', mobileLabel: '비밀 필요' }
      : needsHttp
        ? { label: '연결됨 · HTTP 필요', mobileLabel: 'HTTP 필요' }
        : { label: '연결됨 · 생성 설정 필요', mobileLabel: '설정 필요' }
    return {
      label: canGenerate ? 'Draw Things 연결됨' : blockedLabel.label,
      mobileLabel: canGenerate ? '연결됨' : blockedLabel.mobileLabel,
      state: canGenerate ? 'online' as const : 'warning' as const,
    }
  }
  if (phase === 'connecting' || phase === 'requesting-permission') {
    return { label: '연결 확인 중', mobileLabel: '확인 중', state: 'busy' as const }
  }
  if (phase === 'degraded') return { label: '연결 불안정', mobileLabel: '불안정', state: 'warning' as const }
  if (phase === 'permission-denied') return { label: '로컬 네트워크 권한 필요', mobileLabel: '권한 필요', state: 'warning' as const }
  if (phase === 'cors-or-tls-blocked') return { label: '브라우저가 연결 차단', mobileLabel: '차단됨', state: 'warning' as const }
  if (phase === 'api-mismatch') return { label: 'API 설정 불일치', mobileLabel: '설정 확인', state: 'warning' as const }
  return { label: '연결 안 됨', mobileLabel: '연결 안 됨', state: 'offline' as const }
}

export function TopBar({ sessionTitle, storageError, phase, result, generating, onOpenConnection, onOpenConversation }: TopBarProps) {
  const status = statusCopy(phase, result, generating)
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand__mark"><Sparkles size={18} /></span>
        <span><strong>Draw Things</strong><small>LOCAL CANVAS</small></span>
      </div>
      <div className="top-bar__session"><span>{sessionTitle}</span><small className={storageError ? 'is-error' : ''} title={storageError ?? undefined}>{storageError ? '저장 오류' : '로컬 자동 저장'}</small></div>
      <div className="top-bar__actions">
        <span className="local-only-badge"><HardDrive size={13} /> 로컬 전용</span>
        <IconButton label="세션 대화 열기" onClick={onOpenConversation}><MessageSquareText size={18} /></IconButton>
        <button
          type="button"
          className={`connection-pill connection-pill--${status.state}`}
          aria-label={`연결 상태: ${status.label}. 연결 설정 열기`}
          title={status.label}
          onClick={onOpenConnection}
        >
          <StatusDot state={status.state} />
          <span className="connection-pill__label connection-pill__label--full">{status.label}</span>
          <span className="connection-pill__label connection-pill__label--mobile" aria-hidden="true">{status.mobileLabel}</span>
          {phase === 'online' ? <Network size={14} /> : <CloudOff size={14} />}
        </button>
        <IconButton label="연결 설정" onClick={onOpenConnection}><Settings2 size={18} /></IconButton>
      </div>
    </header>
  )
}
