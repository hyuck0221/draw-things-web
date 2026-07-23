import {
  Focus,
  Hand,
  ImagePlus,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import type { CanvasItem, CanvasView, WorkspaceSession } from '../domain/types'
import { IconButton } from './ui'

interface InfiniteCanvasProps {
  session: WorkspaceSession
  preview?: string
  generating: boolean
  onViewChange: (view: CanvasView) => void
  onSelect: (id?: string) => void
  onImport: (dataUrl: string, dimensions: { width: number; height: number }) => void
}

function imageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = dataUrl
  })
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function InfiniteCanvas({
  session,
  preview,
  generating,
  onViewChange,
  onSelect,
  onImport,
}: InfiniteCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewX: number; viewY: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { view } = session

  const updateZoom = (nextZoom: number, originX?: number, originY?: number) => {
    const viewport = viewportRef.current
    const rect = viewport?.getBoundingClientRect()
    const focusX = originX ?? (rect ? rect.width / 2 : 0)
    const focusY = originY ?? (rect ? rect.height / 2 : 0)
    const zoom = Math.min(2.5, Math.max(0.15, nextZoom))
    const worldX = (focusX - view.x) / view.zoom
    const worldY = (focusY - view.y) / view.zoom
    onViewChange({ x: focusX - worldX * zoom, y: focusY - worldY * zoom, zoom })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.canvas-item')) return
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanning(true)
    onSelect(undefined)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onViewChange({ ...view, x: drag.viewX + event.clientX - drag.x, y: drag.viewY + event.clientY - drag.y })
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    setPanning(false)
  }

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const factor = Math.exp(-event.deltaY * 0.0012)
    updateZoom(view.zoom * factor, event.clientX - rect.left, event.clientY - rect.top)
  }

  const fitItems = () => {
    const viewport = viewportRef.current
    if (!viewport || session.items.length === 0) {
      onViewChange({ x: 0, y: 0, zoom: 1 })
      return
    }
    const minX = Math.min(...session.items.map((item) => item.x))
    const minY = Math.min(...session.items.map((item) => item.y))
    const maxX = Math.max(...session.items.map((item) => item.x + item.width))
    const maxY = Math.max(...session.items.map((item) => item.y + item.height))
    const boundsWidth = Math.max(1, maxX - minX)
    const boundsHeight = Math.max(1, maxY - minY)
    const zoom = Math.min(1.4, Math.max(0.15, Math.min((viewport.clientWidth - 160) / boundsWidth, (viewport.clientHeight - 160) / boundsHeight)))
    onViewChange({
      zoom,
      x: viewport.clientWidth / 2 - (minX + boundsWidth / 2) * zoom,
      y: viewport.clientHeight / 2 - (minY + boundsHeight / 2) * zoom,
    })
  }

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith('image/'))
    if (!file) return
    const dataUrl = await readFile(file)
    const dimensions = await imageDimensions(dataUrl)
    onImport(dataUrl, dimensions)
  }

  useEffect(() => {
    if (session.items.length === 1) window.setTimeout(fitItems, 0)
    // Only fit the first imported/generated item. Later items preserve the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.items.length === 1])

  return (
    <section className={`canvas-shell ${panning ? 'is-panning' : ''} ${dragOver ? 'is-drag-over' : ''}`}>
      <div
        className="canvas-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={onWheel}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="canvas-grid" style={{ '--grid-x': `${view.x}px`, '--grid-y': `${view.y}px`, '--grid-size': `${32 * view.zoom}px` } as CSSProperties} />
        <div className="canvas-plane" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {session.items.map((item: CanvasItem) => (
            <button
              type="button"
              className={`canvas-item ${session.selectedItemId === item.id ? 'is-selected' : ''}`}
              key={item.id}
              style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: item.height }}
              onClick={(event) => { event.stopPropagation(); onSelect(item.id) }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                const viewport = viewportRef.current
                if (!viewport) return
                const zoom = Math.min(1.5, Math.min((viewport.clientWidth - 120) / item.width, (viewport.clientHeight - 120) / item.height))
                onViewChange({ zoom, x: viewport.clientWidth / 2 - (item.x + item.width / 2) * zoom, y: viewport.clientHeight / 2 - (item.y + item.height / 2) * zoom })
              }}
            >
              {item.dataUrl
                ? <img src={item.dataUrl} alt={item.prompt || '캔버스 이미지'} draggable={false} />
                : null}
              <span className="canvas-item__meta"><span>{item.kind === 'generated' ? <Sparkles size={12} /> : <ImagePlus size={12} />}{item.kind === 'generated' ? 'Generated' : 'Imported'}</span>{item.seed !== undefined ? <span>Seed {item.seed}</span> : null}</span>
            </button>
          ))}
          {generating && preview ? (
            <div className="canvas-preview" style={{ transform: 'translate(40px, 40px)' }}><img src={preview} alt="생성 중 미리보기" /><span>결과를 준비하고 있습니다…</span></div>
          ) : null}
        </div>

        {session.items.length === 0 && !generating ? (
          <div className="canvas-empty">
            <div className="canvas-empty__orb"><Sparkles size={26} /></div>
            <h2>첫 장면을 그려보세요</h2>
            <p>아래 프롬프트로 생성하거나 이미지를 끌어와<br />같은 세션에서 계속 편집할 수 있습니다.</p>
            <span><Hand size={14} /> 드래그해서 이동 · 휠로 확대</span>
          </div>
        ) : null}

        {dragOver ? <div className="drop-overlay"><ImagePlus size={30} /><strong>이미지를 캔버스에 놓기</strong><span>로컬 IndexedDB에만 저장됩니다</span></div> : null}
      </div>

      <div className="canvas-tools" aria-label="캔버스 보기 도구">
        <IconButton label="축소" onClick={() => updateZoom(view.zoom / 1.2)}><Minus size={16} /></IconButton>
        <button className="zoom-value" type="button" onClick={() => updateZoom(1)}>{Math.round(view.zoom * 100)}%</button>
        <IconButton label="확대" onClick={() => updateZoom(view.zoom * 1.2)}><Plus size={16} /></IconButton>
        <span />
        <IconButton label="모든 이미지에 맞추기" onClick={fitItems}><Maximize2 size={16} /></IconButton>
        <IconButton label="원점으로 이동" onClick={() => onViewChange({ x: 0, y: 0, zoom: 1 })}><LocateFixed size={16} /></IconButton>
      </div>

      <div className="canvas-mode"><Focus size={14} /><span>{session.items.length}개 이미지</span><kbd>Space</kbd><span>이동</span></div>
    </section>
  )
}
