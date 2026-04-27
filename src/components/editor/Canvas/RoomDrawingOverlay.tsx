import { Layer, Rect, Group, Rect as KRect, Text } from 'react-konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import {
  formatDimensionPillText,
  segmentAngleDeg,
} from '../../../lib/wallDimensionPill'

interface RoomDrawingOverlayProps {
  preview: {
    startX: number
    startY: number
    endX: number
    endY: number
  } | null
}

// Same shape and styling as the WallDrawingOverlay's pill so the two
// readouts feel like one coherent HUD layer. Constants are intentionally
// re-declared here (rather than imported from WallDrawingOverlay) so this
// file has no cross-component dependency on a sibling Konva component
// that's mostly internal — moving them into a shared module is on the
// table the day a third overlay needs the same pill.
const PILL_FONT_SIZE = 11
const PILL_PAD_X = 6
const PILL_PAD_Y = 3
const PILL_LINE_HEIGHT = 13
const PILL_CORNER_RADIUS = 4
const PILL_BG_FILL = '#ffffff'
const PILL_BG_OPACITY = 0.92
const PILL_BG_STROKE = '#94a3b8'
const PILL_FG_FILL = '#0f172a'
const PILL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace'

interface PillProps {
  cx: number
  cy: number
  invScale: number
  text: string
  keySuffix: string
}

function DimensionPill({ cx, cy, invScale, text, keySuffix }: PillProps) {
  const lines = text.split('\n')
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const widthPx = Math.max(28, maxChars * PILL_FONT_SIZE * 0.6) + PILL_PAD_X * 2
  const heightPx = lines.length * PILL_LINE_HEIGHT + PILL_PAD_Y * 2
  return (
    <Group
      key={`room-pill-${keySuffix}`}
      x={cx}
      y={cy}
      offsetX={widthPx / 2}
      offsetY={heightPx / 2}
      scaleX={invScale}
      scaleY={invScale}
      listening={false}
    >
      <KRect
        x={0}
        y={0}
        width={widthPx}
        height={heightPx}
        fill={PILL_BG_FILL}
        opacity={PILL_BG_OPACITY}
        stroke={PILL_BG_STROKE}
        strokeWidth={0.5}
        cornerRadius={PILL_CORNER_RADIUS}
        listening={false}
      />
      <Text
        x={PILL_PAD_X}
        y={PILL_PAD_Y}
        text={text}
        fontSize={PILL_FONT_SIZE}
        fontFamily={PILL_FONT_FAMILY}
        fontStyle="500"
        fill={PILL_FG_FILL}
        listening={false}
      />
    </Group>
  )
}

/**
 * Live preview for the rectangle/room tool. Mounted by `CanvasStage` only
 * while the tool is in active drag. Renders:
 *
 *   1. A dashed rectangle outline showing the rectangle the user will
 *      commit on release. Painted in the same blue as the wall-tool
 *      preview so the two tools feel related.
 *   2. Two dimension pills — one at the midpoint of the top edge
 *      (width) and one at the midpoint of the right edge (height).
 *      Both use the same length+angle helper as the WallDrawingOverlay
 *      pill so the readout style stays consistent across the editor.
 *
 * The pills are inverse-zoom-scaled the same way the wall-drawing pills
 * are, so the user gets a fixed-size readout regardless of canvas zoom.
 *
 * The component is a no-op render (`null`) when `preview` is null —
 * keeping it permanently mounted in `CanvasStage`'s tree means we don't
 * need a separate "is the tool active" gate at the call site.
 */
export function RoomDrawingOverlay({ preview }: RoomDrawingOverlayProps) {
  const stageScale = useCanvasStore((s) => s.stageScale)
  const projectScale = useCanvasStore((s) => s.settings.scale)
  const projectScaleUnit = useCanvasStore((s) => s.settings.scaleUnit)

  if (!preview) return null
  const { startX, startY, endX, endY } = preview
  const ax = Math.min(startX, endX)
  const ay = Math.min(startY, endY)
  const bx = Math.max(startX, endX)
  const by = Math.max(startY, endY)
  const w = bx - ax
  const h = by - ay
  // Don't render anything for a zero-area drag (a click-without-drag).
  // Avoids a "1×0 ghost rectangle" flash at the press point before the
  // user starts moving.
  if (w === 0 || h === 0) return null

  const invScale = stageScale > 0 ? 1 / stageScale : 1
  // Width pill anchored at the midpoint of the top edge — that's the
  // standard architectural-drawing convention for a "width" dimension.
  // Height pill anchored at the midpoint of the right edge.
  const widthPillCx = (ax + bx) / 2
  const widthPillCy = ay
  const heightPillCx = bx
  const heightPillCy = (ay + by) / 2

  // Build text using the SAME helper as WallDrawingOverlay so the
  // numeric format and angle indicator are identical between tools.
  // Width segment runs left→right at 0°, height runs top→bottom at 90°.
  const widthAngle = segmentAngleDeg(ax, ay, bx, ay)
  const heightAngle = segmentAngleDeg(bx, ay, bx, by)
  const widthText = formatDimensionPillText(w, widthAngle, projectScale, projectScaleUnit)
  const heightText = formatDimensionPillText(h, heightAngle, projectScale, projectScaleUnit)

  return (
    <Layer listening={false}>
      <Rect
        x={ax}
        y={ay}
        width={w}
        height={h}
        stroke="#3B82F6"
        strokeWidth={2}
        dash={[8, 4]}
        fillEnabled={false}
        listening={false}
      />
      <DimensionPill
        keySuffix="w"
        cx={widthPillCx}
        cy={widthPillCy}
        invScale={invScale}
        text={widthText}
      />
      <DimensionPill
        keySuffix="h"
        cx={heightPillCx}
        cy={heightPillCy}
        invScale={invScale}
        text={heightText}
      />
    </Layer>
  )
}
