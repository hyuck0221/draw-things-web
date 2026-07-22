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
import { useRef } from 'react'
import type { ConnectionTestResult } from '../domain/types'
import { Button, IconButton } from './ui'

interface ConnectionPanelProps {
  open: boolean
  result: ConnectionTestResult | null
  testing: boolean
  backupBusy: boolean
  backupMessage: string
  backupError: boolean
  onClose: () => void
  onRetry: () => void
  onExportBackup: () => void
  onImportBackup: (file: File) => void
}

function isVercelOrigin() {
  return window.location.hostname === 'vercel.app'
    || window.location.hostname.endsWith('.vercel.app')
}

export function ConnectionPanel({
  open,
  result,
  testing,
  backupBusy,
  backupMessage,
  backupError,
  onClose,
  onRetry,
  onExportBackup,
  onImportBackup,
}: ConnectionPanelProps) {
  const backupInput = useRef<HTMLInputElement>(null)
  if (!open) return null

  const origin = window.location.origin
  const optionsEndpoint = new URL('/sdapi/v1/options', origin).toString()
  const online = Boolean(result?.ok)
  const hostedOnVercel = isVercelOrigin()

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!backupBusy && event.currentTarget === event.target) onClose()
    }}>
      <section className="api-status-dialog" role="dialog" aria-modal="true" aria-labelledby="api-status-title">
        <header className="api-status-dialog__header">
          <div className="api-status-dialog__icon"><Server size={21} /></div>
          <div>
            <span className="eyebrow">SAME-ORIGIN API</span>
            <h2 id="api-status-title">Draw Things API 상태</h2>
            <p>별도 연결 설정 없이 현재 사이트와 같은 주소로 통신합니다.</p>
          </div>
          <IconButton label="API 상태 닫기" disabled={backupBusy} onClick={onClose}><X size={18} /></IconButton>
        </header>

        <div className="api-status-dialog__body">
          {hostedOnVercel ? (
            <div className="api-origin-warning" role="alert">
              <AlertTriangle size={19} />
              <div>
                <strong>Vercel 주소에서는 로컬 이미지를 생성할 수 없습니다.</strong>
                <p>
                  Mac에서 이 프로젝트의 로컬 웹 서버를 실행한 뒤 Android에서 Mac의 Tailscale IP와
                  5173 포트로 접속하세요. 화면과 Draw Things API가 같은 주소에서 제공됩니다.
                </p>
                <code>http://&lt;Mac의 Tailscale IP&gt;:5173</code>
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
              <dd>{optionsEndpoint}</dd>
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
          <small>API 주소는 입력하거나 저장하지 않습니다.</small>
          <div>
            <Button variant="ghost" disabled={backupBusy} onClick={onClose}>닫기</Button>
            <Button variant="primary" disabled={testing || backupBusy || hostedOnVercel} onClick={onRetry}>
              {testing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
              {testing ? '확인 중' : '다시 확인'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
