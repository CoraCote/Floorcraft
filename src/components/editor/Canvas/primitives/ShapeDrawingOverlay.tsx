import { Layer, Rect, Ellipse, Line, Arrow } from 'react-konva'
import type { ToolType } from '../../../../stores/canvasStore'

export interface ShapeDrawingPreview {
  tool: ToolType
  startX: number
  startY: number
  endX: number
  endY: number
}

interface Props {
  preview: ShapeDrawingPreview | null
}

const DASH = [6, 4]
const STROKE = '#3B82F6'

/**
 * Live dashed preview shown while the user drags out a primitive shape.
 * Pure render — the parent owns the {start, end} coords and clears the
 * preview on mouseup/cancel.
 */
export function ShapeDrawingOverlay({ preview }: Props) {
  if (!preview) return null
  const { tool, startX, startY, endX, endY } = preview

  if (tool === 'rect-shape') {
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    return (
      <Layer listening={false}>
        <Rect x={x} y={y} width={w} height={h} stroke={STROKE} dash={DASH} strokeWidth={1.5} />
      </Layer>
    )
  }

  if (tool === 'ellipse') {
    const cx = (startX + endX) / 2
    const cy = (startY + endY) / 2
    const rx = Math.abs(endX - startX) / 2
    const ry = Math.abs(endY - startY) / 2
    return (
      <Layer listening={false}>
        <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry} stroke={STROKE} dash={DASH} strokeWidth={1.5} />
      </Layer>
    )
  }

  if (tool === 'line-shape') {
    return (
      <Layer listening={false}>
        <Line points={[startX, startY, endX, endY]} stroke={STROKE} dash={DASH} strokeWidth={1.5} />
      </Layer>
    )
  }

  if (tool === 'arrow') {
    return (
      <Layer listening={false}>
        <Arrow
          points={[startX, startY, endX, endY]}
          stroke={STROKE}
          fill={STROKE}
          dash={DASH}
          strokeWidth={1.5}
          pointerLength={10}
          pointerWidth={10}
        />
      </Layer>
    )
  }

  return null
}
