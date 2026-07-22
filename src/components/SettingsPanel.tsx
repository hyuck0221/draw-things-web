import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  DrawThingsModel,
  GenerationMode,
  GenerationParameters,
  ParameterValue,
} from '../domain/types'
import {
  EMPTY_CONTROL,
  EMPTY_LORA,
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
  isParameterVisible,
  type DrawThingsControl,
  type DrawThingsLoRA,
  type ParameterDefinition,
} from '../lib/draw-things/parameters'
import { Button, Field, IconButton, TextInput, Toggle } from './ui'

interface SettingsPanelProps {
  open: boolean
  mode: GenerationMode
  values: GenerationParameters
  models: DrawThingsModel[]
  onChange: (key: string, value: ParameterValue) => void
  onClose: () => void
  onReset: () => void
}

function numericValue(value: string, kind: 'int' | 'float') {
  const parsed = kind === 'int' ? Number.parseInt(value, 10) : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function LoRAEditor({
  value,
  onChange,
}: {
  value: Array<Record<string, unknown>>
  onChange: (value: Array<Record<string, unknown>>) => void
}) {
  const update = (index: number, patch: Partial<DrawThingsLoRA>) => {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }
  return (
    <div className="nested-editor">
      {value.length === 0 ? <p className="nested-editor__empty">적용된 LoRA가 없습니다.</p> : null}
      {value.map((item, index) => (
        <article className="nested-card" key={`lora-${index}`}>
          <header><strong>LoRA {index + 1}</strong><IconButton label="LoRA 제거" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></IconButton></header>
          <Field label="파일"><TextInput value={String(item.file ?? '')} onChange={(event) => update(index, { file: event.target.value })} placeholder="model_lora.ckpt" /></Field>
          <div className="nested-grid">
            <Field label="가중치"><TextInput type="number" step="0.05" value={Number(item.weight ?? 0.6)} onChange={(event) => update(index, { weight: Number(event.target.value) })} /></Field>
            <Field label="적용 대상">
              <select value={String(item.mode ?? 'all')} onChange={(event) => update(index, { mode: event.target.value })}>
                <option value="all">전체</option><option value="base">Base</option><option value="refiner">Refiner</option>
              </select>
            </Field>
          </div>
        </article>
      ))}
      <Button variant="ghost" onClick={() => onChange([...value, { ...EMPTY_LORA }])}><Plus size={14} /> LoRA 추가</Button>
    </div>
  )
}

function ControlEditor({
  value,
  onChange,
}: {
  value: Array<Record<string, unknown>>
  onChange: (value: Array<Record<string, unknown>>) => void
}) {
  const update = (index: number, patch: Partial<DrawThingsControl>) => {
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }
  return (
    <div className="nested-editor">
      {value.length === 0 ? <p className="nested-editor__empty">적용된 ControlNet이 없습니다.</p> : null}
      {value.map((item, index) => (
        <article className="nested-card" key={`control-${index}`}>
          <header><strong>Control {index + 1}</strong><IconButton label="Control 제거" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></IconButton></header>
          <Field label="파일"><TextInput value={String(item.file ?? '')} onChange={(event) => update(index, { file: event.target.value })} placeholder="controlnet.ckpt" /></Field>
          <div className="nested-grid nested-grid--three">
            <Field label="가중치"><TextInput type="number" step="0.05" value={Number(item.weight ?? 1)} onChange={(event) => update(index, { weight: Number(event.target.value) })} /></Field>
            <Field label="시작"><TextInput type="number" min="0" max="1" step="0.05" value={Number(item.guidanceStart ?? 0)} onChange={(event) => update(index, { guidanceStart: Number(event.target.value) })} /></Field>
            <Field label="종료"><TextInput type="number" min="0" max="1" step="0.05" value={Number(item.guidanceEnd ?? 1)} onChange={(event) => update(index, { guidanceEnd: Number(event.target.value) })} /></Field>
          </div>
          <div className="nested-grid">
            <Field label="중요도"><select value={String(item.controlImportance ?? 'balanced')} onChange={(event) => update(index, { controlImportance: event.target.value })}><option value="balanced">Balanced</option><option value="prompt">Prompt</option><option value="control">Control</option></select></Field>
            <Field label="입력 재정의"><TextInput value={String(item.inputOverride ?? '')} onChange={(event) => update(index, { inputOverride: event.target.value })} placeholder="Depth, Canny…" /></Field>
          </div>
          <Field label="Target Blocks" hint="쉼표로 구분"><TextInput value={Array.isArray(item.targetBlocks) ? item.targetBlocks.join(', ') : ''} onChange={(event) => update(index, { targetBlocks: event.target.value.split(',').map((part) => part.trim()).filter(Boolean) })} /></Field>
          <div className="nested-switches">
            <Toggle label="No Prompt" checked={Boolean(item.noPrompt)} onChange={(checked) => update(index, { noPrompt: checked })} />
            <Toggle label="Global Average Pooling" checked={Boolean(item.globalAveragePooling ?? true)} onChange={(checked) => update(index, { globalAveragePooling: checked })} />
          </div>
          <Field label="다운샘플 비율"><TextInput type="number" step="0.05" min="0" value={Number(item.downSamplingRate ?? 1)} onChange={(event) => update(index, { downSamplingRate: Number(event.target.value) })} /></Field>
        </article>
      ))}
      <Button variant="ghost" onClick={() => onChange([...value, { ...EMPTY_CONTROL }])}><Plus size={14} /> ControlNet 추가</Button>
    </div>
  )
}

function ParameterControl({
  definition,
  value,
  models,
  onChange,
}: {
  definition: ParameterDefinition
  value: ParameterValue | undefined
  models: DrawThingsModel[]
  onChange: (value: ParameterValue) => void
}) {
  const disabled = Boolean(definition.readOnlyReason)
  const numericKind = definition.kind === 'int' || definition.kind === 'float'
    ? definition.kind
    : null
  if (definition.kind === 'bool') {
    return (
      <div className="parameter-row parameter-row--toggle">
        <Toggle label={definition.label} description={definition.sourceNote ?? definition.readOnlyReason} checked={Boolean(value)} disabled={disabled} onChange={onChange} />
      </div>
    )
  }
  if (definition.kind === 'loras') {
    return <LoRAEditor value={Array.isArray(value) ? value : []} onChange={onChange} />
  }
  if (definition.kind === 'controls') {
    return <ControlEditor value={Array.isArray(value) ? value : []} onChange={onChange} />
  }
  return (
    <Field
      label={definition.label}
      hint={definition.readOnlyReason ?? definition.sourceNote ?? `${definition.key}${definition.aliases.length ? ` · 별칭 ${definition.aliases.join(', ')}` : ''}`}
      className={disabled ? 'is-disabled' : ''}
    >
      {definition.kind === 'enum' ? (
        <select value={String(value ?? '')} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {definition.enumValues?.map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      ) : (definition.key === 'model' || definition.key === 'refiner_model') && models.length > 0 ? (
        <select value={String(value ?? '')} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {definition.key === 'refiner_model'
            ? <option value="">사용 안 함</option>
            : !value ? <option value="">모델을 선택하세요</option> : null}
          {value && !models.some((model) => model.file === value) ? <option value={String(value)}>{String(value)}</option> : null}
          {models.map((model) => <option value={model.file} key={model.file}>{model.name ?? model.file}</option>)}
        </select>
      ) : numericKind ? (
        <TextInput
          type="number"
          value={Number(value ?? 0)}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          disabled={disabled}
          onChange={(event) => onChange(numericValue(event.target.value, numericKind))}
        />
      ) : (
        <TextInput value={String(value ?? '')} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  )
}

export function SettingsPanel({ open, mode, values, models, onChange, onClose, onReset }: SettingsPanelProps) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const normalizeSearch = (value: string) => value.toLocaleLowerCase().replace(/[\s_-]+/g, '')
    const normalized = normalizeSearch(query.trim())
    const matching = PARAMETER_DEFINITIONS.filter((definition) => {
      if (!isParameterVisible(definition, values, mode)) return false
      if (!normalized) return true
      return normalizeSearch(`${definition.label} ${definition.key} ${definition.aliases.join(' ')}`).includes(normalized)
    })
    return matching.reduce<Record<string, ParameterDefinition[]>>((result, definition) => {
      ;(result[definition.group] ??= []).push(definition)
      return result
    }, {})
  }, [mode, query, values])

  if (!open) return null
  return (
    <aside className="settings-panel" aria-label="전체 생성 설정">
      <header>
        <div><span className="eyebrow"><SlidersHorizontal size={13} /> API PARAMETERS</span><h2>전체 생성 설정</h2><p>Draw Things HTTP 항목 83개와 전용 필드를 표시합니다. upstream 호환성 문제가 있는 값은 읽기 전용입니다.</p></div>
        <IconButton label="설정 닫기" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="settings-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="설정 이름 또는 API 키 검색" /></div>
      <div className="settings-panel__scroll">
        {Object.entries(groups).map(([group, definitions], index) => {
          const groupInfo = PARAMETER_GROUPS[group] ?? { label: group, description: '' }
          return (
            <details className="settings-group" key={group} open={Boolean(query) || index < 3 || group === 'conditioning'}>
              <summary>
                <span><strong>{groupInfo.label}</strong><small>{groupInfo.description}</small></span>
                <span>{definitions.length}<ChevronDown size={15} /></span>
              </summary>
              <div className="settings-group__body">
                {definitions.map((definition) => (
                  <div className="parameter-control" key={definition.key}>
                    {definition.readOnlyReason ? <span className="source-warning" title={definition.readOnlyReason}><AlertTriangle size={13} /></span> : definition.sourceNote ? <span className="source-note" title={definition.sourceNote}><CircleHelp size={13} /></span> : null}
                    <ParameterControl definition={definition} value={values[definition.key]} models={models} onChange={(value) => onChange(definition.key, value)} />
                  </div>
                ))}
              </div>
            </details>
          )
        })}
        {Object.keys(groups).length === 0 ? <div className="settings-empty"><Search size={22} /><p>일치하는 설정이 없습니다.</p></div> : null}
      </div>
      <footer><Button variant="ghost" onClick={onReset}>기본값으로 되돌리기</Button><Button variant="primary" onClick={onClose}>완료</Button></footer>
    </aside>
  )
}
