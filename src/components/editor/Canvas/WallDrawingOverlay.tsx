import { Layer, Line, Path, Circle, Text } from 'react-konva'
import { distanceBetween } from '../../../lib/geometry'
import { useCanvasStore } from '../../../stores/canvasStore'
import { wallPathData } from '../../../lib/wallPath'

interface WallDrawingOverlayProps {
  points: number[]
  bulges: number[]
  currentPoint: { x: number; y: number } | null
  isDrawing: boolean
  /** Live bulge while dragging the pending final segment. null if not dragging. */
  previewBulge: number | null
}

export function WallDrawingOverlay({
  points,
  bulges,
  currentPoint,
  isDrawing,
  previewBulge,
}: WallDrawingOverlayProps) {
  const settings = useCanvasStore((s) => s.settings)

  if (!isDrawing || points.length === 0) return null

  // The preview extends `points` by `currentPoint` and `bulges` by the
  // live preview bulge (or 0 if we're not dragging).
  const previewPoints = currentPoint
    ? [...points, currentPoint.x, currentPoint.y]
    : points
  const previewBulges = currentPoint
    ? [...bulges, previewBulge ?? 0]
    : bulges
  const previewHasArc = previewBulges.some((b) => b !== 0)

  let dimensionLabel = ''
  if (currentPoint && points.length >= 2) {
    const lastX = points[points.length - 2]
    const lastY = points[points.length - 1]
    const dist = distanceBetween(
      { x: lastX, y: lastY },
      { x: currentPoint.x, y: currentPoint.y },
    )
    const scaledDist = dist * settings.scale
    dimensionLabel = `${scaledDist.toFixed(1)} ${settings.scaleUnit}`
  }

  return (
    <Layer listening={false}>
      {previewHasArc ? (
        <Path
          data={wallPathData(previewPoints, previewBulges)}
          stroke="#3B82F6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          dash={[8, 4]}
          fillEnabled={false}
        />
      ) : (
        <Line
          points={previewPoints}
          stroke="#3B82F6"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          dash={[8, 4]}
        />
      )}

      {Array.from({ length: points.length / 2 }, (_, i) => (
        <Circle
          key={i}
          x={points[i * 2]}
          y={points[i * 2 + 1]}
          radius={4}
          fill="#3B82F6"
          stroke="#ffffff"
          strokeWidth={2}
        />
      ))}

      {dimensionLabel && currentPoint && points.length >= 2 && (
        <Text
          x={(points[points.length - 2] + currentPoint.x) / 2 + 8}
          y={(points[points.length - 1] + currentPoint.y) / 2 - 16}
          text={dimensionLabel}
          fontSize={12}
          fill="#3B82F6"
          fontStyle="bold"
        />
      )}
    </Layer>
  )
}
