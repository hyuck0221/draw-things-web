export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const

export type LoopbackHost = (typeof LOOPBACK_HOSTS)[number]
export type DrawThingsProtocol = 'http' | 'grpc'

export interface ConnectionInput {
  protocol: DrawThingsProtocol
  host?: string
  port?: number
  tls?: boolean
  verifyTls?: boolean
  tlsFingerprintSha256?: string
  sharedSecret?: string
  clientName?: string
  timeoutMs?: number
}

export interface NormalizedConnection {
  protocol: DrawThingsProtocol
  host: LoopbackHost
  port: number
  tls: boolean
  verifyTls: boolean
  tlsFingerprintSha256?: string
  sharedSecret?: string
  clientName: string
  timeoutMs: number
}

export interface CertificateInfo {
  fingerprintSha256?: string
  authorized?: boolean
  authorizationError?: string
  subject?: string
  issuer?: string
  validFrom?: string
  validTo?: string
}

export interface EchoMetadata {
  models: unknown
  loras: unknown
  controlNets: unknown
  textualInversions: unknown
  upscalers: unknown
}

export interface EchoReplyDecoded {
  message: string
  files: string[]
  metadata: EchoMetadata
  sharedSecretMissing: boolean
  thresholds?: {
    community: number
    plus: number
    expireAt: number | string
  }
  serverIdentifier: string
}

export interface ProbeSuccess {
  ok: true
  protocol: DrawThingsProtocol
  latencyMs: number
  connection: Omit<NormalizedConnection, 'sharedSecret'> & { hasSharedSecret: boolean }
  capabilities: {
    options: boolean
    modelBrowsing: boolean
    generation: boolean
    generationTransport: 'http' | null
    txt2img: boolean
    img2img: boolean
    reason?: string
  }
  options?: Record<string, unknown>
  echo?: EchoReplyDecoded
  certificate?: CertificateInfo
  warnings: string[]
}

export interface ProbeFailure {
  ok: false
  protocol: DrawThingsProtocol
  latencyMs: number
  connection: Omit<NormalizedConnection, 'sharedSecret'> & { hasSharedSecret: boolean }
  error: {
    code: string
    message: string
    status?: number
    details?: unknown
  }
  certificate?: CertificateInfo
  warnings: string[]
}

export type ProbeResult = ProbeSuccess | ProbeFailure

export class BridgeError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.status = status
    this.details = details
  }
}
