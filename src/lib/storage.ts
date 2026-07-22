import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CanvasItem,
  ConversationTurn,
  GenerationParameters,
  PersistedPreferences,
  WorkspaceSession,
} from '../domain/types'
import { DEFAULT_PREFERENCES } from './defaults'

const PREFERENCES_KEY = 'draw-things-local-canvas:preferences:v2'
const LEGACY_PREFERENCES_KEY = 'draw-things-local-canvas:preferences:v1'
const LEGACY_SECRET_KEY = 'draw-things-local-canvas:session-secret'
const DB_NAME = 'draw-things-local-canvas'
const WORKSPACE_REVISION_KEY = 'draw-things-local-canvas:workspace-revision'
const WORKSPACE_REVISION_RECORD = 'workspace-revision'
const PREFERENCES_SNAPSHOT_PREFIX = 'draw-things-local-canvas:preferences:revision:'
const INITIAL_WORKSPACE_REVISION = 1
const BACKUP_FORMAT = 'draw-things-local-canvas-backup'
const BACKUP_VERSION = 1

export const MAX_LOCAL_BACKUP_BYTES = 256 * 1024 * 1024

const MAX_BACKUP_SESSIONS = 500
const MAX_BACKUP_IMAGES = 10_000
const MAX_SESSION_ITEMS = 10_000
const MAX_SESSION_TURNS = 20_000
const MAX_PARAMETER_ENTRIES = 256
const MAX_COLLECTION_ENTRIES = 512
const MAX_RECORD_ENTRIES = 128
const MAX_IDENTIFIER_LENGTH = 256
const MAX_TEXT_LENGTH = 1024 * 1024
const MAX_IMAGE_DATA_URL_LENGTH = 128 * 1024 * 1024
const MAX_SAFE_COORDINATE = 1_000_000_000
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

type StoredCanvasItem = Omit<CanvasItem, 'dataUrl'> & { dataUrl?: string }
type StoredSession = Omit<WorkspaceSession, 'items'> & { items: StoredCanvasItem[] }

interface StoredImage {
  id: string
  sessionId: string
  dataUrl: string
}

interface LocalDataBackupV1 {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  sourceOrigin: string
  preferences: PersistedPreferences
  sessions: StoredSession[]
  images: StoredImage[]
}

type StoredPreferencesV2 = PersistedPreferences & { workspaceRevision: number }

export interface LocalDataBackupExport {
  json: string
  fileName: string
  sessionCount: number
  imageCount: number
}

export interface LocalDataBackupImportResult {
  preferences: PersistedPreferences
  sessionCount: number
  imageCount: number
  sourceOrigin: string
  revision: number
}

interface CanvasDatabase extends DBSchema {
  sessions: {
    key: string
    value: StoredSession
    indexes: { 'by-updated': number }
  }
  images: {
    key: string
    value: StoredImage
    indexes: { 'by-session': string }
  }
  metadata: {
    key: string
    value: number
  }
  preferences: {
    key: string
    value: StoredPreferencesV2
  }
}

let databasePromise: Promise<IDBPDatabase<CanvasDatabase>> | undefined
let activeDatabase: IDBPDatabase<CanvasDatabase> | undefined
const imageCache = new Map<string, string>()

function database() {
  if (!databasePromise) {
    let timedOut = false
    let timeout: number | undefined
    const opening = openDB<CanvasDatabase>(DB_NAME, 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' })
          store.createIndex('by-updated', 'updatedAt')
        }
        if (oldVersion < 2) {
          const images = db.createObjectStore('images', { keyPath: 'id' })
          images.createIndex('by-session', 'sessionId')
        }
        if (oldVersion < 3) {
          const metadata = db.createObjectStore('metadata')
          metadata.put(INITIAL_WORKSPACE_REVISION, WORKSPACE_REVISION_RECORD)
        }
        if (oldVersion < 4) db.createObjectStore('preferences')
      },
      blocking() {
        activeDatabase?.close()
        activeDatabase = undefined
        databasePromise = undefined
      },
      terminated() {
        activeDatabase = undefined
        databasePromise = undefined
      },
    })
    void opening.then((db) => {
      if (timedOut) db.close()
    }, () => {})
    const blockedTimeout = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        timedOut = true
        reject(new Error('다른 탭이 이전 저장소 버전을 사용 중입니다. 다른 탭을 닫고 다시 시도하세요.'))
      }, 5_000)
    })
    const pending = Promise.race([opening, blockedTimeout]).then((db) => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      activeDatabase = db
      return db
    }, (error: unknown) => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      if (databasePromise === pending) databasePromise = undefined
      throw error
    })
    databasePromise = pending
  }
  return databasePromise
}

