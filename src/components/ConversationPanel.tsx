import { Bot, Link2, MessageSquareText, Sparkles, UserRound, X } from 'lucide-react'
import type { WorkspaceSession } from '../domain/types'
import { IconButton } from './ui'

export function ConversationPanel({
  open,
  session,
  onClose,
}: {
  open: boolean
  session: WorkspaceSession
  onClose: () => void
}) {
  if (!open) return null
  return (
    <aside className="conversation-panel" aria-label="세션 대화">
      <header>
        <div><span className="eyebrow"><MessageSquareText size={13} /> SESSION CONTEXT</span><h2>이 세션의 대화</h2><p>후속 프롬프트는 마지막 장면의 문맥을 이어갑니다.</p></div>
        <IconButton label="대화 닫기" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="conversation-panel__body">
        {session.turns.length === 0 ? (
          <div className="conversation-empty"><Sparkles size={23} /><strong>아직 대화가 없습니다</strong><p>첫 이미지를 만들면 요청과 결과가<br />이 세션 안에 차곡차곡 이어집니다.</p></div>
        ) : session.turns.map((turn) => {
          const attachments = turn.attachmentIds?.map((id) => session.items.find((item) => item.id === id)).filter(Boolean) ?? []
          const images = turn.imageIds?.map((id) => session.items.find((item) => item.id === id)).filter(Boolean) ?? []
          return (
            <article className={`conversation-turn conversation-turn--${turn.role}`} key={turn.id}>
              <span className="conversation-turn__avatar">{turn.role === 'user' ? <UserRound size={14} /> : <Bot size={14} />}</span>
              <div>
                <header><strong>{turn.role === 'user' ? '나' : 'Draw Things'}</strong><time>{new Intl.DateTimeFormat('ko', { hour: '2-digit', minute: '2-digit' }).format(turn.createdAt)}</time></header>
                <p>{turn.content}</p>
                {attachments.length ? (
                  <div className="conversation-attachments" aria-label="첨부한 참고 이미지">
                    {attachments.map((image) => image?.dataUrl ? <img src={image.dataUrl} alt="첨부한 참고 이미지" key={image.id} /> : null)}
                    <span>참고 이미지</span>
                  </div>
                ) : null}
                {turn.effectivePrompt && turn.effectivePrompt !== turn.content ? <details><summary><Link2 size={12} /> 이어진 실제 프롬프트</summary><code>{turn.effectivePrompt}</code></details> : null}
                {images.length ? <div className="conversation-images">{images.map((image) => image?.dataUrl ? <img src={image.dataUrl} alt="생성 결과" key={image.id} /> : null)}</div> : null}
                {turn.status === 'generating' ? <span className="turn-status"><i /> 생성 중</span> : null}
                {turn.status === 'error' ? <span className="turn-status turn-status--error">생성 실패</span> : null}
              </div>
            </article>
          )
        })}
      </div>
      <footer><Link2 size={14} /><span>문맥은 이 세션 내부에서만 사용되며 서버에 별도 저장되지 않습니다.</span></footer>
    </aside>
  )
}
