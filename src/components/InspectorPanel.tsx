import { Image as ImageIcon, LoaderCircle, Maximize, RefreshCw, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react'
import type { CanvasItem, DrawThingsModel, GenerationParameters, ParameterValue } from '../domain/types'
import { SAMPLERS } from '../lib/draw-things/parameters'
import { Button, Field, IconButton, TextInput, Toggle } from './ui'

interface InspectorPanelProps {
  selected?: CanvasItem
  parameters: GenerationParameters
  models: DrawThingsModel[]
  modelsLoading: boolean
  modelsMessage: string
  onRefreshModels: () => void
  onChange: (key: string, value: ParameterValue) => void
  onOpenAll: () => void
  onUseSelected: () => void
  useSelected: boolean
}

function number(eventValue: string) {
  const value = Number(eventValue)
  return Number.isFinite(value) ? value : 0
}

export function InspectorPanel({ selected, parameters, models, modelsLoading, modelsMessage, onRefreshModels, onChange, onOpenAll, onUseSelected, useSelected }: InspectorPanelProps) {
  const maximumDimension = 8_192
  return (
    <aside className="inspector-panel">
      <header><span className="eyebrow"><WandSparkles size={13} /> GENERATION</span><h2>생성 설정</h2></header>
      {selected ? (
        <div className="selection-card">
          {selected.dataUrl ? <img src={selected.dataUrl} alt="선택한 캔버스 이미지" /> : null}
          <div><strong>선택한 이미지</strong><span>{Math.round(selected.width)} × {Math.round(selected.height)} canvas px</span></div>
          <Toggle label="이미지로 이어 그리기" checked={useSelected} onChange={onUseSelected} />
        </div>
      ) : (
        <div className="selection-card selection-card--empty"><ImageIcon size={19} /><span>캔버스 이미지를 선택하면<br />img2img 입력으로 사용할 수 있습니다.</span></div>
      )}

      <div className="inspector-scroll">
        <section className="inspector-section">
          <div className="inspector-section__title"><span><Sparkles size={15} /> 모델</span></div>
          <Field label="현재 체크포인트" hint={modelsMessage || 'Draw Things HTTP API에서 현재 선택한 모델을 읽습니다.'}>
            <div className="model-picker">
              <select aria-label="현재 Draw Things 모델" value={String(parameters.model ?? '')} disabled={models.length === 0} onChange={(event) => onChange('model', event.target.value)}>
                {!parameters.model ? <option value="">{modelsLoading ? '현재 모델 확인 중…' : '현재 모델을 확인할 수 없음'}</option> : null}
                {parameters.model && !models.some((model) => model.file === parameters.model) ? <option value={String(parameters.model)}>{String(parameters.model)}</option> : null}
                {models.map((model) => <option key={model.file} value={model.file}>{model.name ? `${model.name} · ${model.file}` : model.file}</option>)}
              </select>
              <IconButton label="현재 모델 다시 확인" disabled={modelsLoading} onClick={onRefreshModels}>
                {modelsLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
              </IconButton>
            </div>
          </Field>
          <p className="model-install-note">로컬 서버가 Draw Things 모델 폴더를 읽어 설치된 주 모델을 표시합니다. 모델 설치 API는 없어 새 모델 설치는 Draw Things 앱에서 진행해야 합니다.</p>
        </section>

        <section className="inspector-section">
          <div className="inspector-section__title"><span><Maximize size={15} /> 이미지</span><small>64px 단위 · 최대 {maximumDimension}</small></div>
          <div className="size-grid">
            <Field label="너비"><TextInput type="number" min="128" max={maximumDimension} step="64" value={Number(parameters.width ?? 1024)} onChange={(event) => onChange('width', number(event.target.value))} /></Field>
            <span>×</span>
            <Field label="높이"><TextInput type="number" min="128" max={maximumDimension} step="64" value={Number(parameters.height ?? 1024)} onChange={(event) => onChange('height', number(event.target.value))} /></Field>
          </div>
          <div className="aspect-presets">
            {[['1:1', 1024, 1024], ['4:5', 896, 1152], ['3:4', 896, 1216], ['16:9', 1344, 768]].map(([label, width, height]) => (
              <button type="button" key={label} onClick={() => { onChange('width', Number(width)); onChange('height', Number(height)) }}>{label}</button>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <div className="inspector-section__title"><span><SlidersHorizontal size={15} /> 샘플링</span></div>
          <Field label="샘플러"><select value={String(parameters.sampler)} onChange={(event) => onChange('sampler', event.target.value)}>{SAMPLERS.map((sampler) => <option value={sampler} key={sampler}>{sampler}</option>)}</select></Field>
          <div className="range-field"><label><span>스텝</span><output>{Number(parameters.steps)}</output></label><input type="range" min="1" max="80" value={Number(parameters.steps)} onChange={(event) => onChange('steps', number(event.target.value))} /></div>
          <div className="range-field"><label><span>CFG 스케일</span><output>{Number(parameters.guidance_scale).toFixed(1)}</output></label><input type="range" min="0" max="20" step="0.5" value={Number(parameters.guidance_scale)} onChange={(event) => onChange('guidance_scale', number(event.target.value))} /></div>
          {useSelected ? <div className="range-field"><label><span>디노이즈 강도</span><output>{Math.round(Number(parameters.strength) * 100)}%</output></label><input type="range" min="0" max="1" step="0.05" value={Number(parameters.strength)} onChange={(event) => onChange('strength', number(event.target.value))} /></div> : null}
          <Field label="시드" hint="-1은 매번 무작위"><TextInput type="number" min="-1" max="4294967295" value={Number(parameters.seed)} onChange={(event) => onChange('seed', number(event.target.value))} /></Field>
        </section>

        <section className="inspector-section inspector-section--compact">
          <Toggle label="고해상도 보정" description="저해상도 1차 생성 후 정제" checked={Boolean(parameters.hires_fix)} onChange={(value) => onChange('hires_fix', value)} />
          <Toggle label="TeaCache" description="지원 모델에서 추론 가속" checked={Boolean(parameters.tea_cache)} onChange={(value) => onChange('tea_cache', value)} />
          <Toggle label="타일 디코딩" description="큰 이미지의 메모리 사용 감소" checked={Boolean(parameters.tiled_decoding)} onChange={(value) => onChange('tiled_decoding', value)} />
        </section>
      </div>
      <footer><Button variant="secondary" onClick={onOpenAll}><SlidersHorizontal size={15} /> 전체 API 설정</Button></footer>
    </aside>
  )
}