function withoutImageData(session: WorkspaceSession): StoredSession {
  return {
    ...session,
    items: session.items.map((item) => {
      const metadata: Partial<CanvasItem> = { ...item }
      delete metadata.dataUrl
      return metadata as Omit<CanvasItem, 'dataUrl'>
    }),
  }
}

async function hydrateSession(
  db: IDBPDatabase<CanvasDatabase>,
  session: StoredSession,
): Promise<WorkspaceSession> {
  const items = await Promise.all(session.items.map(async (item) => {
    const { dataUrl: legacyDataUrl, ...metadata } = item
    const storedImage = await db.get('images', item.id)
    const dataUrl = storedImage?.dataUrl ?? legacyDataUrl ?? ''
    if (storedImage) imageCache.set(item.id, storedImage.dataUrl)
    else imageCache.delete(item.id)
    return { ...metadata, dataUrl }
  }))
  return { ...session, items }
}

function hydrateSessionsFromImages(
  sessions: StoredSession[],
  images: StoredImage[],
): WorkspaceSession[] {
  const byId = new Map(images.map((image) => [image.id, image.dataUrl]))
  return sessions.map((session) => ({
    ...session,
    items: session.items.map((item) => {
      const { dataUrl: legacyDataUrl, ...metadata } = item
      const storedDataUrl = byId.get(item.id)
      const dataUrl = storedDataUrl ?? legacyDataUrl ?? ''
      if (storedDataUrl) imageCache.set(item.id, storedDataUrl)
      else imageCache.delete(item.id)
      return { ...metadata, dataUrl }
    }),
  }))
}

export class WorkspaceRevisionError extends Error {
  constructor() {
    super('다른 탭에서 로컬 캔버스가 교체되었습니다. 이 탭을 새로고침한 뒤 다시 시도하세요.')
    this.name = 'WorkspaceRevisionError'
  }
}

export function readWorkspaceRevision(): number {
  try {
    const parsed = Number(localStorage.getItem(WORKSPACE_REVISION_KEY))
    if (Number.isSafeInteger(parsed) && parsed >= INITIAL_WORKSPACE_REVISION) return parsed
    localStorage.setItem(WORKSPACE_REVISION_KEY, String(INITIAL_WORKSPACE_REVISION))
  } catch {
    // IndexedDB remains authoritative when Local Storage is unavailable.
  }
  return INITIAL_WORKSPACE_REVISION
}

function assertWorkspaceRevision(actual: number | undefined, expected?: number) {
  const normalized = Number.isSafeInteger(actual) && Number(actual) >= INITIAL_WORKSPACE_REVISION
    ? Number(actual)
    : INITIAL_WORKSPACE_REVISION
  if (expected !== undefined && normalized !== expected) throw new WorkspaceRevisionError()
  return normalized
}

interface LegacyPreferencesV1 {
  version?: 1
  parameters?: PersistedPreferences['parameters']
  activeSessionId?: string
  negativePrompt?: string
  advancedPanelOpen?: boolean
  compactSidebar?: boolean
}

function mergePreferences(
  value: Partial<Omit<PersistedPreferences, 'version'>>,
): PersistedPreferences {
  return {
    version: 2,
    parameters: {
      ...DEFAULT_PREFERENCES.parameters,
      ...value.parameters,
    },
    ...(typeof value.activeSessionId === 'string'
      ? { activeSessionId: value.activeSessionId }
      : {}),
    ...(typeof value.hydratedApiOrigin === 'string'
      ? { hydratedApiOrigin: value.hydratedApiOrigin }
      : {}),
    negativePrompt: typeof value.negativePrompt === 'string'
      ? value.negativePrompt
      : DEFAULT_PREFERENCES.negativePrompt,
    advancedPanelOpen: typeof value.advancedPanelOpen === 'boolean'
      ? value.advancedPanelOpen
      : DEFAULT_PREFERENCES.advancedPanelOpen,
    compactSidebar: typeof value.compactSidebar === 'boolean'
      ? value.compactSidebar
      : DEFAULT_PREFERENCES.compactSidebar,
  }
}

function serializePreferences(
  preferences: PersistedPreferences,
  workspaceRevision = readWorkspaceRevision(),
): StoredPreferencesV2 {
  return { ...mergePreferences(preferences), workspaceRevision }
}

function storedPreferences(
  raw: string | null,
  expectedRevision: number,
): PersistedPreferences | undefined {
  if (!raw) return undefined
  const parsed = JSON.parse(raw) as Partial<StoredPreferencesV2>
  if (parsed.version !== 2) return undefined
  const revision = parsed.workspaceRevision
  if (revision !== expectedRevision
    && !(revision === undefined && expectedRevision === INITIAL_WORKSPACE_REVISION)) {
    return undefined
  }
  return mergePreferences(parsed)
}

