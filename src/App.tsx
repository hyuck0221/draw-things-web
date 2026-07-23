import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConnectionPanel } from './components/ConnectionPanel'
import { ConversationPanel } from './components/ConversationPanel'
import { InfiniteCanvas } from './components/InfiniteCanvas'
import { InspectorPanel } from './components/InspectorPanel'
import { PromptDock } from './components/PromptDock'
import { SessionRail } from './components/SessionRail'
import { SettingsPanel } from './components/SettingsPanel'
import { TopBar } from './components/TopBar'
import { IconButton } from './components/ui'
import type {
  CanvasItem,
  DrawThingsModel,
  GenerationEvent,
  GenerationMode,
  GenerationParameters,
  ParameterValue,
  PersistedPreferences,
} from './domain/types'
import { useConnectionMonitor } from './hooks/useConnectionMonitor'
import { useWorkspace } from './hooks/useWorkspace'
import {
  generate,
  listInstalledModels,
  normalizeGeneratedImage,
} from './lib/draw-things/client'
import { DEFAULT_PARAMETERS } from './lib/defaults'
import { apiConnectionOrigin, shouldOpenInitialConnectionDialog } from './lib/draw-things/endpoint'
import { PARAMETER_DEFINITIONS } from './lib/draw-things/parameters'
import { randomUuid } from './lib/ids'
import { composeEffectivePrompt } from './lib/prompt'
import {
  exportLocalDataBackup,
  importLocalDataBackup,
  loadPreferences,
  MAX_LOCAL_BACKUP_BYTES,
  savePreferences,
} from './lib/storage'

interface GenerationState {
  active: boolean
  cancellable: boolean
  requestId?: string
  sessionId?: string
  message: string
  preview?: string
}

const IDLE_GENERATION: GenerationState = {
  active: false,
  cancellable: false,
  message: '',
}

const MAXIMUM_DIMENSION = 8_192
const MAXIMUM_BATCH_COUNT = 100
const MAXIMUM_BATCH_SIZE = 4
const MAXIMUM_OUTPUT_IMAGES = MAXIMUM_BATCH_COUNT * MAXIMUM_BATCH_SIZE
const MAXIMUM_TOTAL_PIXELS = 8_192 * 8_192
const MAXIMUM_INIT_IMAGE_CHARACTERS = 120 * 1024 * 1024

interface PendingReferenceImage {
  sessionId: string
  name: string
  dataUrl: string
  width: number
  height: number
}

function dataUrlDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = dataUrl
  })
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('이미지 파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function displayDimensions(width: number, height: number) {
  const scale = Math.min(1, 420 / Math.max(width, height))
  return { width: Math.max(120, Math.round(width * scale)), height: Math.max(120, Math.round(height * scale)) }
}

function nextItemPosition(items: CanvasItem[], width: number, height: number, index = 0) {
  if (items.length === 0) return { x: index * (width + 36), y: 0 }
  const maxX = Math.max(...items.map((item) => item.x + item.width))
  const minY = Math.min(...items.map((item) => item.y))
  const column = index % 2
  const row = Math.floor(index / 2)
  return { x: maxX + 72 + column * (width + 36), y: minY + row * (height + 36) }
}

function makeTitle(prompt: string) {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact || '새 캔버스'
}

