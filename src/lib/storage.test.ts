import { beforeEach, describe, expect, it } from 'vitest'
import type { ConversationTurn, PersistedPreferences } from '../domain/types'
import { DEFAULT_PARAMETERS } from './defaults'
import { loadPreferences, parseLocalDataBackup, savePreferences } from './storage'

const V1_KEY = 'draw-things-local-canvas:preferences:v1'
const V2_KEY = 'draw-things-local-canvas:preferences:v2'
const SECRET_KEY = 'draw-things-local-canvas:session-secret'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

describe('preference storage migration', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    })
  })

  it('keeps canvas preferences while dropping obsolete connection fields', () => {
    localStorage.setItem(V1_KEY, JSON.stringify({
      version: 1,
      connectionConfigured: true,
      connection: {
        obsoleteEndpoint: 'http://127.0.0.1:9999',
        obsoleteAuthToken: 'legacy-token',
        sharedSecret: 'legacy-secret',
      },
      parameters: { ...DEFAULT_PARAMETERS, width: 768, model: 'kept.ckpt' },
      activeSessionId: 'kept-session',
      negativePrompt: 'kept negative prompt',
      advancedPanelOpen: true,
      compactSidebar: true,
    }))
    sessionStorage.setItem(SECRET_KEY, 'legacy-secret')

    const migrated = loadPreferences()

    expect(migrated).toMatchObject({
      version: 2,
      activeSessionId: 'kept-session',
      hydratedApiOrigin: window.location.origin,
      negativePrompt: 'kept negative prompt',
      advancedPanelOpen: true,
      compactSidebar: true,
      parameters: { width: 768, model: 'kept.ckpt' },
    })
    expect(localStorage.getItem(V1_KEY)).toBeNull()
    expect(sessionStorage.getItem(SECRET_KEY)).toBeNull()
    expect(localStorage.getItem(V2_KEY)).not.toContain('legacy-token')
    expect(localStorage.getItem(V2_KEY)).not.toContain('legacy-secret')
  })

  it('serializes a validated local gateway URL but drops unsupported connection fields', async () => {
    const preferences = {
      version: 2,
      parameters: { ...DEFAULT_PARAMETERS, steps: 24 },
      apiGatewayUrl: 'https://hshim.taila7bd14.ts.net/',
      negativePrompt: '',
      advancedPanelOpen: false,
      compactSidebar: false,
      obsoleteConnection: { token: 'must-not-persist' },
    } as PersistedPreferences & { obsoleteConnection: { token: string } }

    await savePreferences(preferences)

    const raw = localStorage.getItem(V2_KEY) ?? ''
    expect(JSON.parse(raw)).toMatchObject({
      version: 2,
      workspaceRevision: 1,
      parameters: { steps: 24 },
      apiGatewayUrl: 'https://hshim.taila7bd14.ts.net',
    })
    expect(raw).not.toContain('connection')
    expect(raw).not.toContain('must-not-persist')
  })

  it('always removes invalid or orphaned obsolete connection data', () => {
    localStorage.setItem(V1_KEY, '{invalid-json')
    sessionStorage.setItem(SECRET_KEY, 'orphaned-secret')

    expect(loadPreferences()).toMatchObject({ version: 2 })
    expect(localStorage.getItem(V1_KEY)).toBeNull()
    expect(sessionStorage.getItem(SECRET_KEY)).toBeNull()
  })
})

const backupImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl+AAAAAASUVORK5CYII='

function validBackup() {
  return {
    format: 'draw-things-local-canvas-backup',
    version: 1,
    exportedAt: '2026-07-22T00:00:00.000Z',
    sourceOrigin: 'https://draw-things-web.vercel.app',
    preferences: {
      version: 2,
      parameters: { ...DEFAULT_PARAMETERS, width: 768 },
      activeSessionId: 'session-1',
      hydratedApiOrigin: 'https://draw-things-web.vercel.app',
      apiGatewayUrl: 'https://must-not-be-exported.taila7bd14.ts.net',
      negativePrompt: 'old negative',
      advancedPanelOpen: true,
      compactSidebar: false,
      obsoleteConnection: { token: 'must-be-removed' },
    },
    sessions: [{
      id: 'session-1',
      title: '옮길 캔버스',
      createdAt: 1,
      updatedAt: 2,
      turns: [] as ConversationTurn[],
      items: [{
        id: 'image-1',
        kind: 'generated',
        prompt: 'violet forest',
        x: 0,
        y: 0,
        width: 120,
        height: 120,
        sourceWidth: 1,
        sourceHeight: 1,
        createdAt: 2,
      }],
      selectedItemId: 'image-1',
      view: { x: 0, y: 0, zoom: 1 },
      continuationEnabled: true,
      draftPrompt: '',
      useSelectedImage: false,
    }],
    images: [{ id: 'image-1', sessionId: 'session-1', dataUrl: backupImage }],
  }
}

describe('portable local backup validation', () => {
  it('preserves reference-image attachments in conversation turns', () => {
    const backup = validBackup()
    backup.sessions[0]!.turns = [{
      id: 'turn-1', role: 'user', content: '이 분위기를 참고해줘', createdAt: 3,
      attachmentIds: ['image-1'],
    }]

    expect(parseLocalDataBackup(JSON.stringify(backup)).sessions[0]?.turns[0]).toMatchObject({
      attachmentIds: ['image-1'],
    })
  })

  it('sanitizes preferences and hydrates them for the importing origin', () => {
    const parsed = parseLocalDataBackup(
      JSON.stringify(validBackup()),
      'http://100.121.194.59:5173',
    )

    expect(parsed.preferences).toMatchObject({
      version: 2,
      activeSessionId: 'session-1',
      hydratedApiOrigin: 'http://100.121.194.59:5173',
      negativePrompt: 'old negative',
      parameters: { width: 768 },
    })
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.images).toHaveLength(1)
    expect(JSON.stringify(parsed.preferences)).not.toContain('obsoleteConnection')
    expect(JSON.stringify(parsed.preferences)).not.toContain('connection')
    expect(parsed.preferences.apiGatewayUrl).toBeUndefined()
  })

  it('rejects image data that does not belong to a canvas item', () => {
    const backup = validBackup()
    backup.images[0]!.sessionId = 'different-session'

    expect(() => parseLocalDataBackup(JSON.stringify(backup))).toThrow(/일치하지 않습니다/)
  })

  it('rejects excessive collections before importing them', () => {
    const backup = validBackup()
    backup.sessions = Array.from({ length: 501 }, () => ({})) as typeof backup.sessions

    expect(() => parseLocalDataBackup(JSON.stringify(backup))).toThrow(/세션 수는 1–500개/)
  })

  it('rejects overlong preference text', () => {
    const backup = validBackup()
    backup.preferences.negativePrompt = 'x'.repeat(1024 * 1024 + 1)

    expect(() => parseLocalDataBackup(JSON.stringify(backup))).toThrow(/문자열의 형식이나 길이/)
  })
})