function backupValidationError(message: string): Error {
  return new Error(`백업 파일이 올바르지 않습니다: ${message}`)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw backupValidationError(`${path} 항목은 객체여야 합니다.`)
  }
  return value as Record<string, unknown>
}

function checkedString(
  value: unknown,
  path: string,
  maximum = MAX_TEXT_LENGTH,
  allowEmpty = true,
): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maximum) {
    throw backupValidationError(`${path} 문자열의 형식이나 길이가 허용 범위를 벗어났습니다.`)
  }
  return value
}

function checkedIdentifier(value: unknown, path: string): string {
  return checkedString(value, path, MAX_IDENTIFIER_LENGTH, false)
}

function checkedNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
    || (integer && !Number.isInteger(value))
  ) {
    throw backupValidationError(`${path} 숫자가 허용 범위를 벗어났습니다.`)
  }
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  maximum = MAX_TEXT_LENGTH,
): string | undefined {
  const value = record[key]
  return value === undefined ? undefined : checkedString(value, `${path}.${key}`, maximum)
}

function sanitizeNestedJson(value: unknown, path: string, depth: number): unknown {
  if (depth > 4) throw backupValidationError(`${path} 구조가 지나치게 깊습니다.`)
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return checkedString(value, path)
  if (typeof value === 'number') {
    return checkedNumber(value, path, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ENTRIES) {
      throw backupValidationError(`${path} 배열 항목이 너무 많습니다.`)
    }
    return value.map((item, index) => sanitizeNestedJson(item, `${path}[${index}]`, depth + 1))
  }
  const record = asRecord(value, path)
  const entries = Object.entries(record)
  if (entries.length > MAX_RECORD_ENTRIES) {
    throw backupValidationError(`${path} 객체 항목이 너무 많습니다.`)
  }
  const safe: Record<string, unknown> = {}
  for (const [key, nested] of entries) {
    if (FORBIDDEN_KEYS.has(key) || key.length === 0 || key.length > 128) {
      throw backupValidationError(`${path}에 허용되지 않는 키가 있습니다.`)
    }
    safe[key] = sanitizeNestedJson(nested, `${path}.${key}`, depth + 1)
  }
  return safe
}

function sanitizeParameters(value: unknown): GenerationParameters {
  const record = asRecord(value, 'preferences.parameters')
  const entries = Object.entries(record)
  if (entries.length > MAX_PARAMETER_ENTRIES) {
    throw backupValidationError('생성 설정 항목이 너무 많습니다.')
  }
  const parameters: GenerationParameters = {}
  for (const [key, rawValue] of entries) {
    if (FORBIDDEN_KEYS.has(key) || key.length === 0 || key.length > 128) {
      throw backupValidationError('생성 설정에 허용되지 않는 키가 있습니다.')
    }
    if (typeof rawValue === 'string') {
      parameters[key] = checkedString(rawValue, `preferences.parameters.${key}`)
      continue
    }
    if (typeof rawValue === 'number') {
      parameters[key] = checkedNumber(
        rawValue,
        `preferences.parameters.${key}`,
        -Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      )
      continue
    }
    if (typeof rawValue === 'boolean') {
      parameters[key] = rawValue
      continue
    }
    if (!Array.isArray(rawValue) || rawValue.length > MAX_COLLECTION_ENTRIES) {
      throw backupValidationError(`preferences.parameters.${key} 값 형식이 잘못되었습니다.`)
    }
    const values = rawValue.map((item, index) => {
      const sanitized = sanitizeNestedJson(item, `preferences.parameters.${key}[${index}]`, 1)
      return asRecord(sanitized, `preferences.parameters.${key}[${index}]`)
    })
    parameters[key] = values as Array<Record<string, unknown>>
  }
  return parameters
}

function sanitizeBackupPreferences(value: unknown, targetOrigin: string): PersistedPreferences {
  const record = asRecord(value, 'preferences')
  if (record.version !== 2) {
    throw backupValidationError('지원하는 설정 버전은 v2입니다.')
  }
  const negativePrompt = checkedString(record.negativePrompt, 'preferences.negativePrompt')
  if (typeof record.advancedPanelOpen !== 'boolean' || typeof record.compactSidebar !== 'boolean') {
    throw backupValidationError('UI 설정 값이 올바르지 않습니다.')
  }
  const activeSessionId = record.activeSessionId === undefined
    ? undefined
    : checkedIdentifier(record.activeSessionId, 'preferences.activeSessionId')
  return mergePreferences({
    parameters: sanitizeParameters(record.parameters),
    ...(activeSessionId ? { activeSessionId } : {}),
    hydratedApiOrigin: checkedString(targetOrigin, 'targetOrigin', 2_048, false),
    negativePrompt,
    advancedPanelOpen: record.advancedPanelOpen,
    compactSidebar: record.compactSidebar,
  })
}

