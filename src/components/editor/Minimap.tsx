import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useMemo, useCallback, useRef, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { elementBounds } from '../../lib/elementBounds'

const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120

/**
 * Lower-right overview panel. Split into three concerns so a pan
 * (the most frequent re-render trigger) only re-commits the cheapest
 * piece — the viewport rectangle — and leaves the tile grid alone.
 *
 *   <MinimapBackground>  — all element tiles. Re-renders only when
 *                          elements or selection change.
 *   <MinimapViewport>    — the translucent blue rectangle showing
 *                          what's currently on-screen. Re-renders on
 *                          pan/zoom/size change, but is a single rect.
 *   <Minimap>            — the outer container + pointer handlers,
 *                          subscribing to the minimum needed state.
 */

interface Tile {
  id: string
  bounds: { x: number; y: number; width: number; height: number }
  fill: string
  stroke: string
}

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function useTiles(): Tile[] {
  const elements = useElementsStore((s) => s.elements)
  return useMemo(() => {
    const out: Tile[] = []
    for (const el of Object.values(elements)) {
      const b = elementBounds(el)
      if (!b || (b.width === 0 && b.height === 0)) continue
      out.push({
        id: el.id,
        bounds: b,
        fill: el.style.fill,
        stroke: el.style.stroke,
      })
    }
    return out
  }, [elements])
}

function useBounds(tiles: Tile[]): Bounds {
  return useMemo(() => {
    if (tiles.length === 0) return { x: 0, y: 0, width: 800, height: 600 }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const t of tiles) {
      if (t.bounds.x < minX) minX = t.bounds.x
      if (t.bounds.y < minY) minY = t.bounds.y
      if (t.bounds.x + t.bounds.width > maxX) maxX = t.bounds.x + t.bounds.width
      if (t.bounds.y + t.bounds.height > maxY) maxY = t.bounds.y + t.bounds.height
    }

    const padding = 100
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    }
  }, [tiles])
}

interface MinimapBackgroundProps {
  tiles: Tile[]
  bounds: Bounds
  minimapScale: number
  selectedSet: Set<string>
}

const MinimapBackground = memo(function MinimapBackground({
  tiles, bounds, minimapScale, selectedSet,
}: MinimapBackgroundProps) {
  // Split into two passes so selected tiles render ON TOP of unselected
  // — otherwise a small selected desk could be hidden under a larger
  // unselected container that happens to draw later.
  const unselected: Tile[] = []
  const selected: Tile[] = []
  for (const t of tiles) {
    if (selectedSet.has(t.id)) selected.push(t)
    else unselected.push(t)
  }

  return (
    <>
      {unselected.map((t) => (
        <rect
          key={t.id}
          x={(t.bounds.x - bounds.x) * minimapScale}
          y={(t.bounds.y - bounds.y) * minimapScale}
          width={Math.max(t.bounds.width * minimapScale, 1)}
          height={Math.max(t.bounds.height * minimapScale, 1)}
          fill={t.fill}
          stroke={t.stroke}
          strokeWidth={0.5}
        />
      ))}
      {selected.map((t) => (
        <rect
          key={t.id}
          x={(t.bounds.x - bounds.x) * minimapScale}
          y={(t.bounds.y - bounds.y) * minimapScale}
          width={Math.max(t.bounds.width * minimapScale, 2)}
          height={Math.max(t.bounds.height * minimapScale, 2)}
          fill="#3B82F6"
          stroke="#1D4ED8"
          strokeWidth={1}
          data-testid={`minimap-selected-${t.id}`}
        />
      ))}
    </>
  )
})

interface MinimapViewportProps {
  bounds: Bounds
  minimapScale: number
}

/**
 * The translucent indicator rectangle showing the current viewport's
 * footprint on the overview. Subscribes only to stage position/size so
 * pans don't trigger a re-render of the (expensive) tile grid above.
 */
