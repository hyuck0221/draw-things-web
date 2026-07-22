import {
  CornerDownLeft,
  Image as ImageIcon,
  Link2,
  MessageCircleMore,
  MinusCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CanvasItem, DrawThingsModel } from '../domain/types'
import { Button, IconButton } from './ui'

interface PromptDockProps {
  prompt: string
  negativePrompt: string
  continuation: boolean
  selected?: CanvasItem
  useSelected: boolean
  online: boolean
  canGenerate: boolean
  generating: boolean
  cancellable: boolean
  progress: number
  statusMessage: string
  model: string
  models: DrawThingsModel[]
  modelsLoading: boolean
  modelsMessage: string
  modelsError: boolean
  onPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onContinuationChange: (value: boolean) => void
  onUseSelectedChange: (value: boolean) => void
  onSubmit: () => void
  onCancel: () => void
  onOpenConnection: () => void
  onModelChange: (model: string) => void
  onRefreshModels: () => void
  onOpenSettings: () => void
}

export function PromptDock({
  prompt,
  negativePrompt,
  continuation,
  selected,
  useSelected,
  online,
  canGenerate,
  generating,
  cancellable,
  progress,
  statusMessage,
  model,
  models,
  modelsLoading,
  modelsMessage,
  modelsError,
  onPromptChange,
  onNegativePromptChange,
  onContinuationChange,
  onUseSelectedChange,
  onSubmit,
  onCancel,
  onOpenConnection,
  onModelChange,
  onRefreshModels,
  onOpenSettings,
}: PromptDockProps) {
  const [negativeOpen, setNegativeOpen] = useState(Boolean(negativePrompt))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(150, Math.max(46, textarea.scrollHeight))}px`
  }, [prompt])

  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!generating && online && canGenerate && prompt.trim()) onSubmit()
    }
  }

  return (
    <div className="prompt-dock-wrap">
      {generating ? (
        <div className="generation-progress">
          <div><span><Sparkles size={14} /> {statusMessage || 'Draw Things가 그리고 있습니다'}</span><strong>{Math.round(progress)}%</strong></div>
          <span className="generation-progress__track"><span style={{ width: `${Math.max(3, progress)}%` }} /></span>
        </div>
      ) : null}
      <section className={`prompt-dock ${generating ? 'is-generating' : ''}`}>
        <div className="prompt-context">
          <button type="button" className={continuation ? 'is-active' : ''} onClick={() => onContinuationChange(!continuation)} title="같은 세션의 이전 프롬프트를 이어 붙입니다. !로 시작하면 한 번만 초기화합니다.">
            {continuation ? <Link2 size={13} /> : <MinusCircle size={13} />}
            {continuation ? '대화 문맥 이어짐' : '새 프롬프트'}
          </button>
          {selected ? (
            <button type="button" className={useSelected ? 'is-active is-image' : 'is-image'} onClick={() => onUseSelectedChange(!useSelected)}>
              <ImageIcon size={13} /> {useSelected ? '선택 이미지로 변형' : '선택 이미지 사용 안 함'}
            </button>
          ) : null}
          <span><MessageCircleMore size={13} /> 이 세션 안에서만 기억</span>
        </div>

        <div className="prompt-main">
          <div className="prompt-mark"><Sparkles size={19} /></div>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={submitOnShortcut}
            placeholder="그리고 싶은 장면을 설명하세요…"
            aria-label="이미지 프롬프트"
            rows={1}
          />
          {generating ? (
            <Button variant={cancellable ? 'danger' : 'primary'} className="generate-button" disabled={!cancellable} onClick={onCancel}>
              {cancellable ? <><Square size={15} fill="currentColor" /> 중단</> : <><Sparkles size={15} /> 마무리 중</>}
            </Button>
          ) : online && canGenerate ? (
            <Button variant="primary" className="generate-button" disabled={!prompt.trim()} onClick={onSubmit}>
              <Sparkles size={16} /> 생성 <kbd>⌘↵</kbd>
            </Button>
          ) : (
            <Button variant="primary" className="generate-button" onClick={onOpenConnection}>
              연결 설정 <CornerDownLeft size={15} />
            </Button>
          )}
        </div>

        <div className={`negative-prompt ${negativeOpen ? 'is-open' : ''}`}>
          <button type="button" onClick={() => setNegativeOpen((value) => !value)}>
            <span>NEG</span> 네거티브 프롬프트
          </button>
          {negativeOpen ? <textarea value={negativePrompt} onChange={(event) => onNegativePromptChange(event.target.value)} placeholder="제외할 요소를 입력하세요" aria-label="네거티브 프롬프트" /> : null}
        </div>

        <div className="prompt-options-mobile">
          <select aria-label="모바일 설치 모델" value={model} disabled={models.length === 0} onChange={(event) => onModelChange(event.target.value)}>
            {!model ? <option value="">{modelsLoading ? '모델 확인 중…' : '설치 모델 선택'}</option> : null}
            {models.map((item) => <option value={item.file} key={item.file}>{item.name ?? item.file}</option>)}
          </select>
          <IconButton label="설치 모델 목록 새로고침" disabled={modelsLoading} onClick={onRefreshModels}><RefreshCw className={modelsLoading ? 'spin' : undefined} size={15} /></IconButton>
          <Button variant="ghost" onClick={onOpenSettings}><SlidersHorizontal size={14} /> 전체 설정</Button>
          {modelsError && modelsMessage ? <p className="prompt-model-error" role="alert">{modelsMessage}</p> : null}
        </div>
      </section>
    </div>
  )
}