function sanitizeTurn(value: unknown, path: string): ConversationTurn {
  const record = asRecord(value, path)
  const role = record.role
  if (role !== 'user' && role !== 'assistant') {
    throw backupValidationError(`${path}.role 값이 올바르지 않습니다.`)
  }
  const status = record.status
  if (
    status !== undefined
    && status !== 'generating'
    && status !== 'complete'
    && status !== 'error'
    && status !== 'cancelled'
  ) {
    throw backupValidationError(`${path}.status 값이 올바르지 않습니다.`)
  }
  const imageIds = record.imageIds
  let safeImageIds: string[] | undefined
  if (imageIds !== undefined) {
    if (!Array.isArray(imageIds) || imageIds.length > MAX_SESSION_ITEMS) {
      throw backupValidationError(`${path}.imageIds 값이 올바르지 않습니다.`)
    }
    safeImageIds = imageIds.map((id, index) => checkedIdentifier(id, `${path}.imageIds[${index}]`))
  }
  const requestId = optionalString(record, 'requestId', path, MAX_IDENTIFIER_LENGTH)
  const effectivePrompt = optionalString(record, 'effectivePrompt', path)
  return {
    id: checkedIdentifier(record.id, `${path}.id`),
    role,
    content: checkedString(record.content, `${path}.content`),
    createdAt: checkedNumber(record.createdAt, `${path}.createdAt`, 0, 8_640_000_000_000_000),
    ...(requestId ? { requestId } : {}),
    ...(effectivePrompt !== undefined ? { effectivePrompt } : {}),
    ...(safeImageIds ? { imageIds: safeImageIds } : {}),
    ...(status ? { status } : {}),
  }
}

