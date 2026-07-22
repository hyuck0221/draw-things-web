import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  LockKeyhole,
  Network,
  Radar,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  BridgeHealth,
  ConnectionConfig,
  ConnectionTestResult,
  DiscoveredEndpoint,
} from '../domain/types'
import { createPairingToken } from '../lib/defaults'
import { suggestedBridgeUrl, tailscaleAddress } from '../lib/network'
import { shellQuote } from '../lib/shell'
import { Button, Field, IconButton, Segmented, TextInput, Toggle } from './ui'

interface ConnectionPanelProps {
  open: boolean
  connection: ConnectionConfig
  result: ConnectionTestResult | null
  bridge: BridgeHealth | null
  discovered: DiscoveredEndpoint[]
  testing: boolean
  discovering: boolean
  onClose: () => void
  onSave: (connection: ConnectionConfig) => void
  onTest: (connection: ConnectionConfig) => Promise<ConnectionTestResult | null>
  onDiscover: (connection: ConnectionConfig) => Promise<void>
}

function numberValue(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // HTTP IP origins often do not expose the secure Clipboard API.
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

export function ConnectionPanel({
  open,
  connection,
  result,
  bridge,
  discovered,
  testing,
  discovering,
  onClose,
  onSave,
  onTest,
  onDiscover,
}: ConnectionPanelProps) {
  const pageUrl = typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.href
  const pageHost = typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname
  const tailscaleHost = tailscaleAddress(pageHost)
  const [draft, setDraft] = useState(() => ({
    ...connection,
    bridgeUrl: suggestedBridgeUrl(pageUrl, connection.bridgeUrl),
    bridgePairingToken: connection.bridgePairingToken || createPairingToken(),
  }))
  const [advanced, setAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [draftResult, setDraftResult] = useState<ConnectionTestResult | null>(() => {
    const bridgeIdentityUnchanged = draft.transport !== 'bridge'
      || (draft.bridgeUrl === connection.bridgeUrl
        && draft.bridgePairingToken === connection.bridgePairingToken)
    return bridgeIdentityUnchanged ? result : null
  })
  const [draftTesting, setDraftTesting] = useState(false)

  const origin = typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.origin
  const bridgeCommand = useMemo(
    () => `node ~/Downloads/draw-things-bridge.mjs${tailscaleHost ? ` --bind ${shellQuote(tailscaleHost)}` : ''} --origin ${shellQuote(origin)} --token ${shellQuote(draft.bridgePairingToken)}`,
    [draft.bridgePairingToken, origin, tailscaleHost],
  )
  const bridgeMatchesSavedConnection = draft.bridgeUrl === connection.bridgeUrl
    && draft.bridgePairingToken === connection.bridgePairingToken
  const savedBridgeReady = bridgeMatchesSavedConnection && Boolean(bridge?.ok)
  const bridgeReady = draft.transport === 'bridge' && (Boolean(draftResult?.ok) || savedBridgeReady)
  const bridgeFailed = draft.transport === 'bridge' && Boolean(draftResult && !draftResult.ok)
  const bridgeStatus = draftTesting
    ? '커넥터와 Draw Things 연결을 확인하고 있습니다'
    : draftResult?.ok
      ? '커넥터와 Draw Things 연결을 확인했습니다'
      : bridgeFailed
        ? '연결 테스트에 실패했습니다'
        : bridgeReady
          ? '로컬 커넥터를 찾았습니다'
          : '커넥터가 아직 응답하지 않습니다'

  if (!open) return null

  const update = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDraftResult(null)
  }

  const selectEndpoint = (endpoint: DiscoveredEndpoint) => {
    setDraft((current) => ({
      ...current,
      protocol: endpoint.protocol,
      host: endpoint.host,
      port: endpoint.port,
      tls: endpoint.tls,
    }))
    setDraftResult(null)
  }

  const runTest = async () => {
    setDraftTesting(true)
    try {
      const next = await onTest(draft)
      const fingerprint = next?.ok && draft.transport === 'bridge' && draft.tls && !draft.tlsFingerprintSha256
        ? next.certificate?.fingerprintSha256
        : undefined
      if (fingerprint) {
        setDraft((current) => ({ ...current, tlsFingerprintSha256: fingerprint }))
      }
      setDraftResult(next)
    } finally {
      setDraftTesting(false)
    }
  }

  const copyCommand = async () => {
    const succeeded = await copyText(bridgeCommand)
    setCopied(succeeded)
    setCopyFailed(!succeeded)
    if (succeeded) window.setTimeout(() => setCopied(false), 1_500)
  }

  const saveAndClose = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connection-panel" role="dialog" aria-modal="true" aria-labelledby="connection-title">
        <header className="connection-panel__header">
          <div className="eyebrow"><Network size={14} /> LOCAL CONNECTION</div>
          <div>
            <h2 id="connection-title">Draw Things 연결</h2>
            <p>프롬프트와 이미지는 이 브라우저와 내 Mac 사이에서만 이동합니다.</p>
          </div>
          <IconButton label="연결 창 닫기" onClick={onClose}><X size={18} /></IconButton>
        </header>

        <div className="connection-panel__body">
          <aside className="connection-steps" aria-label="연결 순서">
            <div className="connection-step is-active">
              <span>1</span>
              <div><strong>통신 방식</strong><small>브라우저 또는 로컬 커넥터</small></div>
            </div>
            <div className="connection-step">
              <span>2</span>
              <div><strong>API 주소</strong><small>프로토콜 · 호스트 · 포트</small></div>
            </div>
            <div className="connection-step">
              <span>3</span>
              <div><strong>실시간 확인</strong><small>연결 테스트 후 자동 감시</small></div>
            </div>
            <div className="privacy-card">
              <ShieldCheck size={20} />
              <div>
                <strong>로컬 전용 저장</strong>
                <p>연결·생성 설정은 Local Storage, 세션 이미지는 IndexedDB에만 저장됩니다.</p>
              </div>
            </div>
          </aside>

          <main className="connection-form">
            <section className="form-section">
              <div className="form-section__heading">
                <div><span>연결 경로</span><h3>로컬 커넥터가 가장 안정적입니다</h3></div>
                {bridgeReady ? <span className="mini-badge mini-badge--success"><Check size={12} /> 실행 중</span> : null}
              </div>
              <Segmented
                label="연결 경로"
                value={draft.transport}
                onChange={(value) => update('transport', value)}
                options={[
                  { value: 'bridge', label: '로컬 커넥터', badge: '권장' },
                  { value: 'direct', label: '직접 연결', badge: '고급' },
                ]}
              />

              {tailscaleHost && draft.transport === 'bridge' ? (
                <div className="notice notice--info">
                  <Network size={17} />
                  <p><strong>Tailscale 모바일 접속을 감지했습니다.</strong> 커넥터 주소는 이 Mac의 Tailscale IP로 제안되지만, 아래 Draw Things 호스트는 Mac 내부 주소인 <code>127.0.0.1</code>을 유지하세요.</p>
                </div>
              ) : null}

              {draft.transport === 'bridge' ? (
                <div className={`bridge-card ${bridgeReady ? 'is-online' : ''} ${bridgeFailed ? 'is-error' : ''} ${draftTesting ? 'is-checking' : ''}`}>
                  <div className="bridge-card__icon"><Server size={22} /></div>
                  <div className="bridge-card__content">
                    <strong>{bridgeStatus}</strong>
                    <p>
                      Draw Things는 CORS를 제공하지 않으므로 Vercel 또는 Tailscale 페이지에서는 커넥터가 API 응답을 안전하게 전달합니다.
                    </p>
                    {!bridgeReady ? (
                      <>
                        <p className="bridge-mac-note">
                          <strong>Mac에서 실행하세요.</strong> Draw Things가 켜진 Mac에 Node.js 22.12 이상을 준비한 뒤 커넥터 파일을 받고 Terminal에서 아래 명령을 실행합니다.
                          {tailscaleHost ? ' 현재 모바일에서 보고 있다면 Mac에서 같은 주소를 열거나 파일과 명령을 Mac으로 전달하세요.' : null}
                        </p>
                        <div className="bridge-actions">
                          <a className="button button--secondary" href="/bridge/draw-things-bridge.mjs" download>
                            <Download size={15} /> Mac용 커넥터 파일
                          </a>
                          <Button variant="ghost" onClick={copyCommand}>
                            {copied ? <Check size={15} /> : <Clipboard size={15} />}
                            {copied ? '복사됨' : 'Mac 실행 명령 복사'}
                          </Button>
                        </div>
                        <code className="command-preview">{bridgeCommand}</code>
                        {copyFailed ? <small className="copy-fallback" role="status">자동 복사를 사용할 수 없습니다. 위 명령을 길게 눌러 직접 복사하세요.</small> : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="notice notice--warning">
                  <AlertTriangle size={17} />
                  <p><strong>현재 Draw Things HTTP 서버는 CORS를 제공하지 않습니다.</strong> 직접 연결은 CORS를 추가한 별도 프록시나 수정 빌드에서만 동작합니다.</p>
                </div>
              )}

              {draftTesting ? (
                <div className="connection-result connection-result--inline is-checking" role="status" aria-live="polite" aria-atomic="true">
                  <span><LoaderCircle className="spin" size={18} /></span>
                  <div><strong>커넥터와 Draw Things 연결을 확인하고 있습니다…</strong></div>
                </div>
              ) : draftResult ? (
                <div className={`connection-result connection-result--inline ${draftResult.ok ? 'is-success' : 'is-error'}`} role="status" aria-live="polite" aria-atomic="true">
                  <span>{draftResult.ok ? <Check size={18} /> : <AlertTriangle size={18} />}</span>
                  <div>
                    <strong>{draftResult.message}</strong>
                    <p>{draftResult.endpoint} · {draftResult.latencyMs} ms</p>
                    {draftResult.certificate?.fingerprintSha256 ? <small>TLS SHA-256 · {draftResult.certificate.fingerprintSha256}</small> : null}
                    {draftResult.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
                    {draftResult.capabilities.limitations.map((limitation) => <small key={limitation}>{limitation}</small>)}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="form-section">
              <div className="form-section__heading">
                <div><span>Draw Things API</span><h3>서버 주소와 프로토콜</h3></div>
                {draft.transport === 'bridge' ? (
                  <Button variant="ghost" disabled={discovering} onClick={() => onDiscover(draft)}>
                    {discovering ? <LoaderCircle className="spin" size={15} /> : <Radar size={15} />}
                    자동 찾기
                  </Button>
                ) : null}
              </div>

              <Segmented
                label="Draw Things 프로토콜"
                value={draft.protocol}
                onChange={(value) => {
                  update('protocol', value)
                  if (value === 'http') update('tls', false)
                  if (value === 'grpc') update('tls', true)
                }}
                options={[
                  { value: 'http', label: 'HTTP', badge: '생성' },
                  { value: 'grpc', label: 'gRPC', badge: '진단' },
                ]}
              />

              {draft.protocol === 'grpc' ? (
                <div className="notice notice--info">
                  <Info size={17} />
                  <p><strong>gRPC 연결·TLS·공유 비밀·모델 탐색은 확인할 수 있습니다.</strong> 이미지 결과가 Draw Things 전용 텐서 형식이라 웹 캔버스 생성에는 앱의 HTTP 프로토콜이 필요합니다.</p>
                </div>
              ) : null}

              <div className="form-grid form-grid--address">
                <Field label="호스트">
                  <TextInput value={draft.host} onChange={(event) => update('host', event.target.value)} placeholder="127.0.0.1" spellCheck={false} />
                </Field>
                <Field label="포트">
                  <TextInput type="number" min={1} max={65535} value={draft.port} onChange={(event) => update('port', numberValue(event.target.value, 7859))} />
                </Field>
              </div>

              <Toggle
                label={draft.protocol === 'grpc' ? 'TLS 사용' : 'HTTPS 프록시 사용'}
                description={draft.protocol === 'grpc' ? 'Draw Things 기본 인증서는 자체 서명이며 커넥터 내부에서만 검증합니다.' : '기본 내장 HTTP API는 TLS를 사용하지 않습니다.'}
                checked={draft.tls}
                onChange={(value) => update('tls', value)}
              />

              {draft.protocol === 'grpc' ? (
                <div className="form-grid">
                  <Field label="공유 비밀" hint="Draw Things에서 ‘공유 비밀 활성화’를 켠 경우에만 입력">
                    <TextInput type="password" value={draft.sharedSecret} onChange={(event) => update('sharedSecret', event.target.value)} autoComplete="off" />
                  </Field>
                  <Toggle
                    label="이 브라우저에 기억"
                    description="끄면 탭 세션 동안만 보관합니다."
                    checked={draft.rememberSecret}
                    onChange={(value) => update('rememberSecret', value)}
                  />
                </div>
              ) : null}

              {discovered.length > 0 ? (
                <div className="discovery-results">
                  <span className="field__label">마지막 탐색 결과</span>
                  {discovered.map((endpoint) => (
                    <button type="button" key={endpoint.id} onClick={() => selectEndpoint(endpoint)}>
                      <span className={`protocol-chip protocol-chip--${endpoint.protocol}`}>{endpoint.protocol.toUpperCase()}</span>
                      <span><strong>{endpoint.name}</strong><small>{endpoint.tls ? 'https' : 'http'}://{endpoint.host}:{endpoint.port}</small></span>
                      <span>{endpoint.latencyMs} ms <ArrowRight size={14} /></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="form-section form-section--advanced">
              <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
                <span><LockKeyhole size={16} /> 연결 옵션 전체 보기</span>
                <span>{advanced ? '접기' : '열기'}</span>
              </button>
              {advanced ? (
                <div className="advanced-content">
                  <Field label="클라이언트 이름">
                    <TextInput value={draft.clientName} onChange={(event) => update('clientName', event.target.value)} />
                  </Field>
                  {draft.transport === 'direct' ? (
                    <Field label="API Base Path" hint="기본 Draw Things는 비워 둡니다. 경로 prefix가 있는 직접 프록시에만 사용합니다.">
                      <TextInput value={draft.apiBasePath} onChange={(event) => update('apiBasePath', event.target.value)} placeholder="예: proxy/draw-things" />
                    </Field>
                  ) : null}
                  {draft.transport === 'bridge' ? (
                    <>
                      <Field label="커넥터 주소">
                        <TextInput value={draft.bridgeUrl} onChange={(event) => update('bridgeUrl', event.target.value)} spellCheck={false} />
                      </Field>
                      <Field label="커넥터 페어링 토큰" hint="커넥터를 --token 옵션으로 실행했다면 같은 값을 입력합니다.">
                        <TextInput type="password" value={draft.bridgePairingToken} onChange={(event) => update('bridgePairingToken', event.target.value)} autoComplete="off" />
                      </Field>
                    </>
                  ) : null}
                  {draft.tls && draft.transport === 'bridge' ? (
                    <>
                      <Toggle
                        label="자가 서명 인증서 허용"
                        description="첫 연결에서 인증서 지문을 읽고 이후 연결에 고정합니다. 끄면 시스템 신뢰 저장소로 검증합니다."
                        checked={draft.allowSelfSignedCertificate}
                        onChange={(value) => update('allowSelfSignedCertificate', value)}
                      />
                      <Field label="TLS SHA-256 지문" hint="비워 두면 첫 성공 테스트에서 자동으로 고정합니다.">
                        <TextInput value={draft.tlsFingerprintSha256} onChange={(event) => update('tlsFingerprintSha256', event.target.value)} spellCheck={false} placeholder="05:60:47:…" />
                      </Field>
                    </>
                  ) : null}
                  {draft.tls && draft.transport === 'direct' ? (
                    <div className="notice notice--warning">
                      <AlertTriangle size={17} />
                      <p><strong>직접 HTTPS 연결은 브라우저의 인증서 신뢰 설정을 그대로 사용합니다.</strong> 웹 앱은 자체 서명 인증서를 허용하거나 지문을 고정할 수 없습니다.</p>
                    </div>
                  ) : null}
                  <div className="option-expectations">
                    <span className="field__label">앱 서버 옵션과 맞춤</span>
                    <p>웹에서 변경할 수 없는 Draw Things 앱 설정을 기록하는 체크리스트입니다.</p>
                    <Toggle label="브리지 모드" description="Draw Things의 원격 오프로딩 구성 여부" checked={draft.expectedBridgeMode} onChange={(value) => update('expectedBridgeMode', value)} />
                    <Toggle label="응답 압축" description="gRPC 압축 응답을 커넥터에서 해제" checked={draft.expectedResponseCompression} onChange={(value) => update('expectedResponseCompression', value)} />
                    <Toggle label="모델 탐색" description="Echo 메타데이터에서 모델·LoRA 목록 읽기" checked={draft.expectedModelBrowsing} onChange={(value) => update('expectedModelBrowsing', value)} />
                  </div>
                </div>
              ) : null}
            </section>

          </main>
        </div>

        <footer className="connection-panel__footer">
          <a href="https://docs.drawthings.ai/" target="_blank" rel="noreferrer">Draw Things 문서 <ExternalLink size={13} /></a>
          <div>
            <Button variant="ghost" onClick={onClose}>나중에</Button>
            <Button disabled={testing || draftTesting} onClick={runTest}>
              {testing || draftTesting ? <LoaderCircle className="spin" size={16} /> : draftResult?.ok ? <Check size={16} /> : <RefreshCw size={16} />}
              {testing || draftTesting ? '확인 중' : draftResult?.ok ? '연결 확인됨' : draftResult ? '다시 테스트' : '연결 테스트'}
            </Button>
            <Button variant="primary" disabled={!draftResult?.ok} onClick={saveAndClose}>
              <Check size={16} /> 이 설정 사용
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
