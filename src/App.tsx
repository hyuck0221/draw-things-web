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
  BridgeHealth,
  CanvasItem,
  ConnectionConfig,
  DiscoveredEndpoint,
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
  bridgeHealth,
  cancelGeneration,
  discoverEndpoints,
  generate,
  listInstalledModels,
  normalizeGeneratedImage,
  testConnection,
} from './lib/draw-things/client'
import { createPairingToken, DEFAULT_PARAMETERS } from './lib/defaults'
import { PARAMETER_DEFINITIONS } from './lib/draw-things/parameters'
import { randomUuid } from './lib/ids'
import { composeEffectivePrompt } from './lib/prompt'
import { loadPreferences, savePreferences } from './lib/storage'

interface GenerationState {
  active: boolean
  cancellable: boolean
  requestId?: string
  sessionId?: string
  progress: number
  message: string
  preview?: string
}

const IDLE_GENERATION: GenerationState = {
  active: false,
  cancellable: false,
  progress: 0,
  message: '',
}

function dataUrlDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = dataUrl
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

function connectionIdentity(connection: ConnectionConfig) {
  return [
    connection.transport,
    connection.protocol,
    connection.host,
    connection.port,
    connection.tls ? 'tls' : 'plain',
    connection.apiBasePath,
    connection.bridgeUrl,
  ].join('|')
}