export default function App() {
  const [preferences, setPreferences] = useState<PersistedPreferences>(() => loadPreferences())
  const hydratedPreferencesRevision = useRef<number | undefined>(undefined)
  const [preferencesReadyRevision, setPreferencesReadyRevision] = useState<number | undefined>(undefined)
  const workspace = useWorkspace(preferences.activeSessionId)
  const [apiStatusOpen, setApiStatusOpen] = useState(
    () => shouldOpenInitialConnectionDialog(preferences.apiGatewayUrl),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [generationState, setGenerationState] = useState<GenerationState>(IDLE_GENERATION)
  const [installedModels, setInstalledModels] = useState<DrawThingsModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsMessage, setModelsMessage] = useState('')
  const [modelsError, setModelsError] = useState(false)
  const [alert, setAlert] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  const [attachedImage, setAttachedImage] = useState<PendingReferenceImage | null>(null)
  const [attachmentLoading, setAttachmentLoading] = useState(false)
  const [preferenceStorageError, setPreferenceStorageError] = useState<string | null>(null)
  const [backupState, setBackupState] = useState<{
    busy: boolean
    message: string
    error: boolean
  }>({ busy: false, message: '', error: false })
  const cancelledRequests = useRef(new Set<string>())
  const generationLock = useRef(false)
  const terminalRequest = useRef<string | null>(null)
  const modelRequestSequence = useRef(0)
  const modelRefreshInFlight = useRef<Promise<void> | null>(null)
  const modelCatalogLoadedOrigin = useRef<string | null>(null)
  const apiOrigin = apiConnectionOrigin(preferences.apiGatewayUrl)

  const mergeRemoteOptions = useCallback((remote: Record<string, unknown>) => {
    const validKeys = new Set(PARAMETER_DEFINITIONS.map((definition) => definition.key))
    const remoteModel = typeof remote.model === 'string' ? remote.model.trim() : ''
    if (remoteModel) {
      setInstalledModels((current) => current.some((model) => model.file === remoteModel)
        ? current
        : [{ file: remoteModel, name: remoteModel, source: 'http-current' }, ...current])
      if (modelCatalogLoadedOrigin.current !== apiOrigin) {
        setModelsMessage('Draw Things에서 현재 선택한 모델입니다.')
        setModelsError(false)
      }
    }
    setPreferences((current) => {
      if (current.hydratedApiOrigin === apiOrigin) return current
      const updates: GenerationParameters = {}
      for (const [key, value] of Object.entries(remote)) {
        if (!validKeys.has(key) || key === 'prompt' || key === 'negative_prompt' || value === null) continue
        if (['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value)) {
          updates[key] = value as ParameterValue
        }
      }
      const nextParameters = { ...current.parameters, ...updates }
      return {
        ...current,
        parameters: nextParameters,
        hydratedApiOrigin: apiOrigin,
      }
    })
  }, [apiOrigin])

  const preferencesReady = !workspace.loading && preferencesReadyRevision === workspace.revision
  const monitor = useConnectionMonitor({
    busy: generationState.active || !preferencesReady,
    gatewayUrl: preferences.apiGatewayUrl,
    onRemoteOptions: mergeRemoteOptions,
  })

  useEffect(() => {
    if (workspace.loading || hydratedPreferencesRevision.current === workspace.revision) return
    hydratedPreferencesRevision.current = workspace.revision
    setPreferences(workspace.persistedPreferences ?? loadPreferences(workspace.revision))
    setPreferencesReadyRevision(workspace.revision)
  }, [workspace.loading, workspace.persistedPreferences, workspace.revision])

  useEffect(() => {
    if (workspace.loading || preferencesReadyRevision !== workspace.revision) return
    const timeout = window.setTimeout(() => {
      void savePreferences({
          ...preferences,
          activeSessionId: workspace.activeId || preferences.activeSessionId,
        }, workspace.revision).then(() => {
        setPreferenceStorageError(null)
      }, (error: unknown) => {
        const detail = error instanceof Error ? ` (${error.message})` : ''
        setPreferenceStorageError(`생성 설정을 브라우저에 저장할 수 없습니다${detail}`)
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [preferences, preferencesReadyRevision, workspace.activeId, workspace.loading, workspace.revision])

  useEffect(() => {
    if (alert?.kind !== 'success') return
    const currentAlert = alert
    const timeout = window.setTimeout(() => {
      setAlert((current) => current === currentAlert ? null : current)
    }, 3_500)
    return () => window.clearTimeout(timeout)
  }, [alert])

  const activeSession = workspace.activeSession
  const prompt = activeSession?.draftPrompt ?? ''
  const useSelected = Boolean(activeSession?.useSelectedImage)
  const selected = activeSession?.items.find((item) => item.id === activeSession.selectedItemId)
  const sessionAttachment = attachedImage && attachedImage.sessionId === activeSession?.id ? attachedImage : undefined
  const referenceImage = sessionAttachment ?? (selected && useSelected ? {
    name: '선택한 캔버스 이미지',
    dataUrl: selected.dataUrl,
    width: selected.sourceWidth,
    height: selected.sourceHeight,
    itemId: selected.id,
  } : undefined)
  const mode: GenerationMode = referenceImage ? 'img2img' : 'txt2img'
  const online = monitor.phase === 'online' && Boolean(monitor.result?.ok)
  const capabilities = monitor.result?.capabilities
  const selectedModel = String(preferences.parameters.model ?? '').trim()
  const canGenerate = Boolean(capabilities?.canGenerate
    && selectedModel
    && (mode === 'txt2img' || capabilities.canImageToImage))
  const models = useMemo(() => {
    const merged = new Map<string, DrawThingsModel>()
    for (const model of installedModels) {
      if (!model.file) continue
      merged.set(model.file, model)
    }
    const current = String(preferences.parameters.model ?? '').trim()
    if (current && !merged.has(current)) merged.set(current, { file: current, name: current })
    return [...merged.values()]
  }, [installedModels, preferences.parameters.model])

  const refreshModels = useCallback((syncSelection = false) => {
    if (generationLock.current) {
      setModelsMessage('이미지 생성이 끝난 뒤 현재 모델을 다시 확인할 수 있습니다.')
      return Promise.resolve()
    }
    const sequence = ++modelRequestSequence.current
    setModelsLoading(true)
    const operation = (async () => {
      try {
        const result = await listInstalledModels(
          String(preferences.parameters.model ?? ''),
          preferences.apiGatewayUrl,
        )
        if (modelRequestSequence.current !== sequence) return
        setInstalledModels(result.models)
        const currentModel = result.currentModel
        if (syncSelection && currentModel) {
          setPreferences((current) => String(current.parameters.model ?? '') === currentModel
            ? current
            : { ...current, parameters: { ...current.parameters, model: currentModel } })
        }
        setModelsMessage(result.warnings[0] ?? (result.models.length
          ? `Draw Things에 설치된 주 모델 ${result.models.length}개를 확인했습니다.`
          : 'Draw Things에서 선택한 모델을 확인하지 못했습니다.'))
        setModelsError(!result.ok || result.stale || result.warnings.length > 0)
      } catch (error) {
        if (modelRequestSequence.current !== sequence) return
        setInstalledModels([])
        setModelsMessage(error instanceof Error ? error.message : '현재 모델을 읽지 못했습니다.')
        setModelsError(true)
      } finally {
        if (modelRequestSequence.current === sequence) setModelsLoading(false)
      }
    })()
    modelRefreshInFlight.current = operation
    void operation.finally(() => {
      if (modelRefreshInFlight.current === operation) modelRefreshInFlight.current = null
    })
    return operation
  }, [preferences.apiGatewayUrl, preferences.parameters.model])

  const refreshCurrentModel = useCallback(() => {
    void refreshModels(true)
  }, [refreshModels])

  useEffect(() => {
    if (!online || generationState.active
      || modelCatalogLoadedOrigin.current === apiOrigin) return
    modelCatalogLoadedOrigin.current = apiOrigin
    void refreshModels(false)
  }, [apiOrigin, generationState.active, online, refreshModels])

  const changeModel = (nextFile: string) => {
    setPreferences((current) => ({
      ...current,
      parameters: { ...current.parameters, model: nextFile },
    }))
  }

  const updateParameter = (key: string, value: ParameterValue) => {
    if (key === 'model' && typeof value === 'string') {
      changeModel(value)
      return
    }
    setPreferences((current) => ({ ...current, parameters: { ...current.parameters, [key]: value } }))
  }

  const updateActive = workspace.updateActive

  const importImage = (dataUrl: string, dimensions: { width: number; height: number }) => {
    if (!activeSession) return
    const display = displayDimensions(dimensions.width, dimensions.height)
    const position = nextItemPosition(activeSession.items, display.width, display.height)
    const item: CanvasItem = {
      id: randomUuid(),
      kind: 'imported',
      dataUrl,
      prompt: '가져온 이미지',
      ...position,
      ...display,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      createdAt: Date.now(),
    }
    updateActive((session) => ({
      ...session,
      items: [...session.items, item],
      selectedItemId: item.id,
      useSelectedImage: true,
    }))
  }

  const attachReferenceImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAlert({ kind: 'error', message: '이미지 파일만 참고용으로 첨부할 수 있습니다.' })
      return
    }
    if (file.size === 0 || file.size > 90 * 1024 * 1024) {
      setAlert({ kind: 'error', message: '참고 이미지는 비어 있지 않아야 하며 90 MiB 이하여야 합니다.' })
      return
    }
    setAttachmentLoading(true)
    try {
      const dataUrl = await readImageFile(file)
      if (dataUrl.length > MAXIMUM_INIT_IMAGE_CHARACTERS) {
        throw new Error('참고 이미지가 안전한 요청 크기 제한을 초과했습니다.')
      }
      const dimensions = await dataUrlDimensions(dataUrl)
      if (!dimensions.width || !dimensions.height) throw new Error('이미지 크기를 읽지 못했습니다.')
      if (!activeSession) return
      setAttachedImage({ sessionId: activeSession.id, name: file.name || '참고 이미지', dataUrl, ...dimensions })
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : '참고 이미지를 첨부하지 못했습니다.' })
    } finally {
      setAttachmentLoading(false)
    }
  }

  const failTurn = (sessionId: string, requestId: string, message: string) => {
    workspace.updateSession(sessionId, (session) => ({
      ...session,
      updatedAt: Date.now(),
      turns: session.turns.map((turn) => turn.requestId === requestId && turn.role === 'assistant'
        ? { ...turn, content: message, status: 'error' }
        : turn),
    }))
  }

  const applyGenerationResult = async (
    event: Extract<GenerationEvent, { type: 'result' }>,
    sessionId: string,
    requestPrompt: string,
    negativePrompt: string,
    parentId: string | undefined,
    requestParameters: GenerationParameters,
  ) => {
    const session = workspace.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return
    const normalized = event.images.map(normalizeGeneratedImage)
    const nodes: CanvasItem[] = []
    for (const [index, image] of normalized.entries()) {
      let source = { width: Number(requestParameters.width), height: Number(requestParameters.height) }
      try { source = await dataUrlDimensions(image) } catch { /* use requested dimensions */ }
      const display = displayDimensions(source.width, source.height)
      const position = nextItemPosition([...session.items, ...nodes], display.width, display.height, index)
      nodes.push({
        id: randomUuid(),
        requestId: event.requestId,
        kind: 'generated',
        dataUrl: image,
        prompt: requestPrompt,
        negativePrompt,
        ...position,
        ...display,
        sourceWidth: source.width,
        sourceHeight: source.height,
        createdAt: Date.now(),
        seed: Number(requestParameters.seed) >= 0 ? Number(requestParameters.seed) : undefined,
        parentId,
      })
    }
    workspace.updateSession(sessionId, (current) => ({
      ...current,
      title: current.turns.length <= 2 && current.title === '새 캔버스' ? makeTitle(requestPrompt) : current.title,
      updatedAt: Date.now(),
      items: [...current.items, ...nodes],
      selectedItemId: nodes.at(-1)?.id,
      draftPrompt: '',
      useSelectedImage: false,
      turns: current.turns.map((turn) => turn.requestId === event.requestId && turn.role === 'assistant'
        ? { ...turn, content: `${nodes.length}개 이미지 생성 완료 · ${(event.durationMs / 1000).toFixed(1)}초`, imageIds: nodes.map((node) => node.id), status: 'complete' }
        : turn),
    }))
  }

  const markTurnCancelled = (sessionId: string, requestId: string, message: string) => {
    workspace.updateSession(sessionId, (session) => ({
      ...session,
      updatedAt: Date.now(),
      turns: session.turns.map((turn) => turn.requestId === requestId && turn.role === 'assistant'
        ? { ...turn, content: message, status: 'cancelled' }
        : turn),
    }))
  }

  const startGeneration = async () => {
    if (!activeSession || !prompt.trim() || attachmentLoading || generationState.active || generationLock.current) return
    const requestAttachment = sessionAttachment
    const requestSelected = !requestAttachment && selected && useSelected ? selected : undefined
    const requestReference = requestAttachment ?? (requestSelected ? {
      name: '선택한 캔버스 이미지',
      dataUrl: requestSelected.dataUrl,
      width: requestSelected.sourceWidth,
      height: requestSelected.sourceHeight,
      itemId: requestSelected.id,
    } : undefined)
    const requestMode: GenerationMode = requestReference ? 'img2img' : 'txt2img'
    generationLock.current = true
    try {
      await modelRefreshInFlight.current
      const live = await monitor.test()
      if (!live.ok || !live.capabilities.canGenerate) {
        setAlert({ kind: 'error', message: live.ok ? '연결은 됐지만 현재 API 설정으로는 이미지를 생성할 수 없습니다.' : live.message })
        setApiStatusOpen(true)
        return
      }
      if (requestMode === 'img2img' && !live.capabilities.canImageToImage) {
        setAlert({ kind: 'error', message: '현재 Draw Things HTTP API에서 선택 이미지로 이어 그리기(img2img)를 사용할 수 없습니다.' })
        return
      }
      const requestId = randomUuid()
      const sessionId = activeSession.id
      const effectivePrompt = composeEffectivePrompt(activeSession, prompt)
      const requestParameters: GenerationParameters = {
        ...preferences.parameters,
        // A newly attached reference can have any native size. Keep the chosen output
        // size instead of turning a small phone/photo thumbnail into an invalid request.
        ...(requestSelected ? { width: requestSelected.sourceWidth, height: requestSelected.sourceHeight } : {}),
      }
      const width = Number(requestParameters.width)
      const height = Number(requestParameters.height)
      const batchCount = Number(requestParameters.batch_count)
      const batchSize = Number(requestParameters.batch_size)
      const upscaler = String(requestParameters.upscaler ?? '').trim()
      const upscalerScale = Number(requestParameters.upscaler_scale ?? 0)
      const outputScale = upscaler && upscalerScale > 1 ? upscalerScale : 1
      const outputImages = batchCount * batchSize
      const totalPixels = width * height * outputImages * outputScale * outputScale
      if (!String(requestParameters.model ?? '').trim()) {
        setAlert({ kind: 'error', message: 'Draw Things 생성 모델을 먼저 선택하세요.' })
        return
      }
      if (width < 128 || height < 128 || width > MAXIMUM_DIMENSION || height > MAXIMUM_DIMENSION) {
        setAlert({ kind: 'error', message: `이미지 너비와 높이는 128–${MAXIMUM_DIMENSION} 범위여야 합니다.` })
        return
      }
      if (!Number.isInteger(batchCount) || !Number.isInteger(batchSize)
        || batchCount < 1 || batchCount > MAXIMUM_BATCH_COUNT
        || batchSize < 1 || batchSize > MAXIMUM_BATCH_SIZE
        || outputImages > MAXIMUM_OUTPUT_IMAGES) {
        setAlert({ kind: 'error', message: `한 요청에서는 배치 반복 × 배치 크기로 최대 ${MAXIMUM_OUTPUT_IMAGES}개 이미지를 생성할 수 있습니다.` })
        return
      }
      if (!Number.isSafeInteger(totalPixels) || totalPixels > MAXIMUM_TOTAL_PIXELS) {
        setAlert({ kind: 'error', message: '배치와 업스케일을 포함한 총 출력 해상도는 8192×8192 픽셀 예산을 넘을 수 없습니다.' })
        return
      }
      if (requestReference && requestReference.dataUrl.length > MAXIMUM_INIT_IMAGE_CHARACTERS) {
        setAlert({ kind: 'error', message: '참고 이미지가 안전한 요청 크기 제한을 초과했습니다.' })
        return
      }
      if (requestMode === 'txt2img' && (width % 64 !== 0 || height % 64 !== 0)) {
        setAlert({ kind: 'error', message: '텍스트 생성 크기는 Draw Things 블록에 맞게 64의 배수로 설정하세요.' })
        return
      }
      const now = Date.now()
      const attachmentItem = requestAttachment ? (() => {
        const display = displayDimensions(requestAttachment.width, requestAttachment.height)
        return {
          id: randomUuid(),
          kind: 'imported' as const,
          dataUrl: requestAttachment.dataUrl,
          prompt: `참고 이미지 · ${requestAttachment.name}`,
          ...nextItemPosition(activeSession.items, display.width, display.height),
          ...display,
          sourceWidth: requestAttachment.width,
          sourceHeight: requestAttachment.height,
          createdAt: now,
        }
      })() : undefined
      const referenceItemId = attachmentItem?.id ?? requestSelected?.id
      workspace.updateSession(sessionId, (session) => ({
        ...session,
        updatedAt: now,
        ...(attachmentItem ? { items: [...session.items, attachmentItem], selectedItemId: attachmentItem.id } : {}),
        turns: [
          ...session.turns,
          {
            id: randomUuid(), role: 'user', content: prompt.trim(), effectivePrompt, createdAt: now, requestId,
            ...(attachmentItem ? { attachmentIds: [attachmentItem.id] } : {}),
          },
          { id: randomUuid(), role: 'assistant', content: '생성 요청을 준비하고 있습니다…', createdAt: now, requestId, status: 'generating' },
        ],
      }))
      if (requestAttachment) setAttachedImage(null)
      setGenerationState({ active: true, cancellable: true, requestId, sessionId, message: '요청을 전송하고 결과를 기다리고 있습니다…' })
      cancelledRequests.current.delete(requestId)
      terminalRequest.current = null
      try {
        let terminalEventReceived = false
        const stream = generate({
          id: requestId,
          mode: requestMode,
          prompt: effectivePrompt,
          negativePrompt: preferences.negativePrompt,
          parameters: requestParameters,
          initImage: requestReference?.dataUrl,
        }, undefined, preferences.apiGatewayUrl)
        for await (const event of stream) {
          if (cancelledRequests.current.has(requestId)) break
          if (event.type === 'accepted') {
            setGenerationState((current) => ({ ...current, message: event.message }))
          } else if (event.type === 'progress') {
            setGenerationState((current) => ({ ...current, message: event.message ?? 'Draw Things가 이미지를 처리하고 있습니다…' }))
          } else if (event.type === 'preview') {
            setGenerationState((current) => ({ ...current, preview: normalizeGeneratedImage(event.image) }))
          } else if (event.type === 'result') {
            terminalEventReceived = true
            terminalRequest.current = requestId
            setGenerationState((current) => ({ ...current, cancellable: false, message: '결과를 캔버스에 추가하는 중입니다…' }))
            await applyGenerationResult(event, sessionId, effectivePrompt, preferences.negativePrompt, referenceItemId, requestParameters)
            setAlert({ kind: 'success', message: `${event.images.length}개 이미지를 캔버스에 추가했습니다.` })
          } else if (event.type === 'cancelled') {
            terminalEventReceived = true
            terminalRequest.current = requestId
            setGenerationState((current) => ({ ...current, cancellable: false }))
            markTurnCancelled(sessionId, requestId, event.message)
          } else if (event.type === 'error') {
            terminalEventReceived = true
            terminalRequest.current = requestId
            setGenerationState((current) => ({ ...current, cancellable: false }))
            throw new Error(event.message)
          }
        }
        if (!terminalEventReceived && !cancelledRequests.current.has(requestId)) {
          throw new Error('생성 스트림이 결과 없이 종료되었습니다.')
        }
      } catch (error) {
        if (!cancelledRequests.current.has(requestId)) {
          const message = error instanceof Error ? error.message : '이미지 생성에 실패했습니다.'
          failTurn(sessionId, requestId, message)
          setAlert({ kind: 'error', message })
        }
      } finally {
        if (terminalRequest.current === requestId) terminalRequest.current = null
        cancelledRequests.current.delete(requestId)
        setGenerationState(IDLE_GENERATION)
      }
    } finally {
      generationLock.current = false
    }
  }

  const cancel = () => {
    const requestId = generationState.requestId
    const sessionId = generationState.sessionId
    if (!requestId || terminalRequest.current === requestId || cancelledRequests.current.has(requestId)) return
    cancelledRequests.current.add(requestId)
    setGenerationState((current) => ({ ...current, cancellable: false, message: '결과를 폐기했습니다. Draw Things 작업 종료를 기다립니다…' }))
    if (sessionId) {
      markTurnCancelled(sessionId, requestId, '결과를 폐기했습니다. Draw Things 앱 내부 작업이 끝나면 다음 생성을 시작할 수 있습니다.')
    }
    setAlert({ kind: 'error', message: '이 결과는 캔버스에 추가하지 않습니다. Draw Things 작업 종료까지 잠시 기다려 주세요.' })
  }

  const exportBackup = async () => {
    if (generationState.active || backupState.busy) {
      setBackupState({ busy: false, message: '이미지 생성이 끝난 뒤 로컬 백업을 내보내세요.', error: true })
      return
    }
    setBackupState({ busy: true, message: '로컬 캔버스와 이미지를 백업하는 중입니다…', error: false })
    try {
      const backup = await exportLocalDataBackup({
        ...preferences,
        activeSessionId: workspace.activeId || preferences.activeSessionId,
      }, workspace.sessions, workspace.revision)
      const url = URL.createObjectURL(new Blob([backup.json], { type: 'application/json' }))
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = backup.fileName
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      const message = `백업을 저장했습니다. 세션 ${backup.sessionCount}개 · 이미지 ${backup.imageCount}개`
      setBackupState({ busy: false, message, error: false })
      setAlert({ kind: 'success', message })
    } catch (error) {
      const message = error instanceof Error ? error.message : '로컬 백업을 만들지 못했습니다.'
      setBackupState({ busy: false, message, error: true })
      setAlert({ kind: 'error', message })
    }
  }

  const importBackup = async (file: File) => {
    if (generationState.active || backupState.busy) {
      setBackupState({ busy: false, message: '이미지 생성이 끝난 뒤 백업을 가져오세요.', error: true })
      return
    }
    if (file.size === 0 || file.size > MAX_LOCAL_BACKUP_BYTES) {
      setBackupState({ busy: false, message: '백업 파일은 비어 있지 않아야 하며 256 MiB 이하여야 합니다.', error: true })
      return
    }
    if (!window.confirm('현재 이 주소에 저장된 모든 캔버스, 이미지와 생성 설정을 백업 내용으로 교체할까요?')) {
      setBackupState({ busy: false, message: '백업 가져오기를 취소했습니다.', error: false })
      return
    }
    setBackupState({ busy: true, message: '백업 파일을 검사하고 로컬 저장소로 옮기는 중입니다…', error: false })
    let persistencePaused = false
    try {
      const serialized = await file.text()
      await workspace.pausePersistence()
      persistencePaused = true
      const imported = await importLocalDataBackup(serialized, workspace.revision)
      const message = `백업을 가져왔습니다. 세션 ${imported.sessionCount}개 · 이미지 ${imported.imageCount}개 · 화면을 다시 엽니다.`
      setBackupState({ busy: true, message, error: false })
      setAlert({ kind: 'success', message })
      window.setTimeout(() => window.location.reload(), 600)
    } catch (error) {
      if (persistencePaused) workspace.resumePersistence()
      const message = error instanceof Error ? error.message : '백업 파일을 가져오지 못했습니다.'
      setBackupState({ busy: false, message, error: true })
      setAlert({ kind: 'error', message })
    }
  }

  const deleteSession = async (id: string) => {
    const session = workspace.sessions.find((candidate) => candidate.id === id)
    if (!session) return
    if (!window.confirm(`“${session.title}” 세션과 로컬 이미지를 완전히 삭제할까요?`)) return
    await workspace.deleteSession(id)
  }

  if (workspace.storageError && (workspace.loading || !activeSession)) {
    return (
      <div className="app-loading app-loading--error">
        <span><AlertTriangle size={22} /></span>
        <strong>로컬 저장소를 열 수 없습니다</strong>
        <p>{workspace.storageError}</p>
        <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>다시 시도</button>
      </div>
    )
  }

  if (workspace.loading || !activeSession) {
    return <div className="app-loading"><span><LoaderCircle className="spin" size={22} /></span><strong>로컬 캔버스를 여는 중</strong></div>
  }

  return (
    <div className="app-shell">
      <TopBar sessionTitle={activeSession.title} storageError={workspace.storageError ?? preferenceStorageError} phase={monitor.phase} result={monitor.result} generating={generationState.active} onOpenStatus={() => setApiStatusOpen(true)} onOpenConversation={() => setConversationOpen(true)} />
      <div className="workspace-layout">
        <SessionRail sessions={workspace.sessions} activeId={workspace.activeId} collapsed={preferences.compactSidebar} onCollapsedChange={(compactSidebar) => setPreferences((current) => ({ ...current, compactSidebar }))} onCreate={workspace.addSession} onSelect={workspace.setActiveId} onDelete={deleteSession} />
        <main className="canvas-column">
          <InfiniteCanvas
            session={activeSession}
            preview={generationState.preview}
            generating={generationState.active}
            onViewChange={(view) => updateActive((session) => ({ ...session, view }))}
            onSelect={(selectedItemId) => updateActive((session) => ({ ...session, selectedItemId }))}
            onImport={importImage}
          />
          <ConversationPanel open={conversationOpen} session={activeSession} onClose={() => setConversationOpen(false)} />
          <PromptDock
            prompt={prompt}
            negativePrompt={preferences.negativePrompt}
            continuation={activeSession.continuationEnabled}
            selected={selected}
            attachment={sessionAttachment}
            attachmentLoading={attachmentLoading}
            useSelected={useSelected}
            online={online}
            canGenerate={canGenerate}
            generating={generationState.active}
            cancellable={generationState.cancellable}
            statusMessage={generationState.message}
            steps={Number(preferences.parameters.steps ?? 0)}
            model={String(preferences.parameters.model ?? '')}
            models={models}
            modelsLoading={modelsLoading}
            modelsMessage={modelsMessage}
            modelsError={modelsError}
            onPromptChange={(draftPrompt) => updateActive((session) => ({ ...session, draftPrompt }))}
            onNegativePromptChange={(negativePrompt) => setPreferences((current) => ({ ...current, negativePrompt }))}
            onContinuationChange={(continuationEnabled) => updateActive((session) => ({ ...session, continuationEnabled }))}
            onUseSelectedChange={(useSelectedImage) => updateActive((session) => ({ ...session, useSelectedImage }))}
            onAttachmentSelect={(file) => { void attachReferenceImage(file) }}
            onAttachmentRemove={() => setAttachedImage(null)}
            onSubmit={startGeneration}
            onCancel={cancel}
            onOpenStatus={() => setApiStatusOpen(true)}
            onModelChange={changeModel}
            onRefreshModels={refreshCurrentModel}
            onOpenSettings={() => setSettingsOpen(true)}
            onSetRecommendedSteps={() => updateParameter('steps', 20)}
          />
        </main>
        <InspectorPanel selected={selected} parameters={preferences.parameters} models={models} modelsLoading={modelsLoading} modelsMessage={modelsMessage} onRefreshModels={refreshCurrentModel} onChange={updateParameter} onOpenAll={() => setSettingsOpen(true)} onUseSelected={() => updateActive((session) => ({ ...session, useSelectedImage: !session.useSelectedImage }))} useSelected={useSelected} />
      </div>

      <SettingsPanel open={settingsOpen} mode={mode} values={preferences.parameters} models={models} onChange={updateParameter} onClose={() => setSettingsOpen(false)} onReset={() => setPreferences((current) => ({ ...current, parameters: { ...DEFAULT_PARAMETERS, model: current.parameters.model ?? '' } }))} />
      {apiStatusOpen ? (
        <ConnectionPanel
          open
          result={monitor.result}
          testing={monitor.testing}
          backupBusy={backupState.busy}
          backupMessage={backupState.message}
          backupError={backupState.error}
          gatewayUrl={preferences.apiGatewayUrl ?? ''}
          onClose={() => setApiStatusOpen(false)}
          onRetry={() => { void monitor.test() }}
          onGatewaySave={(apiGatewayUrl) => {
            modelCatalogLoadedOrigin.current = null
            setInstalledModels([])
            setModelsMessage('')
            setModelsError(false)
            setPreferences((current) => ({
              ...current,
              ...(apiGatewayUrl ? { apiGatewayUrl } : { apiGatewayUrl: undefined }),
            }))
          }}
          onExportBackup={() => { void exportBackup() }}
          onImportBackup={(file) => { void importBackup(file) }}
        />
      ) : null}

      {alert ? (
        <div className={`app-toast app-toast--${alert.kind}`} role="status">
          {alert.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{alert.message}</span>
          <IconButton label="알림 닫기" onClick={() => setAlert(null)}><X size={14} /></IconButton>
        </div>
      ) : null}
    </div>
  )
}