function sanitizeStoredItem(value: unknown, path: string): StoredCanvasItem {
  const record = asRecord(value, path)
  if (record.kind !== 'generated' && record.kind !== 'imported') {
    throw backupValidationError(`${path}.kind 값이 올바르지 않습니다.`)
  }
  const requestId = optionalString(record, 'requestId', path, MAX_IDENTIFIER_LENGTH)
  const negativePrompt = optionalString(record, 'negativePrompt', path)
  const parentId = optionalString(record, 'parentId', path, MAX_IDENTIFIER_LENGTH)
  const seed = record.seed === undefined
    ? undefined
    : checkedNumber(record.seed, `${path}.seed`, 0, 4_294_967_295, true)
  return {
    id: checkedIdentifier(record.id, `${path}.id`),
    ...(requestId ? { requestId } : {}),
    kind: record.kind,
    prompt: checkedString(record.prompt, `${path}.prompt`),
    ...(negativePrompt !== undefined ? { negativePrompt } : {}),
    x: checkedNumber(record.x, `${path}.x`, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
    y: checkedNumber(record.y, `${path}.y`, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
    width: checkedNumber(record.width, `${path}.width`, 1, MAX_SAFE_COORDINATE),
    height: checkedNumber(record.height, `${path}.height`, 1, MAX_SAFE_COORDINATE),
    sourceWidth: checkedNumber(record.sourceWidth, `${path}.sourceWidth`, 1, MAX_SAFE_COORDINATE),
    sourceHeight: checkedNumber(record.sourceHeight, `${path}.sourceHeight`, 1, MAX_SAFE_COORDINATE),
    createdAt: checkedNumber(record.createdAt, `${path}.createdAt`, 0, 8_640_000_000_000_000),
    ...(seed !== undefined ? { seed } : {}),
    ...(parentId ? { parentId } : {}),
  }
}

function sanitizeStoredSessions(value: unknown): {
  sessions: StoredSession[]
  itemOwners: Map<string, string>
} {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BACKUP_SESSIONS) {
    throw backupValidationError(`세션 수는 1–${MAX_BACKUP_SESSIONS}개여야 합니다.`)
  }
  const sessionIds = new Set<string>()
  const itemOwners = new Map<string, string>()
  const sessions = value.map((sessionValue, sessionIndex) => {
    const path = `sessions[${sessionIndex}]`
    const record = asRecord(sessionValue, path)
    const id = checkedIdentifier(record.id, `${path}.id`)
    if (sessionIds.has(id)) throw backupValidationError('중복된 세션 ID가 있습니다.')
    sessionIds.add(id)
    if (!Array.isArray(record.turns) || record.turns.length > MAX_SESSION_TURNS) {
      throw backupValidationError(`${path}.turns 항목이 너무 많거나 형식이 잘못되었습니다.`)
    }
    if (!Array.isArray(record.items) || record.items.length > MAX_SESSION_ITEMS) {
      throw backupValidationError(`${path}.items 항목이 너무 많거나 형식이 잘못되었습니다.`)
    }
    const turns = record.turns.map((turn, index) => sanitizeTurn(turn, `${path}.turns[${index}]`))
    const items = record.items.map((item, index) => {
      const sanitized = sanitizeStoredItem(item, `${path}.items[${index}]`)
      if (itemOwners.has(sanitized.id)) {
        throw backupValidationError('중복된 이미지 ID가 있습니다.')
      }
      itemOwners.set(sanitized.id, id)
      return sanitized
    })
    const selectedItemId = optionalString(record, 'selectedItemId', path, MAX_IDENTIFIER_LENGTH)
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      throw backupValidationError(`${path}.selectedItemId가 세션 이미지와 일치하지 않습니다.`)
    }
    const view = asRecord(record.view, `${path}.view`)
    if (typeof record.continuationEnabled !== 'boolean') {
      throw backupValidationError(`${path}.continuationEnabled 값이 올바르지 않습니다.`)
    }
    const draftPrompt = optionalString(record, 'draftPrompt', path)
    if (record.useSelectedImage !== undefined && typeof record.useSelectedImage !== 'boolean') {
      throw backupValidationError(`${path}.useSelectedImage 값이 올바르지 않습니다.`)
    }
    return {
      id,
      title: checkedString(record.title, `${path}.title`, 4_096),
      createdAt: checkedNumber(record.createdAt, `${path}.createdAt`, 0, 8_640_000_000_000_000),
      updatedAt: checkedNumber(record.updatedAt, `${path}.updatedAt`, 0, 8_640_000_000_000_000),
      turns,
      items,
      ...(selectedItemId ? { selectedItemId } : {}),
      view: {
        x: checkedNumber(view.x, `${path}.view.x`, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
        y: checkedNumber(view.y, `${path}.view.y`, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
        zoom: checkedNumber(view.zoom, `${path}.view.zoom`, 0.01, 100),
      },
      continuationEnabled: record.continuationEnabled,
      ...(draftPrompt !== undefined ? { draftPrompt } : {}),
      useSelectedImage: record.useSelectedImage === true,
    } satisfies StoredSession
  })
  return { sessions, itemOwners }
}

function checkedImageDataUrl(value: unknown, path: string): string {
  const dataUrl = checkedString(value, path, MAX_IMAGE_DATA_URL_LENGTH, false)
  const comma = dataUrl.indexOf(',')
  if (comma <= 0) throw backupValidationError(`${path} 이미지 데이터 형식이 잘못되었습니다.`)
  const header = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (
    !/^data:image\/[a-z0-9.+-]{1,64};base64$/i.test(header)
    || payload.length === 0
    || !/^[a-z0-9+/]*={0,2}$/i.test(payload)
  ) {
    throw backupValidationError(`${path} 이미지 데이터 형식이 잘못되었습니다.`)
  }
  return dataUrl
}

function sanitizeStoredImages(value: unknown, itemOwners: Map<string, string>): StoredImage[] {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_IMAGES) {
    throw backupValidationError(`이미지는 최대 ${MAX_BACKUP_IMAGES}개까지 가져올 수 있습니다.`)
  }
  const imageIds = new Set<string>()
  const images = value.map((imageValue, index) => {
    const path = `images[${index}]`
    const record = asRecord(imageValue, path)
    const id = checkedIdentifier(record.id, `${path}.id`)
    const sessionId = checkedIdentifier(record.sessionId, `${path}.sessionId`)
    if (imageIds.has(id)) throw backupValidationError('중복된 이미지 데이터 ID가 있습니다.')
    imageIds.add(id)
    if (itemOwners.get(id) !== sessionId) {
      throw backupValidationError(`${path}가 해당 세션의 캔버스 이미지와 일치하지 않습니다.`)
    }
    return {
      id,
      sessionId,
      dataUrl: checkedImageDataUrl(record.dataUrl, `${path}.dataUrl`),
    }
  })
  if (images.length !== itemOwners.size || [...itemOwners.keys()].some((id) => !imageIds.has(id))) {
    throw backupValidationError('캔버스 이미지 메타데이터와 이미지 데이터 수가 일치하지 않습니다.')
  }
  return images
}

function backupSize(serialized: string): number {
  if (serialized.length > MAX_LOCAL_BACKUP_BYTES) return serialized.length
  return new Blob([serialized]).size
}

export function parseLocalDataBackup(
  serialized: string,
  targetOrigin = window.location.origin,
): LocalDataBackupV1 {
  if (typeof serialized !== 'string' || serialized.length === 0) {
    throw backupValidationError('빈 파일입니다.')
  }
  if (backupSize(serialized) > MAX_LOCAL_BACKUP_BYTES) {
    throw backupValidationError('백업 파일이 256 MiB 제한을 초과했습니다.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw backupValidationError('JSON을 읽을 수 없습니다.')
  }
  const record = asRecord(parsed, 'backup')
  if (record.format !== BACKUP_FORMAT || record.version !== BACKUP_VERSION) {
    throw backupValidationError('지원하는 Draw Things Canvas 백업 파일이 아닙니다.')
  }
  const exportedAt = checkedString(record.exportedAt, 'exportedAt', 64, false)
  if (!Number.isFinite(Date.parse(exportedAt))) {
    throw backupValidationError('내보낸 날짜가 올바르지 않습니다.')
  }
  const sourceOrigin = checkedString(record.sourceOrigin, 'sourceOrigin', 2_048, false)
  const { sessions, itemOwners } = sanitizeStoredSessions(record.sessions)
  const images = sanitizeStoredImages(record.images, itemOwners)
  let preferences = sanitizeBackupPreferences(record.preferences, targetOrigin)
  const sessionIds = new Set(sessions.map((session) => session.id))
  if (!preferences.activeSessionId || !sessionIds.has(preferences.activeSessionId)) {
    preferences = { ...preferences, activeSessionId: sessions[0]!.id }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    sourceOrigin,
    preferences,
    sessions,
    images,
  }
}

function removeLegacyConnectionData() {
  try {
    localStorage.removeItem(LEGACY_PREFERENCES_KEY)
  } catch {
    // A successful v2 read remains usable even when legacy cleanup is blocked.
  }
  try {
    sessionStorage.removeItem(LEGACY_SECRET_KEY)
  } catch {
    // Some private-browsing modes expose sessionStorage but reject writes.
  }
}

export function loadPreferences(expectedRevision = readWorkspaceRevision()): PersistedPreferences {
  try {
    const current = storedPreferences(localStorage.getItem(PREFERENCES_KEY), expectedRevision)
    if (current) {
      return current
    }
    const importedSnapshot = storedPreferences(
      localStorage.getItem(`${PREFERENCES_SNAPSHOT_PREFIX}${expectedRevision}`),
      expectedRevision,
    )
    if (importedSnapshot) {
      return importedSnapshot
    }

    const legacyRaw = localStorage.getItem(LEGACY_PREFERENCES_KEY)
    if (!legacyRaw) return mergePreferences({})
    const legacy = JSON.parse(legacyRaw) as LegacyPreferencesV1
    if (legacy.version !== 1) return mergePreferences({})
    const migrated = mergePreferences({
      parameters: legacy.parameters,
      activeSessionId: legacy.activeSessionId,
      ...(legacy.parameters && typeof window !== 'undefined'
        ? { hydratedApiOrigin: window.location.origin }
        : {}),
      negativePrompt: legacy.negativePrompt,
      advancedPanelOpen: legacy.advancedPanelOpen,
      compactSidebar: legacy.compactSidebar,
    })
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(serializePreferences(migrated, expectedRevision)))
    return migrated
  } catch {
    return mergePreferences({})
  } finally {
    removeLegacyConnectionData()
  }
}

export async function savePreferences(preferences: PersistedPreferences, expectedRevision?: number) {
  const revision = expectedRevision ?? readWorkspaceRevision()
  const serialized = serializePreferences(preferences, revision)
  if (typeof indexedDB !== 'undefined') {
    const db = await database()
    const transaction = db.transaction(['metadata', 'preferences'], 'readwrite')
    try {
      assertWorkspaceRevision(
        await transaction.objectStore('metadata').get(WORKSPACE_REVISION_RECORD),
        revision,
      )
    } catch (error) {
      transaction.abort()
      try { await transaction.done } catch { /* Expected abort for a stale writer. */ }
      throw error
    }
    await transaction.objectStore('preferences').put(serialized, PREFERENCES_KEY)
    await transaction.done
  } else if (readWorkspaceRevision() !== revision) {
    throw new WorkspaceRevisionError()
  }
  if (readWorkspaceRevision() !== revision) {
    throw new WorkspaceRevisionError()
  }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(serialized))
  removeLegacyConnectionData()
}

