import {
  AlertTriangle,
  CornerDownLeft,
  Image as ImageIcon,
  Link2,
  MessageCircleMore,
  MinusCircle,
  Paperclip,
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
  attachment?: { name: string; dataUrl: string }
  attachmentLoading: boolean
  useSelected: boolean
  online: boolean
  canGenerate: boolean
  generating: boolean
  cancellable: boolean
  statusMessage: string
  steps: number
  model: string
  models: DrawThingsModel[]
  modelsLoading: boolean
  modelsMessage: string
  modelsError: boolean
  onPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onContinuationChange: (value: boolean) => void
  onUseSelectedChange: (value: boolean) => void
  onAttachmentSelect: (file: File) => void
  onAttachmentRemove: () => void
  onSubmit: () => void
  onCancel: () => void
  onOpenStatus: () => void
  onModelChange: (model: string) => void
  onRefreshModels: () => void
  onOpenSettings: () => void
  onSetRecommendedSteps: () => void
}

export function PromptDock({
  prompt,
  negativePrompt,
  continuation,
  selected,
  attachment,
  attachmentLoading,
  useSelected,
  online,
  canGenerate,
  generating,
  cancellable,
  statusMessage,
  steps,
  model,
  models,
  modelsLoading,
  modelsMessage,
  modelsError,
  onPromptChange,
  onNegativePromptChange,
  onContinuationChange,
  onUseSelectedChange,
  onAttachmentSelect,
  onAttachmentRemove,
  onSubmit,
  onCancel,
  onOpenStatus,
  onModelChange,
  onRefreshModels,
  onOpenSettings,
  onSetRecommendedSteps,
}: PromptDockProps) {
  const [negativeOpen, setNegativeOpen] = useState(Boolean(negativePrompt))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const fewStepModel = /schnell|turbo|lightning|lcm|distill/i.test(model)
  const shouldWarnAboutSteps = !fewStepModel && Number.isFinite(steps) && steps > 0 && steps < 6

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(150, Math.max(46, textarea.scrollHeight))}px`
  }, [prompt])

  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!generating && !attachmentLoading && online && canGenerate && prompt.trim()) onSubmit()
    }
  }

  return (
    <div className="prompt-dock-wrap">
      {generating ? (
        <div className="generation-progress" role="status" aria-live="polite">
          <span className="generation-progress__spinner"><Sparkles size={15} /></span>
          <span className="generation-progress__copy"><strong>Draw Things가 처리 중입니다</strong><small>{statusMessage || '요청을 전송하고 결과를 기다리고 있습니다…'}</small></span>
          <span className="generation-progress__dots" aria-hidden="true"><i /><i /><i /></span>
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
          <button
            type="button"
            className={attachment ? 'is-active is-image' : ''}
            onClick={() => attachmentInputRef.current?.click()}
            title="내 PC의 이미지를 참고 이미지로 첨부합니다. 생성 시 img2img 입력으로 전송됩니다."
          >
            <Paperclip size={13} /> {attachmentLoading ? '이미지 준비 중…' : attachment ? '참고 이미지 첨부됨' : '이미지 첨부'}
          </button>
          <span><MessageCircleMore size={13} /> 이 세션 안에서만 기억</span>
        </div>

        <input
          ref={attachmentInputRef}
          className="prompt-attachment-input"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ''
            if (file) onAttachmentSelect(file)
          }}
        />

        {attachment ? (
          <div className="prompt-attachment">
            <img src={attachment.dataUrl} alt="첨부한 참고 이미지 미리보기" />
            <span><strong>{attachment.name}</strong><small>참고 이미지로 전송 · 생성 후 대화에 저장</small></span>
            <IconButton label="첨부 이미지 제거" onClick={onAttachmentRemove}><MinusCircle size={15} /></IconButton>
          </div>
        ) : null}

        {shouldWarnAboutSteps ? (
          <div className="low-steps-warning" role="status">
            <AlertTriangle size={13} />
            <span>현재 {steps} 스텝입니다. 이 모델은 결과가 뿌옇게 나올 수 있습니다.</span>
            <button type="button" onClick={onSetRecommendedSteps}>20 스텝 적용</button>
          </div>
        ) : null}

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
            <Button variant="primary" className="generate-button" disabled={!prompt.trim() || attachmentLoading} onClick={onSubmit}>
              <Sparkles size={16} /> 생성 <kbd>⌘↵</kbd>
            </Button>
          ) : (
            <Button variant="primary" className="generate-button" onClick={onOpenStatus}>
              API 상태 <CornerDownLeft size={15} />
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
          <select aria-label="현재 Draw Things 모델" value={model} disabled={models.length === 0} onChange={(event) => onModelChange(event.target.value)}>
            {!model ? <option value="">{modelsLoading ? '현재 모델 확인 중…' : '현재 모델 확인 불가'}</option> : null}
            {model && !models.some((item) => item.file === model) ? <option value={model}>{model}</option> : null}
            {models.map((item) => <option value={item.file} key={item.file}>{item.name ?? item.file}</option>)}
          </select>
          <IconButton label="현재 모델 다시 확인" disabled={modelsLoading} onClick={onRefreshModels}><RefreshCw className={modelsLoading ? 'spin' : undefined} size={15} /></IconButton>
          <Button variant="ghost" onClick={onOpenSettings}><SlidersHorizontal size={14} /> 전체 설정</Button>
          {modelsError && modelsMessage ? <p className="prompt-model-error" role="alert">{modelsMessage}</p> : null}
        </div>
      </section>
    </div>
  )
}
