import { ChevronLeft, ChevronRight, Images, MessageSquareText, Plus, Trash2 } from 'lucide-react'
import type { WorkspaceSession } from '../domain/types'
import { IconButton } from './ui'

interface SessionRailProps {
  sessions: WorkspaceSession[]
  activeId: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onCreate: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}
function relativeTime(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return new Intl.DateTimeFormat('ko', { month: 'short', day: 'numeric' }).format(timestamp)
}

export function SessionRail({ sessions, activeId, collapsed, onCollapsedChange, onCreate, onSelect, onDelete }: SessionRailProps) {
  return (
    <aside className={`session-rail ${collapsed ? 'is-collapsed' : ''}`}>
      <header>
        {!collapsed ? <span>세션</span> : null}
        <IconButton label={collapsed ? '세션 패널 열기' : '세션 패널 접기'} onClick={() => onCollapsedChange(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </IconButton>
      </header>
      <button className="new-session" type="button" onClick={onCreate} title="새 캔버스">
        <Plus size={17} />{!collapsed ? <span>새 캔버스</span> : null}
      </button>
      <nav aria-label="캔버스 세션">
        {sessions.map((session) => {
          const preview = session.items.at(-1)?.dataUrl
          return (
            <div className={`session-entry ${activeId === session.id ? 'is-active' : ''}`} key={session.id}>
              <button type="button" onClick={() => onSelect(session.id)} title={session.title}>
                <span className="session-entry__preview">{preview ? <img src={preview} alt="" /> : <MessageSquareText size={17} />}</span>
                {!collapsed ? (
                  <span className="session-entry__copy">
                    <strong>{session.title}</strong>
                    <small><Images size={11} /> {session.items.length} · {relativeTime(session.updatedAt)}</small>
                  </span>
                ) : null}
              </button>
              <IconButton
                className="session-entry__delete"
                label={`${session.title} 삭제`}
                onClick={() => onDelete(session.id)}
              ><Trash2 size={13} /></IconButton>
            </div>
          )
        })}
      </nav>
      {!collapsed ? <footer><span>{sessions.length} sessions</span><small>이 기기에만 저장</small></footer> : null}
    </aside>
  )
}
