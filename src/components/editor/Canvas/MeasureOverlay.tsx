import { Layer, Line, Circle, Label, Tag, Text } from 'react-konva'
import { useMemo } from 'react'
import type { LengthUnit } from '../../../lib/units'
import {
  formatCanvasLength,
  formatCanvasArea,
  LENGTH_UNIT_SUFFIX,
} from '../../../lib/units'

export interface MeasureSession {
  /** Committed vertices (canvas-space). A session with 0 points is inactive. */
  points: number[]
  /** Current cursor position (canvas-space) — null when pointer has left the canvas. */
  cursor: { x: number; y: number } | null
  /**
   * True once the user has double-clicked / pressed Enter to end the
   * session. The overlay still renders (committed points + labels remain
   * visible so a teammate can look at the reading), but `cursor` is
   * ignored and new clicks start a fresh session.
   */
  finalised: boolean
}

interface Props {
  session: MeasureSession
  scale: number
  scaleUnit: LengthUnit
}

/**
 * Ephemeral ruler overlay. Renders:
 *   - a dashed polyline through the committed vertices and out to the cursor
 *   - a labeled dot at each vertex
 *   - a length label at the midpoint of every segment (the chord length
 *     through `points[i] -> points[i+1]`)
 *   - a running total (or polygon area if 3+ points and the loop closes
 *     visually) anchored near the cursor
 *
 * We deliberately leave the overlay alive until the user explicitly ends
 * the session (double-click / Enter / tool-switch). Architects checking
 * corridor widths want the last reading to linger so they can discuss it.
 */
export function MeasureOverlay({ session, scale, scaleUnit }: Props) {
  const { points, cursor, finalised } = session

  // Assemble the render-time polyline: committed points followed by the
  // cursor (if any) so the "leading edge" of the ruler tracks live. Keep
  // the list flat `[x0,y0,x1,y1,…]` to match Konva's `points` prop shape.
  //
  // Once finalised, we IGNORE the cursor and render only committed points.
  // The overlay owns this rule — callers can stop updating `cursor` after
  // finalising, but we're defensive in case a stray update slips through.
  const polyline = useMemo(() => {
    const out = points.slice()
    if (cursor && !finalised) {
      out.push(cursor.x, cursor.y)
    }
    return out
  }, [points, cursor, finalised])

  // Per-segment length readouts rendered at each midpoint. Segments include
  // the live one (last-committed → cursor) so the user sees the current
  // distance update as they move. Skip zero-length segments (double clicks
  // at the same spot during a session).
  const segmentLabels = useMemo(() => {
    const labels: {
      midX: number
      midY: number
      text: string
      key: string
    }[] = []
    for (let i = 0; i + 3 < polyline.length; i += 2) {
      const x0 = polyline[i]
      const y0 = polyline[i + 1]
      const x1 = polyline[i + 2]
      const y1 = polyline[i + 3]
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy)
      if (len < 1) continue
      labels.push({
        midX: (x0 + x1) / 2,
        midY: (y0 + y1) / 2,
        text: formatCanvasLength(len, scale, scaleUnit),
        key: `seg-${i}`,
      })
    }
    return labels
  }, [polyline, scale, scaleUnit])

  // Total (sum of all segments) or — if we have at least 3 real vertices
  // — the polygon area calculated via the shoelace formula. The label is
  // anchored to the cursor so it floats with the pointer.
  const totalLabel = useMemo(() => {
    if (polyline.length < 4) return null

    // Sum segment lengths for the "perimeter" / total distance.
    let totalPx = 0
    for (let i = 0; i + 3 < polyline.length; i += 2) {
      totalPx += Math.hypot(
        polyline[i + 2] - polyline[i],
        polyline[i + 3] - polyline[i + 1],
      )
    }

    // Shoelace area. Only meaningful if we have 3+ committed vertices OR
    // (2 committed + cursor), which we approximate via polyline.length >= 6.
    let areaPx: number | null = null
    if (polyline.length >= 6) {
      let sum = 0
      for (let i = 0; i < polyline.length; i += 2) {
        const x0 = polyline[i]
        const y0 = polyline[i + 1]
        const nextI = (i + 2) % polyline.length
        const x1 = polyline[nextI]
        const y1 = polyline[nextI + 1]
        sum += x0 * y1 - x1 * y0
      }
      areaPx = Math.abs(sum) / 2
    }

    // Label anchor: the end of the live polyline. Falls back to the last
    // committed vertex if the cursor is inactive or we've finalised (so the
    // label lingers on the last vertex instead of the stale cursor).
    const anchor =
      cursor && !finalised
        ? cursor
        : { x: points[points.length - 2], y: points[points.length - 1] }

    const lines = [`Total: ${formatCanvasLength(totalPx, scale, scaleUnit)}`]
    if (areaPx !== null) {
      lines.push(`Area: ${formatCanvasArea(areaPx, scale, scaleUnit)}`)
    }

    return {
      x: anchor.x,
      y: anchor.y,
      text: lines.join('\n'),
    }
  }, [polyline, cursor, finalised, points, scale, scaleUnit])

  if (points.length === 0 && !cursor) return null

  return (
    <Layer listening={false}>
      {/* Ruler line. `tension={0}` keeps it a straight polyline; dashing makes
          it visibly distinct from permanent canvas geometry. */}
      {polyline.length >= 4 && (
        <Line
          points={polyline}
          stroke="#DC2626"
          strokeWidth={1.5}
          dash={[6, 4]}
        />
      )}

      {/* Committed vertex markers. The cursor itself isn't marked — it
          already has the OS pointer. */}
      {points.length >= 2 &&
        Array.from({ length: points.length / 2 }).map((_, idx) => (
          <Circle
            key={`v-${idx}`}
            x={points[idx * 2]}
            y={points[idx * 2 + 1]}
            radius={3}
            fill="#ffffff"
            stroke="#DC2626"
            strokeWidth={1.5}
          />
        ))}

      {/* Per-segment readouts. Using Konva <Label>+<Tag> gives us a white
          pill that stays legible over any underlying content. */}
      {segmentLabels.map((s) => (
        <Label key={s.key} x={s.midX} y={s.midY} offsetY={10}>
          <Tag fill="#ffffff" stroke="#DC2626" strokeWidth={0.5} cornerRadius={2} />
          <Text text={s.text} fontSize={10} padding={2} fill="#991B1B" />
        </Label>
      ))}

      {/* Running total / area label anchored to the cursor. */}
      {totalLabel && (
        <Label
          x={totalLabel.x}
          y={totalLabel.y}
          offsetX={-12}
          offsetY={-12}
        >
          <Tag
            fill="#991B1B"
            stroke="#7F1D1D"
            strokeWidth={0.5}
            cornerRadius={3}
          />
          <Text
            text={totalLabel.text}
            fontSize={11}
            padding={4}
            fill="#ffffff"
            lineHeight={1.3}
          />
        </Label>
      )}
    </Layer>
  )
}

// Export the suffix helper for tests that want to assert on the unit suffix
// without duplicating the label map.
export { LENGTH_UNIT_SUFFIX }
