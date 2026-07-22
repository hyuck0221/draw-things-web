import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CanvasItem, PersistedPreferences, WorkspaceSession } from '../domain/types'
import { DEFAULT_PREFERENCES } from './defaults'

const PREFERENCES_KEY = 'draw-things-local-canvas:preferences:v1'
const SECRET_KEY = 'draw-things-local-canvas:session-secret'
const DB_NAME = 'draw-things-local-canvas'

type StoredCanvasItem = Omit<CanvasItem, 'dataUrl'> & { dataUrl?: string }
type StoredSession = Omit<WorkspaceSession, 'items'> & { items: StoredCanvasItem[] }

interface StoredImage {
  id: string
  sessionId: string
  dataUrl: string
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
}

let databasePromise: Promise<IDBPDatabase<CanvasDatabase>> | undefined
let activeDatabase: IDBPDatabase<CanvasDatabase> | undefined
const imageCache = new Map<string, string>()

function database() {
  if (!databasePromise) {
    let timedOut = false
    let timeout: number | undefined
    const opening = openDB<CanvasDatabase>(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' })
          store.createIndex('by-updated', 'updatedAt')
        }
        if (oldVersion < 2) {
          const images = db.createObjectStore('images', { keyPath: 'id' })
          images.createIndex('by-session', 'sessionId')
        }
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

function mergePreferences(value: Partial<PersistedPreferences>): PersistedPreferences {
  let sessionSecret = ''
  try {
    sessionSecret = sessionStorage.getItem(SECRET_KEY) ?? ''
  } catch {
    // Storage availability is reported by the caller's next persistence attempt.
  }
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    version: 1,
    connection: {
      ...DEFAULT_PREFERENCES.connection,
      ...value.connection,
      sharedSecret:
        value.connection?.sharedSecret || sessionSecret,
    },
    parameters: {
      ...DEFAULT_PREFERENCES.parameters,
      ...value.parameters,
    },
  }
}

export function loadPreferences(): PersistedPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return mergePreferences({})
    const parsed = JSON.parse(raw) as Partial<PersistedPreferences>
    if (parsed.version !== 1) return mergePreferences({})
    return mergePreferences(parsed)
  } catch {
    return mergePreferences({})
  }
}

export function savePreferences(preferences: PersistedPreferences) {
  const { connection } = preferences
  if (connection.sharedSecret) {
    sessionStorage.setItem(SECRET_KEY, connection.sharedSecret)
  } else {
    sessionStorage.removeItem(SECRET_KEY)
  }
  const persisted = {
    ...preferences,
    connection: {
      ...connection,
      sharedSecret: connection.rememberSecret ? connection.sharedSecret : '',
    },
  }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(persisted))
}

export async function listSessions(): Promise<WorkspaceSession[]> {
  const db = await database()
  const sessions = await db.getAllFromIndex('sessions', 'by-updated')
  return Promise.all(sessions.reverse().map((session) => hydrateSession(db, session)))
}

export async function getSession(id: string): Promise<WorkspaceSession | undefined> {
  const db = await database()
  const session = await db.get('sessions', id)
  return session ? hydrateSession(db, session) : undefined
}

export async function putSession(session: WorkspaceSession): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images'], 'readwrite')
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

export async function deleteSession(id: string): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['sessions', 'images'], 'readwrite')
  const images = transaction.objectStore('images')
  const imageIds = await images.index('by-session').getAllKeys(id)
  for (const imageId of imageIds) {
    await images.delete(imageId)
  }
  await transaction.objectStore('sessions').delete(id)
  await transaction.done
  for (const imageId of imageIds) imageCache.delete(String(imageId))
}

export async function clearLocalWorkspace(): Promise<void> {
  localStorage.removeItem(PREFERENCES_KEY)
  sessionStorage.removeItem(SECRET_KEY)
  const db = await database()
  const transaction = db.transaction(['sessions', 'images'], 'readwrite')
  await transaction.objectStore('sessions').clear()
  await transaction.objectStore('images').clear()
  await transaction.done
  imageCache.clear()
}