export default function App() {
  const [preferences, setPreferences] = useState<PersistedPreferences>(() => {
    const loaded = loadPreferences()
    if (loaded.connection.bridgePairingToken) return loaded
    return {
      ...loaded,
      connection: {
        ...loaded.connection,
        bridgePairingToken: createPairingToken(),
      },
    }
  })
  const workspace = useWorkspace(preferences.activeSessionId)
  const [connectionOpen, setConnectionOpen] = useState(!preferences.connectionConfigured)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [bridge, setBridge] = useState<BridgeHealth | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredEndpoint[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [generationState, setGenerationState] = useState<GenerationState>(IDLE_GENERATION)
  const [installedModels, setInstalledModels] = useState<DrawThingsModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsMessage, setModelsMessage] = useState('')
  const [modelsError, setModelsError] = useState(false)
  const [alert, setAlert] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  const [preferenceStorageError, setPreferenceStorageError] = useState<string | null>(null)
  const cancelledRequests = useRef(new Set<string>())
  const generationLock = useRef(false)
  const generationAbortController = useRef<AbortController | null>(null)
  const terminalRequest = useRef<string | null>(null)
  const modelRequestSequence = useRef(0)

  const mergeRemoteOptions = useCallback((remote: Record<string, unknown>) => {
    const validKeys = new Set(PARAMETER_DEFINITIONS.map((definition) => definition.key))
    setPreferences((current) => {
      const identity = connectionIdentity(current.connection)
      if (current.hydratedConnectionKey === identity) return current
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
        hydratedConnectionKey: identity,
      }
    })
  }, [])

  const monitor = useConnectionMonitor({
    connection: preferences.connection,
    enabled: preferences.connectionConfigured,
    busy: generationState.active,
    onRemoteOptions: mergeRemoteOptions,
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        savePreferences({
          ...preferences,
          activeSessionId: workspace.activeId || preferences.activeSessionId,
        })
        setPreferenceStorageError(null)
      } catch (error) {
        const detail = error instanceof Error ? ` (${error.message})` : ''
        setPreferenceStorageError(`연결·생성 설정을 브라우저에 저장할 수 없습니다${detail}`)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [preferences, workspace.activeId])

  useEffect(() => {
    if (!preferences.connectionConfigured || preferences.connection.transport !== 'bridge') {
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const next = await bridgeHealth(preferences.connection)
        if (!cancelled) setBridge(next)
      } catch {
        if (!cancelled) setBridge(null)
      }
    }
    void check()
    const interval = window.setInterval(check, 5_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [preferences.connection, preferences.connectionConfigured])

  const activeSession = workspace.activeSession
  const prompt = activeSession?.draftPrompt ?? ''
  const useSelected = Boolean(activeSession?.useSelectedImage)
  const selected = activeSession?.items.find((item) => item.id === activeSession.selectedItemId)
  const mode: GenerationMode = selected && useSelected ? 'img2img' : 'txt2img'
  const online = monitor.phase === 'online' && Boolean(monitor.result?.ok)
  const canGenerate = Boolean(monitor.result?.capabilities.canGenerate)
  const models = useMemo(() => {
    const merged = new Map<string, DrawThingsModel>()
    for (const model of [...installedModels, ...(monitor.result?.capabilities.models ?? [])]) {
      if (model.file) merged.set(model.file, model)
    }
    const current = String(preferences.parameters.model ?? '').trim()
    if (current && !merged.has(current)) merged.set(current, { file: current, name: current })
    return [...merged.values()]
  }, [installedModels, monitor.result?.capabilities.models, preferences.parameters.model])

  const refreshModels = useCallback(async () => {
    const sequence = ++modelRequestSequence.current
    setModelsLoading(true)
    try {
      const result = await listInstalledModels(
        preferences.connection,
        String(preferences.parameters.model ?? ''),
      )
      if (modelRequestSequence.current !== sequence) return
      setInstalledModels(result.models)
      setModelsMessage(result.warnings[0] ?? `${result.models.length}개 설치 모델을 확인했습니다.`)
      setModelsError(false)
    } catch (error) {
      if (modelRequestSequence.current !== sequence) return
      setInstalledModels([])
      setModelsMessage(error instanceof Error ? error.message : '설치 모델 목록을 읽지 못했습니다.')
      setModelsError(true)
    } finally {
      if (modelRequestSequence.current === sequence) setModelsLoading(false)
    }
  }, [preferences.connection, preferences.parameters.model])

  useEffect(() => {
    if (!preferences.connectionConfigured) return
    const available = preferences.connection.transport === 'bridge' ? Boolean(bridge?.ok) : online
    if (!available) return
    const initial = window.setTimeout(() => { void refreshModels() }, 0)
    const interval = window.setInterval(() => { void refreshModels() }, 30_000)
    return () => { window.clearTimeout(initial); window.clearInterval(interval) }
  }, [bridge?.ok, online, preferences.connection.transport, preferences.connectionConfigured, refreshModels])

  const updateParameter = (key: string, value: ParameterValue) => {
    setPreferences((current) => ({ ...current, parameters: { ...current.parameters, [key]: value } }))
  }

  const saveConnection = (connection: ConnectionConfig) => {
    modelRequestSequence.current += 1
    setBridge(null)
    setInstalledModels([])
    setModelsMessage('')
    setModelsError(false)
    setModelsLoading(false)
    monitor.setResult(null)
    monitor.setPhase('connecting')
    setPreferences((current) => ({
      ...current,
      connection,
      connectionConfigured: true,
      hydratedConnectionKey: undefined,
    }))
  }

  const testDraftConnection = async (connection: ConnectionConfig) => {
    return testConnection(connection)
  }

  const discover = async (connection: ConnectionConfig) => {
    setDiscovering(true)
    try {
      const endpoints = await discoverEndpoints(connection)
      setDiscovered(endpoints)
      if (!endpoints.length) setAlert({ kind: 'error', message: '기본 루프백 주소에서 Draw Things API를 찾지 못했습니다.' })
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : '자동 탐색에 실패했습니다.' })
    } finally {
      setDiscovering(false)
    }
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
    if (!activeSession || !prompt.trim() || generationState.active || generationLock.current) return
    generationLock.current = true
    try {
      const live = await monitor.test()
      if (!live.ok || !live.capabilities.canGenerate) {
        setAlert({ kind: 'error', message: live.ok ? '연결은 됐지만 이미지 생성에는 Draw Things HTTP 모드가 필요합니다.' : live.message })
        setConnectionOpen(true)
        return
      }
      const requestId = randomUuid()
      const sessionId = activeSession.id
      const effectivePrompt = composeEffectivePrompt(activeSession, prompt)
      const requestParameters: GenerationParameters = {
        ...preferences.parameters,
        ...(mode === 'img2img' && selected ? { width: selected.sourceWidth, height: selected.sourceHeight } : {}),
      }
      const width = Number(requestParameters.width)
      const height = Number(requestParameters.height)
      if (width < 128 || height < 128 || width > 8192 || height > 8192) {
        setAlert({ kind: 'error', message: '이미지 너비와 높이는 128–8192 범위여야 합니다.' })
        return
      }
      if (mode === 'txt2img' && (width % 64 !== 0 || height % 64 !== 0)) {
        setAlert({ kind: 'error', message: '텍스트 생성 크기는 Draw Things 블록에 맞게 64의 배수로 설정하세요.' })
        return
      }
      const now = Date.now()
      workspace.updateSession(sessionId, (session) => ({
        ...session,
        updatedAt: now,
        turns: [
          ...session.turns,
          { id: randomUuid(), role: 'user', content: prompt.trim(), effectivePrompt, createdAt: now, requestId },
          { id: randomUuid(), role: 'assistant', content: '생성 요청을 준비하고 있습니다…', createdAt: now, requestId, status: 'generating' },
        ],
      }))
      setGenerationState({ active: true, cancellable: true, requestId, sessionId, progress: 0, message: '연결을 확인하고 요청을 전송합니다' })
      cancelledRequests.current.delete(requestId)
      terminalRequest.current = null
      const abortController = new AbortController()
      generationAbortController.current = abortController
      try {
        let terminalEventReceived = false
        const stream = generate(preferences.connection, {
          id: requestId,
          mode,
          prompt: effectivePrompt,
          negativePrompt: preferences.negativePrompt,
          parameters: requestParameters,
          initImage: mode === 'img2img' ? selected?.dataUrl : undefined,
        }, abortController.signal)
        for await (const event of stream) {
          if (cancelledRequests.current.has(requestId)) break
          if (event.type === 'accepted') {
            setGenerationState((current) => ({ ...current, progress: 4, message: event.message }))
          } else if (event.type === 'progress') {
            setGenerationState((current) => ({ ...current, progress: event.progress, message: event.message ?? `샘플링 ${event.step ?? ''}` }))
          } else if (event.type === 'preview') {
            setGenerationState((current) => ({ ...current, preview: normalizeGeneratedImage(event.image) }))
          } else if (event.type === 'result') {
            terminalEventReceived = true
            terminalRequest.current = requestId
            setGenerationState((current) => ({ ...current, cancellable: false, progress: 100, message: '결과를 캔버스에 추가하는 중입니다…' }))
            await applyGenerationResult(event, sessionId, effectivePrompt, preferences.negativePrompt, selected?.id, requestParameters)
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
        if (generationAbortController.current === abortController) generationAbortController.current = null
        if (terminalRequest.current === requestId) terminalRequest.current = null
        cancelledRequests.current.delete(requestId)
        setGenerationState(IDLE_GENERATION)
      }
    } finally {
      generationLock.current = false
    }
  }

  const cancel = async () => {
    const requestId = generationState.requestId
    const sessionId = generationState.sessionId
    if (!requestId || terminalRequest.current === requestId || cancelledRequests.current.has(requestId)) return
    cancelledRequests.current.add(requestId)
    generationAbortController.current?.abort()
    setGenerationState((current) => ({ ...current, cancellable: false, message: '생성을 중단하는 중입니다…' }))
    try { await cancelGeneration(preferences.connection, requestId) } catch { /* UI cancellation still applies */ }
    if (sessionId) {
      markTurnCancelled(sessionId, requestId, '화면에서 생성을 중단했습니다. HTTP 모드에서는 앱 내부 작업이 계속될 수 있습니다.')
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
      <TopBar sessionTitle={activeSession.title} storageError={workspace.storageError ?? preferenceStorageError} phase={monitor.phase} result={monitor.result} generating={generationState.active} onOpenConnection={() => setConnectionOpen(true)} onOpenConversation={() => setConversationOpen(true)} />
      <div className="workspace-layout">
        <SessionRail sessions={workspace.sessions} activeId={workspace.activeId} collapsed={preferences.compactSidebar} onCollapsedChange={(compactSidebar) => setPreferences((current) => ({ ...current, compactSidebar }))} onCreate={workspace.addSession} onSelect={workspace.setActiveId} onDelete={deleteSession} />
        <main className="canvas-column">
          <InfiniteCanvas
            session={activeSession}
            preview={generationState.preview}
            generating={generationState.active}
            progress={generationState.progress}
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
            useSelected={useSelected}
            online={online}
            canGenerate={canGenerate}
            generating={generationState.active}
            cancellable={generationState.cancellable}
            progress={generationState.progress}
            statusMessage={generationState.message}
            model={String(preferences.parameters.model ?? '')}
            models={models}
            modelsLoading={modelsLoading}
            modelsMessage={modelsMessage}
            modelsError={modelsError}
            onPromptChange={(draftPrompt) => updateActive((session) => ({ ...session, draftPrompt }))}
            onNegativePromptChange={(negativePrompt) => setPreferences((current) => ({ ...current, negativePrompt }))}
            onContinuationChange={(continuationEnabled) => updateActive((session) => ({ ...session, continuationEnabled }))}
            onUseSelectedChange={(useSelectedImage) => updateActive((session) => ({ ...session, useSelectedImage }))}
            onSubmit={startGeneration}
            onCancel={cancel}
            onOpenConnection={() => setConnectionOpen(true)}
            onModelChange={(model) => updateParameter('model', model)}
            onRefreshModels={refreshModels}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </main>
        <InspectorPanel selected={selected} parameters={preferences.parameters} models={models} modelsLoading={modelsLoading} modelsMessage={modelsMessage} onRefreshModels={refreshModels} onChange={updateParameter} onOpenAll={() => setSettingsOpen(true)} onUseSelected={() => updateActive((session) => ({ ...session, useSelectedImage: !session.useSelectedImage }))} useSelected={useSelected} />
      </div>

      <SettingsPanel open={settingsOpen} mode={mode} values={preferences.parameters} models={models} onChange={updateParameter} onClose={() => setSettingsOpen(false)} onReset={() => setPreferences((current) => ({ ...current, parameters: { ...DEFAULT_PARAMETERS } }))} />
      {connectionOpen ? <ConnectionPanel open connection={preferences.connection} result={monitor.result} bridge={bridge} discovered={discovered} testing={monitor.testing} discovering={discovering} onClose={() => setConnectionOpen(false)} onSave={saveConnection} onTest={testDraftConnection} onDiscover={discover} /> : null}

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