export async function exportLocalDataBackup(
  preferences: PersistedPreferences,
  liveSessions: readonly WorkspaceSession[],
  expectedRevision?: number,
): Promise<LocalDataBackupExport> {
  for (const session of liveSessions) {
    await putSession(session, expectedRevision)
  }

  const db = await database()
  const transaction = db.transaction(['sessions', 'images', 'metadata'], 'readonly')
  const [storedSessions, storedImages, revision] = await Promise.all([
    transaction.objectStore('sessions').getAll(),
    transaction.objectStore('images').getAll(),
    transaction.objectStore('metadata').get(WORKSPACE_REVISION_RECORD),
  ])
  await transaction.done
  assertWorkspaceRevision(revision, expectedRevision)

  const { sessions, itemOwners } = sanitizeStoredSessions(storedSessions)
  const images = sanitizeStoredImages(storedImages, itemOwners)
  const origin = window.location.origin
  let safePreferences = sanitizeBackupPreferences(serializePreferences(preferences), origin)
  const sessionIds = new Set(sessions.map((session) => session.id))
  if (!safePreferences.activeSessionId || !sessionIds.has(safePreferences.activeSessionId)) {
    safePreferences = { ...safePreferences, activeSessionId: sessions[0]!.id }
  }

  const exportedAt = new Date().toISOString()
  const backup: LocalDataBackupV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    sourceOrigin: origin,
    preferences: safePreferences,
    sessions,
    images,
  }
  const json = JSON.stringify(backup)
  if (backupSize(json) > MAX_LOCAL_BACKUP_BYTES) {
    throw new Error('로컬 데이터가 256 MiB 백업 제한을 초과해 내보낼 수 없습니다.')
  }
  const fileStamp = exportedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return {
    json,
    fileName: `draw-things-canvas-backup_${fileStamp}.json`,
    sessionCount: sessions.length,
    imageCount: images.length,
  }
}

