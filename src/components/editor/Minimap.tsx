import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useMemo, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120

export function Minimap() {
  const elements = useElementsStore((s) => s.elements)
  const { stageX, stageY, stageScale, setStagePosition } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, setStagePosition: s.setStagePosition })))
  const ref = useRef<HTMLDivElement>(null)

  // Compute bounding box of all elements
  const bounds = useMemo(() => {
    const els = Object.values(elements)
    if (els.length === 0) return { x: 0, y: 0, width: 800, height: 600 }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of els) {
      minX = Math.min(minX, el.x - el.width / 2)
      minY = Math.min(minY, el.y - el.height / 2)
      maxX = Math.max(maxX, el.x + el.width / 2)
      maxY = Math.max(maxY, el.y + el.height / 2)
    }

    const padding = 100
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    }
  }, [elements])

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

  return (
    <div
      ref={ref}
      className="absolute bottom-10 right-4 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onClick={handleClick}
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        {/* Elements as small rectangles */}
        {Object.values(elements).map((el) => (
          <rect
            key={el.id}
            x={(el.x - el.width / 2 - bounds.x) * minimapScale}
            y={(el.y - el.height / 2 - bounds.y) * minimapScale}
            width={el.width * minimapScale}
            height={el.height * minimapScale}
            fill={el.style.fill}
            stroke={el.style.stroke}
            strokeWidth={0.5}
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
