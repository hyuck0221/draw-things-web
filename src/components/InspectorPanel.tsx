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
  return (
    <aside className="inspector-panel">
      <header><span className="eyebrow"><WandSparkles size={13} /> GENERATION</span><h2>생성 설정</h2></header>
      {selected ? (
        <div className="selection-card">
          <img src={selected.dataUrl} alt="선택한 캔버스 이미지" />
          <div><strong>선택한 이미지</strong><span>{Math.round(selected.width)} × {Math.round(selected.height)} canvas px</span></div>
          <Toggle label="이미지로 이어 그리기" checked={useSelected} onChange={onUseSelected} />
        </div>
      ) : (
        <div className="selection-card selection-card--empty"><ImageIcon size={19} /><span>캔버스 이미지를 선택하면<br />img2img 입력으로 사용할 수 있습니다.</span></div>
      )}

      <div className="inspector-scroll">
        <section className="inspector-section">
          <div className="inspector-section__title"><span><Sparkles size={15} /> 모델</span></div>
          <Field label="설치된 체크포인트" hint={modelsMessage || '로컬 커넥터가 Draw Things 모델 메타데이터를 읽습니다.'}>
            <div className="model-picker">
              {models.length ? (
                <select aria-label="설치된 모델" value={String(parameters.model ?? '')} onChange={(event) => onChange('model', event.target.value)}>
                  {!parameters.model ? <option value="">모델을 선택하세요</option> : null}
                  {parameters.model && !models.some((model) => model.file === parameters.model) ? <option value={String(parameters.model)}>{String(parameters.model)}</option> : null}
                  {models.map((model) => <option key={model.file} value={model.file}>{model.name ? `${model.name} · ${model.file}` : model.file}</option>)}
                </select>
              ) : <TextInput value={String(parameters.model ?? '')} onChange={(event) => onChange('model', event.target.value)} placeholder="커넥터 연결 후 설치 목록을 불러옵니다" />}
              <IconButton label="설치 모델 목록 새로고침" disabled={modelsLoading} onClick={onRefreshModels}>
                {modelsLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
              </IconButton>
            </div>
          </Field>
          <p className="model-install-note">새 모델은 Draw Things의 모델 관리에서 설치한 뒤 위 새로고침을 누르세요.</p>
        </section>

        <section className="inspector-section">
          <div className="inspector-section__title"><span><Maximize size={15} /> 이미지</span><small>64px 단위</small></div>
          <div className="size-grid">
            <Field label="너비"><TextInput type="number" min="128" max="8192" step="64" value={Number(parameters.width ?? 1024)} onChange={(event) => onChange('width', number(event.target.value))} /></Field>
            <span>×</span>
            <Field label="높이"><TextInput type="number" min="128" max="8192" step="64" value={Number(parameters.height ?? 1024)} onChange={(event) => onChange('height', number(event.target.value))} /></Field>
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
      <footer><Button variant="secondary" onClick={onOpenAll}><SlidersHorizontal size={15} /> 전체 84개 설정</Button></footer>
    </aside>
  )
}