export async function importLocalDataBackup(
  serialized: string,
  expectedRevision = readWorkspaceRevision(),
): Promise<LocalDataBackupImportResult> {
  const backup = parseLocalDataBackup(serialized, window.location.origin)
  const previousRevision = expectedRevision
  const nextRevision = previousRevision + 1
  if (!Number.isSafeInteger(nextRevision)) {
    throw new Error('로컬 작업 버전을 더 이상 증가시킬 수 없습니다.')
  }

  try {
    const db = await database()
    const transaction = db.transaction(['sessions', 'images', 'metadata', 'preferences'], 'readwrite')
    const sessions = transaction.objectStore('sessions')
    const images = transaction.objectStore('images')
    const metadata = transaction.objectStore('metadata')
    const preferences = transaction.objectStore('preferences')
    let actualRevision: number
    try {
      actualRevision = assertWorkspaceRevision(
        await metadata.get(WORKSPACE_REVISION_RECORD),
        previousRevision,
      )
    } catch (error) {
      transaction.abort()
      try { await transaction.done } catch { /* Expected abort for a stale importer. */ }
      throw error
    }
    await sessions.clear()
    await images.clear()
    for (const session of backup.sessions) await sessions.put(session)
    for (const image of backup.images) await images.put(image)
    await preferences.put(serializePreferences(backup.preferences, nextRevision), PREFERENCES_KEY)
    await metadata.put(actualRevision + 1, WORKSPACE_REVISION_RECORD)
    await transaction.done
  } catch (error) {
    throw new Error('백업 데이터를 IndexedDB에 저장할 수 없습니다.', { cause: error })
  }

  try {
    // Publish the new revision before preferences so stale tabs fail their next save.
    const serializedPreferences = JSON.stringify(serializePreferences(backup.preferences, nextRevision))
    localStorage.setItem(`${PREFERENCES_SNAPSHOT_PREFIX}${nextRevision}`, serializedPreferences)
    localStorage.setItem(WORKSPACE_REVISION_KEY, String(nextRevision))
    localStorage.setItem(PREFERENCES_KEY, serializedPreferences)
  } catch {
    // The same settings are authoritative in IndexedDB; Local Storage is only a startup cache.
  }

  removeLegacyConnectionData()
  imageCache.clear()
  for (const image of backup.images) imageCache.set(image.id, image.dataUrl)
  return {
    preferences: backup.preferences,
    sessionCount: backup.sessions.length,
    imageCount: backup.images.length,
    sourceOrigin: backup.sourceOrigin,
    revision: nextRevision,
  }
}

