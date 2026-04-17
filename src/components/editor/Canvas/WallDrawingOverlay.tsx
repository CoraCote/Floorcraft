import { Layer, Path, Circle, Text } from 'react-konva'
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

/**
 * Arc length of a circular segment given chord length `c` and signed sagitta
 * (bulge) `s`. Uses `r = (c² + 4s²) / (8|s|)` (same formula as arcFromBulge
 * in wallPath.ts) and `arcLen = r * 2 * asin(c / 2r)`. Returns the straight
 * chord length for `s === 0` so callers can use it uniformly.
 */
function segmentLength(chord: number, bulge: number): number {
  if (bulge === 0 || chord === 0) return chord
  const abs = Math.abs(bulge)
  const radius = (chord * chord + 4 * bulge * bulge) / (8 * abs)
  // Numerical guard: the expression inside asin is always ≤ 1 in theory
  // (chord/(2r) ≤ 1 when |bulge| ≤ chord/2), but floating-point can nudge
  // it above 1. Clamp so asin doesn't return NaN for near-half-circles.
  const ratio = Math.min(1, chord / (2 * radius))
  const theta = 2 * Math.asin(ratio)
  return radius * theta
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
  const previewBulges = currentPoint ? [...bulges, previewBulge ?? 0] : bulges

  // Show the TRUE length of the pending segment: arc length when bulged,
  // chord length when straight. Without this, a user dragging a curve sees
  // the chord distance tick down even while they're adding arc length.
  let dimensionLabel = ''
  if (currentPoint && points.length >= 2) {
    const lastX = points[points.length - 2]
    const lastY = points[points.length - 1]
    const chord = distanceBetween(
      { x: lastX, y: lastY },
      { x: currentPoint.x, y: currentPoint.y },
    )
    const len = segmentLength(chord, previewBulge ?? 0)
    const scaled = len * settings.scale
    dimensionLabel = `${scaled.toFixed(1)} ${settings.scaleUnit}`
  }

  return (
    <Layer listening={false}>
      {/* Always render as <Path> so the node identity is stable when the
          user transitions a segment between straight and curved during a
          single drawing session. */}
      <Path
        data={wallPathData(previewPoints, previewBulges)}
        stroke="#3B82F6"
        strokeWidth={4}
        lineCap="round"
        lineJoin="round"
        dash={[8, 4]}
        fillEnabled={false}
      />

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
