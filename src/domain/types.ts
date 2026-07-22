export type ApiProtocol = 'http' | 'grpc'
export type TransportMode = 'bridge' | 'direct'
export type ConnectionPhase =
  | 'unconfigured'
  | 'requesting-permission'
  | 'connecting'
  | 'online'
  | 'degraded'
  | 'offline'
  | 'permission-denied'
  | 'cors-or-tls-blocked'
  | 'api-mismatch'

export interface ConnectionConfig {
  transport: TransportMode
  protocol: ApiProtocol
  host: string
  port: number
  tls: boolean
  apiBasePath: string
  sharedSecret: string
  rememberSecret: boolean
  clientName: string
  bridgeUrl: string
  bridgePairingToken: string
  allowSelfSignedCertificate: boolean
  tlsFingerprintSha256: string
  expectedBridgeMode: boolean
  expectedResponseCompression: boolean
  expectedModelBrowsing: boolean
}

export interface DrawThingsModel {
  file: string
  name?: string
  version?: string
  modifier?: string
  [key: string]: unknown
}

export interface ModelCatalogResult {
  ok: boolean
  models: DrawThingsModel[]
  source: 'grpc-echo' | 'local-metadata' | 'http-current' | 'combined' | 'none'
  checkedAt: number
  stale: boolean
  directoriesScanned: number
  warnings: string[]
}

export interface ServerCapabilities {
  protocol: ApiProtocol
  canGenerate: boolean
  canImageToImage: boolean
  canStreamProgress: boolean
  canCancel: boolean
  canBrowseModels: boolean
  requiresHttpModeForCanvas: boolean
  sharedSecretRequired: boolean
  models: DrawThingsModel[]
  loras: Array<Record<string, unknown>>
  controls: Array<Record<string, unknown>>
  textualInversions: Array<Record<string, unknown>>
  serverIdentifier?: string
  limitations: string[]
}

export interface ConnectionTestResult {
  ok: boolean
  latencyMs: number
  checkedAt: number
  phase: ConnectionPhase
  message: string
  endpoint: string
  serverMessage?: string
  capabilities: ServerCapabilities
  remoteOptions?: Record<string, unknown>
  diagnosticCode?: string
  warnings?: string[]
  certificate?: {
    fingerprintSha256?: string
    authorized?: boolean
    authorizationError?: string
    subject?: string
    issuer?: string
    validFrom?: string
    validTo?: string
  }
}

export interface DiscoveredEndpoint {
  id: string
  name: string
  protocol: ApiProtocol
  host: string
  port: number
  tls: boolean
  source: 'loopback' | 'bonjour' | 'manual'
  latencyMs: number
  message?: string
}

export type ParameterValue = string | number | boolean | Array<Record<string, unknown>>
export type GenerationParameters = Record<string, ParameterValue>
export type GenerationMode = 'txt2img' | 'img2img'

export interface GenerationRequest {
  id: string
  mode: GenerationMode
  prompt: string
  negativePrompt: string
  parameters: GenerationParameters
  initImage?: string
  maskImage?: string
}

export type GenerationEvent =
  | { type: 'accepted'; requestId: string; message: string }
  | { type: 'progress'; requestId: string; progress: number; step?: number; totalSteps?: number; message?: string }
  | { type: 'preview'; requestId: string; image: string }
  | { type: 'result'; requestId: string; images: string[]; durationMs: number }
  | { type: 'cancelled'; requestId: string; message: string }
  | { type: 'error'; requestId: string; message: string; code?: string }

export interface CanvasItem {
  id: string
  requestId?: string
  kind: 'generated' | 'imported'
  dataUrl: string
  prompt: string
  negativePrompt?: string
  x: number
  y: number
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  createdAt: number
  seed?: number
  parentId?: string
}

export interface ConversationTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  requestId?: string
  effectivePrompt?: string
  imageIds?: string[]
  status?: 'generating' | 'complete' | 'error' | 'cancelled'
}

export interface CanvasView {
  x: number
  y: number
  zoom: number
}

export interface WorkspaceSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: ConversationTurn[]
  items: CanvasItem[]
  selectedItemId?: string
  view: CanvasView
  continuationEnabled: boolean
  draftPrompt?: string
  useSelectedImage?: boolean
}

export interface PersistedPreferences {
  version: 1
  connectionConfigured: boolean
  connection: ConnectionConfig
  parameters: GenerationParameters
  activeSessionId?: string
  hydratedConnectionKey?: string
  negativePrompt: string
  advancedPanelOpen: boolean
  compactSidebar: boolean
}

export interface BridgeHealth {
  ok: boolean
  name: string
  version: string
  paired: boolean
  allowedOrigin?: string
}