export async function listSessionsWithRevision(retryAfterNewerCache = true): Promise<{
  sessions: WorkspaceSession[]
  revision: number
  preferences?: PersistedPreferences
}> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images', 'metadata', 'preferences'], 'readonly')
  const sessionsStore = transaction.objectStore('sessions')
  const [storedSessions, storedImages, storedRevision, persistedPreferences] = await Promise.all([
    sessionsStore.index('by-updated').getAll(),
    transaction.objectStore('images').getAll(),
    transaction.objectStore('metadata').get(WORKSPACE_REVISION_RECORD),
    transaction.objectStore('preferences').get(PREFERENCES_KEY),
  ])
  await transaction.done
  const revision = assertWorkspaceRevision(storedRevision)
  try {
    if (retryAfterNewerCache && readWorkspaceRevision() > revision) {
      return listSessionsWithRevision(false)
    }
    localStorage.setItem(WORKSPACE_REVISION_KEY, String(revision))
  } catch { /* IndexedDB is authoritative. */ }
  return {
    sessions: hydrateSessionsFromImages(storedSessions.reverse(), storedImages),
    revision,
    ...(persistedPreferences?.workspaceRevision === revision
      ? { preferences: mergePreferences(persistedPreferences) }
      : {}),
  }
}

export async function listSessions(): Promise<WorkspaceSession[]> {
  return (await listSessionsWithRevision()).sessions
}

export async function getSession(id: string): Promise<WorkspaceSession | undefined> {
  const db = await database()
  const session = await db.get('sessions', id)
  return session ? hydrateSession(db, session) : undefined
}

export async function putSession(session: WorkspaceSession, expectedRevision?: number): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images', 'metadata'], 'readwrite')
  try {
    assertWorkspaceRevision(
      await transaction.objectStore('metadata').get(WORKSPACE_REVISION_RECORD),
      expectedRevision,
    )
  } catch (error) {
    transaction.abort()
    try { await transaction.done } catch { /* Expected abort for a stale writer. */ }
    throw error
  }
  await transaction.objectStore('sessions').put(withoutImageData(session))
  const images = transaction.objectStore('images')
  const liveIds = new Set(session.items.map((item) => item.id))
  const storedIds = await images.index('by-session').getAllKeys(session.id)
  const deletedIds: string[] = []
  const updatedImages: Array<{ id: string; dataUrl: string }> = []
  for (const id of storedIds) {
    if (liveIds.has(String(id))) continue
    await images.delete(id)
    deletedIds.push(String(id))
  }
  for (const item of session.items) {
    if (imageCache.get(item.id) === item.dataUrl) continue
    await images.put({ id: item.id, sessionId: session.id, dataUrl: item.dataUrl })
    updatedImages.push({ id: item.id, dataUrl: item.dataUrl })
  }
  await transaction.done
  for (const id of deletedIds) imageCache.delete(id)
  for (const image of updatedImages) imageCache.set(image.id, image.dataUrl)
}

export async function deleteSession(id: string, expectedRevision?: number): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images', 'metadata'], 'readwrite')
  try {
    assertWorkspaceRevision(
      await transaction.objectStore('metadata').get(WORKSPACE_REVISION_RECORD),
      expectedRevision,
    )
  } catch (error) {
    transaction.abort()
    try { await transaction.done } catch { /* Expected abort for a stale writer. */ }
    throw error
  }
  const images = transaction.objectStore('images')
  const imageIds = await images.index('by-session').getAllKeys(id)
  for (const imageId of imageIds) {
    await images.delete(imageId)
  }
  await transaction.objectStore('sessions').delete(id)
  await transaction.done
  for (const imageId of imageIds) imageCache.delete(String(imageId))
}

export async function clearLocalWorkspace(expectedRevision = readWorkspaceRevision()): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images', 'metadata', 'preferences'], 'readwrite')
  const metadata = transaction.objectStore('metadata')
  let revision: number
  try {
    revision = assertWorkspaceRevision(
      await metadata.get(WORKSPACE_REVISION_RECORD),
      expectedRevision,
    )
  } catch (error) {
    transaction.abort()
    try { await transaction.done } catch { /* Expected abort for a stale clearer. */ }
    throw error
  }
  if (!Number.isSafeInteger(revision + 1)) {
    transaction.abort()
    try { await transaction.done } catch { /* Expected abort at the revision limit. */ }
    throw new Error('로컬 작업 버전을 더 이상 증가시킬 수 없습니다.')
  }
  await transaction.objectStore('sessions').clear()
  await transaction.objectStore('images').clear()
  await transaction.objectStore('preferences').clear()
  await metadata.put(revision + 1, WORKSPACE_REVISION_RECORD)
  await transaction.done
  try {
    localStorage.removeItem(PREFERENCES_KEY)
    localStorage.removeItem(`${PREFERENCES_SNAPSHOT_PREFIX}${revision}`)
    localStorage.setItem(WORKSPACE_REVISION_KEY, String(revision + 1))
  } catch { /* IndexedDB is authoritative. */ }
  removeLegacyConnectionData()
  imageCache.clear()
}
