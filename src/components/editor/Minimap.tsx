import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useMemo, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { elementBounds } from '../../lib/elementBounds'

const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120

export function Minimap() {
  const elements = useElementsStore((s) => s.elements)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const { stageX, stageY, stageScale, setStagePosition } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, setStagePosition: s.setStagePosition })))
  const ref = useRef<HTMLDivElement>(null)

  // Precompute each element's AABB once — we need it twice (for the
  // fitting bounds, and to render the tile). `elementBounds` knows how
  // to handle walls (which have zero width/height with geometry baked
  // into `points`); the old code treated every element as a 0×0 dot,
  // so walls were invisible in the minimap.
  const tiles = useMemo(() => {
    const out: Array<{
      id: string
      bounds: { x: number; y: number; width: number; height: number }
      fill: string
      stroke: string
    }> = []
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

  // Compute bounding box of all tiles
  const bounds = useMemo(() => {
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

  const scaleX = MINIMAP_WIDTH / bounds.width
  const scaleY = MINIMAP_HEIGHT / bounds.height
  const minimapScale = Math.min(scaleX, scaleY)

  // Viewport rectangle in minimap space
  const viewportX = (-stageX / stageScale - bounds.x) * minimapScale
  const viewportY = (-stageY / stageScale - bounds.y) * minimapScale
  const viewportW = (window.innerWidth / stageScale) * minimapScale
  const viewportH = (window.innerHeight / stageScale) * minimapScale

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const canvasX = clickX / minimapScale + bounds.x
      const canvasY = clickY / minimapScale + bounds.y

      setStagePosition(
        -canvasX * stageScale + window.innerWidth / 2,
        -canvasY * stageScale + window.innerHeight / 2
      )
    },
    [minimapScale, bounds, stageScale, setStagePosition]
  )

  // Selection set for O(1) lookup during the render loop. We split
  // selected tiles out into a second pass so they render ON TOP of the
  // unselected fill — otherwise a small selected desk could be hidden
  // under a larger unselected element that happens to draw later.
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const unselectedTiles = tiles.filter((t) => !selectedSet.has(t.id))
  const selectedTiles = tiles.filter((t) => selectedSet.has(t.id))

  return (
    <div
      ref={ref}
      className="absolute bottom-10 right-4 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onClick={handleClick}
      aria-label="Minimap"
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        {/* Unselected elements — base layer. */}
        {unselectedTiles.map((t) => (
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

        {/*
          Selected elements — rendered last so they're always on top,
          with a saturated blue fill + stroke so the user can scan the
          minimap and see instantly where their selection lives at any
          zoom level. The 1px-min width/height ensures tiny elements
          (single desks at low zoom) stay visible when highlighted.
        */}
        {selectedTiles.map((t) => (
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

        {/* Viewport indicator */}
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
      </svg>
    </div>
  )
}
