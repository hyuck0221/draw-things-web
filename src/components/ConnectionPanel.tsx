import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe2,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Server,
  Upload,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ConnectionTestResult } from '../domain/types'
import { apiRequestUrl, isVercelOrigin, normalizeTailscaleGatewayUrl } from '../lib/draw-things/endpoint'
import { Button, IconButton, TextInput } from './ui'

interface ConnectionPanelProps {
  open: boolean
  result: ConnectionTestResult | null
  testing: boolean
  backupBusy: boolean
  backupMessage: string
  backupError: boolean
  gatewayUrl: string
  onClose: () => void
  onRetry: () => void
  onGatewaySave: (gatewayUrl: string) => void
  onExportBackup: () => void
  onImportBackup: (file: File) => void
}

export function ConnectionPanel({
  open,
  result,
  testing,
  backupBusy,
  backupMessage,
  backupError,
  gatewayUrl,
  onClose,
  onRetry,
  onGatewaySave,
  onExportBackup,
  onImportBackup,
}: ConnectionPanelProps) {
  const backupInput = useRef<HTMLInputElement>(null)
  const [gatewayDraft, setGatewayDraft] = useState(gatewayUrl)
  if (!open) return null

  const origin = window.location.origin
  const apiOptionsRequestUrl = apiRequestUrl('/sdapi/v1/options', gatewayUrl)
  const optionsEndpoint = apiOptionsRequestUrl?.startsWith('/')
    ? new URL(apiOptionsRequestUrl, origin).toString()
    : apiOptionsRequestUrl
  const online = Boolean(result?.ok)
  const hostedOnVercel = isVercelOrigin()
  const savedGateway = normalizeTailscaleGatewayUrl(gatewayUrl)
  const normalizedGateway = normalizeTailscaleGatewayUrl(gatewayDraft)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!backupBusy && event.currentTarget === event.target) onClose()
    }}>
      <section className="api-status-dialog" role="dialog" aria-modal="true" aria-labelledby="api-status-title">
        <header className="api-status-dialog__header">
          <div className="api-status-dialog__icon"><Server size={21} /></div>
          <div>
            <span className="eyebrow">{hostedOnVercel ? 'TAILSCALE HTTPS GATEWAY' : 'SAME-ORIGIN API'}</span>
            <h2 id="api-status-title">Draw Things API 상태</h2>
            <p>{hostedOnVercel
              ? 'Vercel 화면은 Tailscale 내부 HTTPS 게이트웨이로만 API 요청을 보냅니다.'
              : '별도 연결 설정 없이 현재 사이트와 같은 주소로 통신합니다.'}</p>
          </div>
          <IconButton label="API 상태 닫기" disabled={backupBusy} onClick={onClose}><X size={18} /></IconButton>
        </header>

        <div className="api-status-dialog__body">
          {hostedOnVercel ? (
            <div className="api-origin-warning" role="alert">
              <AlertTriangle size={19} />
              <div>
                <strong>Tailscale HTTPS 게이트웨이를 연결하세요.</strong>
                <p>
                  Mac에서 Tailscale Serve를 켠 뒤 받은 <code>https://…ts.net</code> 주소를 저장하면,
                  이 Vercel 화면에서만 해당 주소로 생성 요청을 보냅니다.
                </p>
                <label className="gateway-url-field" htmlFor="tailscale-gateway-url">
                  <span>Mac의 Tailscale Serve URL</span>
                  <TextInput
                    id="tailscale-gateway-url"
                    value={gatewayDraft}
                    onChange={(event) => setGatewayDraft(event.target.value)}
                    placeholder="https://hshim.example.ts.net"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <small>HTTPS · <code>*.ts.net</code> · 경로와 인증 정보 없이 입력하세요. 이 주소는 이 브라우저에만 저장되며 백업에는 포함되지 않습니다.</small>
                </label>
                <div className="gateway-url-actions">
                  <Button
                    variant="primary"
                    disabled={!normalizedGateway || normalizedGateway === savedGateway}
                    onClick={() => {
                      if (normalizedGateway) onGatewaySave(normalizedGateway)
                    }}
                  >
                    게이트웨이 저장 · 연결 확인
                  </Button>
                  {savedGateway ? (
                    <Button variant="ghost" onClick={() => {
                      setGatewayDraft('')
                      onGatewaySave('')
                    }}>연결 해제</Button>
                  ) : null}
                </div>
                {gatewayDraft.trim() && !normalizedGateway ? <small className="gateway-url-error">Tailscale Serve의 HTTPS <code>*.ts.net</code> 기본 주소만 사용할 수 있습니다.</small> : null}
              </div>
            </div>
          ) : null}

          <dl className="api-endpoint-card">
            <div>
              <dt><Globe2 size={14} /> 현재 사이트</dt>
              <dd>{origin}</dd>
            </div>
            <div>
              <dt><Server size={14} /> API 확인 경로</dt>
              <dd>{optionsEndpoint ?? 'Tailscale HTTPS 게이트웨이 주소 설정 필요'}</dd>
            </div>
          </dl>

          <div className={`api-status-result ${backupMessage ? backupError ? 'is-error' : 'is-success' : 'is-checking'}`}>
            <span>
              {backupBusy ? <LoaderCircle className="spin" size={19} /> : <HardDrive size={19} />}
            </span>
            <div>
              <strong>로컬 데이터 백업 · origin 이동</strong>
              <p>
                {hostedOnVercel
                  ? '여기서 백업을 내려받은 뒤 Tailscale 주소의 같은 화면에서 가져오면 캔버스, 이미지와 설정을 옮길 수 있습니다.'
                  : '다른 주소에서 내려받은 백업을 가져오거나 현재 캔버스 전체를 JSON 파일로 보관할 수 있습니다.'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
                <Button variant="secondary" disabled={backupBusy} onClick={onExportBackup}>
                  <Download size={15} /> 백업 내보내기
                </Button>
                <Button variant="ghost" disabled={backupBusy} onClick={() => backupInput.current?.click()}>
                  <Upload size={15} /> 백업 가져오기
                </Button>
                <input
                  ref={backupInput}
                  hidden
                  type="file"
                  accept="application/json,.json"
                  aria-label="로컬 백업 파일 선택"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    if (file) onImportBackup(file)
                  }}
                />
              </div>
              {backupMessage ? (
                <small role={backupError ? 'alert' : 'status'}>{backupMessage}</small>
              ) : (
                <small>연결 주소나 인증 정보는 백업에 포함하지 않습니다. 최대 256 MiB</small>
              )}
            </div>
          </div>

          <div className={`api-status-result ${testing ? 'is-checking' : online ? 'is-success' : 'is-error'}`} role="status" aria-live="polite">
            <span>
              {testing
                ? <LoaderCircle className="spin" size={19} />
                : online ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
            </span>
            <div>
              <strong>
                {testing
                  ? 'Draw Things 연결을 확인하고 있습니다…'
                  : online ? 'Draw Things HTTP API에 연결됨' : 'Draw Things API에 연결되지 않음'}
              </strong>
              <p>{testing ? '잠시만 기다려 주세요.' : result?.message ?? '현재 사이트의 API 경로에서 응답을 받지 못했습니다.'}</p>
              {result ? <small>{result.endpoint} · {result.latencyMs} ms</small> : null}
              {result?.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
            </div>
          </div>

          {!hostedOnVercel && !online && !testing ? (
            <p className="api-status-help">
              Draw Things에서 HTTP API 모드를 켜고 Mac의 로컬 웹 서버를 실행한 뒤,
              Android에서는 <code>http://&lt;Mac의 Tailscale IP&gt;:5173</code>으로 접속하세요.
            </p>
          ) : null}
        </div>

        <footer className="api-status-dialog__footer">
          <small>{hostedOnVercel ? 'Vercel은 화면 파일만 제공합니다. 생성 데이터는 Tailscale을 통해 Mac으로 직접 전송됩니다.' : 'API 주소는 입력하거나 저장하지 않습니다.'}</small>
          <div>
            <Button variant="ghost" disabled={backupBusy} onClick={onClose}>닫기</Button>
            <Button variant="primary" disabled={testing || backupBusy || (hostedOnVercel && !savedGateway)} onClick={onRetry}>
              {testing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
              {testing ? '확인 중' : '다시 확인'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
