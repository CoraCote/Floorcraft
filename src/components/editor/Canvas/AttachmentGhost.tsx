import { useEffect, useMemo } from 'react'
import { Group, Rect, Line, Arc, Layer, Circle } from 'react-konva'
import { useElementsStore } from '../../../stores/elementsStore'
import { findNearestStraightWallHit } from '../../../lib/wallAttachment'
import { wallSegments, tangentAt } from '../../../lib/wallPath'

interface AttachmentGhostProps {
  /** Active tool — ghost only renders for 'door' / 'window'. */
  tool: string
  /** Cursor in canvas-space coords, or null when the cursor is off the canvas. */
  cursor: { x: number; y: number } | null
  /** Current stage scale so we can keep the snap radius visually constant. */
  stageScale: number
  /** Max canvas-unit distance to snap from — matches CanvasStage's click logic. */
  snapPx: number
  /**
   * Called with `true` when the cursor is within snap range of a wall,
   * `false` otherwise. CanvasStage uses this to flip the DOM cursor to
   * `not-allowed` without having to re-run the hit test itself — one walk
   * of the elements map per mousemove is plenty.
   */
  onHitChange?: (hasHit: boolean) => void
}

/**
 * Dimmed preview overlay for the door / window tools. Tracks the cursor and
 * shows exactly where placement will land — same snap math CanvasStage uses
 * on click, so WYSIWYG. When there's no wall in range we render a small
 * greyed crosshair so the user sees the tool is tracking but nothing will
 * be placed; CanvasStage also flips its cursor to `not-allowed` in that
 * case via `onHitChange`.
 *
 * This component owns the reactive subscription to the elements map. The
 * hit is memoised on the inputs (elements + cursor + snap), so it only
 * re-runs when something that matters changed — not on every unrelated
 * drag/update in the editor.
 */
export function AttachmentGhost({ tool, cursor, stageScale, snapPx, onHitChange }: AttachmentGhostProps) {
  // Subscribe so the ghost updates when walls are added/removed.
  const elements = useElementsStore((s) => s.elements)

  const active = (tool === 'door' || tool === 'window') && cursor !== null
  const hit = useMemo(() => {
    if (!active || !cursor) return null
    return findNearestStraightWallHit(elements, cursor.x, cursor.y, snapPx / stageScale)
  }, [active, elements, cursor, stageScale, snapPx])

  // Push the hit/no-hit state up to CanvasStage for cursor styling. Using
  // an effect (not render) avoids "setState during render" warnings and
  // keeps CanvasStage decoupled from the hit test.
  const hasHit = hit !== null
  useEffect(() => {
    onHitChange?.(hasHit)
  }, [hasHit, onHitChange])

  if (!active || !cursor) return null

  // No wall nearby: render a small greyed crosshair at the cursor so the
  // user sees the tool is live but sees no snap target.
  if (!hit) {
    // 8 canvas-unit arms; scale down with zoom so they stay ~8 screen px.
    const arm = 8 / stageScale
    return (
      <Layer listening={false}>
        <Circle
          x={cursor.x}
          y={cursor.y}
          radius={arm / 2}
          stroke="#9CA3AF"
          strokeWidth={1 / stageScale}
          dash={[2 / stageScale, 2 / stageScale]}
        />
        <Line
          points={[cursor.x - arm, cursor.y, cursor.x + arm, cursor.y]}
          stroke="#9CA3AF"
          strokeWidth={1 / stageScale}
        />
        <Line
          points={[cursor.x, cursor.y - arm, cursor.x, cursor.y + arm]}
          stroke="#9CA3AF"
          strokeWidth={1 / stageScale}
        />
      </Layer>
    )
  }

  // Derive wall-aligned rotation from the straight segment we hit. This is
  // the same formula DoorRenderer / WindowRenderer use to align real
  // elements, so the ghost sits exactly where the real one will.
  const segs = wallSegments(hit.wall.points, hit.wall.bulges)
  const seg = segs[hit.segmentIndex]
  const tangent = tangentAt(seg, hit.tInSegment)
  const rotationDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI

  // Default sizes mirror the element CanvasStage actually creates on click.
  const thickness = Math.max(6, hit.wall.thickness)
  if (tool === 'door') {
    const w = 36
    const h = thickness
    const radius = w
    return (
      <Layer listening={false} opacity={0.45}>
        <Group x={hit.point.x} y={hit.point.y} rotation={rotationDeg}>
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill="#ffffff"
            stroke="#111827"
            strokeWidth={1}
          />
          <Line points={[-w / 2, 0, w / 2, 0]} stroke="#111827" strokeWidth={2} />
          {/* Default swingDirection is 'left' in CanvasStage — mirror it. */}
          <Arc
            x={-w / 2}
            y={0}
            innerRadius={0}
            outerRadius={radius}
            angle={90}
            rotation={-90}
            fill="rgba(59, 130, 246, 0.08)"
            stroke="#94A3B8"
            strokeWidth={1}
            dash={[4, 4]}
          />
        </Group>
      </Layer>
    )
  }

  // Window ghost.
  const w = 48
  const h = Math.max(4, hit.wall.thickness)
  return (
    <Layer listening={false} opacity={0.45}>
      <Group x={hit.point.x} y={hit.point.y} rotation={rotationDeg}>
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill="#DBEAFE"
          stroke="#1E3A8A"
          strokeWidth={1}
        />
        <Line points={[-w / 2, 0, w / 2, 0]} stroke="#1E3A8A" strokeWidth={1} />
      </Group>
    </Layer>
  )
}