function MinimapViewport({ bounds, minimapScale }: MinimapViewportProps) {
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)

  // The canvas container (not the full browser window) is what's
  // actually visible — left/right sidebars, top bar, and status bar all
  // eat into innerWidth/innerHeight. `stageWidth`/`stageHeight` come
  // from the CanvasStage ResizeObserver, so the indicator now reflects
  // the true drawable area instead of overshooting by ~580px of sidebar.
  // Fall back to the window size before the observer fires so a first-
  // paint render isn't a blank rectangle.
  const w = stageWidth > 0 ? stageWidth : window.innerWidth
  const h = stageHeight > 0 ? stageHeight : window.innerHeight

  const viewportX = (-stageX / stageScale - bounds.x) * minimapScale
  const viewportY = (-stageY / stageScale - bounds.y) * minimapScale
  const viewportW = (w / stageScale) * minimapScale
  const viewportH = (h / stageScale) * minimapScale

  return (
    <rect
      x={viewportX}
      y={viewportY}
      width={Math.max(viewportW, 10)}
      height={Math.max(viewportH, 8)}
      fill="rgba(59, 130, 246, 0.15)"
      stroke="#3B82F6"
      strokeWidth={1.5}
      rx={2}
    />
  )
}

export function Minimap() {
  // Selected-ids is needed for the background tile split, but NOT for
  // the viewport indicator, so we subscribe here and pass down.
  const selectedIds = useUIStore((s) => s.selectedIds)
  const { setStagePosition } = useCanvasStore(
    useShallow((s) => ({ setStagePosition: s.setStagePosition })),
  )
  const ref = useRef<HTMLDivElement>(null)

  const tiles = useTiles()
  const bounds = useBounds(tiles)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const scaleX = MINIMAP_WIDTH / bounds.width
  const scaleY = MINIMAP_HEIGHT / bounds.height
  const minimapScale = Math.min(scaleX, scaleY)

  // Pointer-drag to scrub the viewport. We rAF-coalesce pointermoves —
  // pointer events can fire at 120 Hz on modern trackpads and each one
  // used to trigger a full Konva commit. The ref buffers the latest
  // client coords; the scheduled frame reads them and calls
  // setStagePosition exactly once per frame.
  const dragStateRef = useRef<{
    active: boolean
    pending: boolean
    clientX: number
    clientY: number
  }>({ active: false, pending: false, clientX: 0, clientY: 0 })

  const applyPan = useCallback(() => {
    const state = dragStateRef.current
    state.pending = false
    if (!state.active) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const localX = state.clientX - rect.left
    const localY = state.clientY - rect.top

    const cs = useCanvasStore.getState()
    // Guard against pre-measurement zero sizes (first paint).
    const w = cs.stageWidth > 0 ? cs.stageWidth : window.innerWidth
    const h = cs.stageHeight > 0 ? cs.stageHeight : window.innerHeight

    const canvasX = localX / minimapScale + bounds.x
    const canvasY = localY / minimapScale + bounds.y

    setStagePosition(-canvasX * cs.stageScale + w / 2, -canvasY * cs.stageScale + h / 2)
  }, [minimapScale, bounds, setStagePosition])

  const scheduleApply = useCallback(() => {
    const state = dragStateRef.current
    if (state.pending) return
    state.pending = true
    requestAnimationFrame(applyPan)
  }, [applyPan])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button / single touch should drive pans.
      if (e.button !== 0 && e.pointerType === 'mouse') return
      const state = dragStateRef.current
      state.active = true
      state.clientX = e.clientX
      state.clientY = e.clientY
      scheduleApply()

      const onMove = (moveEvent: PointerEvent) => {
        if (!state.active) return
        state.clientX = moveEvent.clientX
        state.clientY = moveEvent.clientY
        scheduleApply()
      }
      const onUp = () => {
        state.active = false
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      // Attach to `window` so a drag that overshoots the minimap still
      // tracks — otherwise the view "sticks" the moment the pointer
      // leaves, which feels broken.
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [scheduleApply],
  )

  return (
    <div
      ref={ref}
      className="absolute bottom-10 right-4 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-pointer select-none touch-none"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onPointerDown={handlePointerDown}
      aria-label="Minimap"
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        <MinimapBackground
          tiles={tiles}
          bounds={bounds}
          minimapScale={minimapScale}
          selectedSet={selectedSet}
        />
        <MinimapViewport bounds={bounds} minimapScale={minimapScale} />
      </svg>
    </div>
  )
}
