import { Layer, Path, Circle, Group, Rect, Text } from 'react-konva'
import { distanceBetween } from '../../../lib/geometry'
import { useCanvasStore } from '../../../stores/canvasStore'
import { wallPathData } from '../../../lib/wallPath'
import {
  formatDimensionPillText,
  segmentAngleDeg,
} from '../../../lib/wallDimensionPill'
import { ENDPOINT_SNAP_PX } from '../../../lib/wallSnap'

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

// ---------------------------------------------------------------------------
// Dimension pill (P1, Fix 1)
// ---------------------------------------------------------------------------
//
// Each in-flight wall segment renders a small rounded-rect pill at its
// midpoint with the segment's real-world length and angle. The pill is
// painted in inverse-zoom-scaled SCREEN pixels (same idiom as
// `AlignmentGuides`) so it stays a constant readable size regardless
// of canvas zoom, and so the user's mental model — "this is a heads-up
// display, not part of the drawing" — holds at every zoom level.
//
// The pill component is intentionally co-located with WallDrawingOverlay
// (rather than promoted to its own file) because it has no consumer
// outside the wall-drawing tool: the alignment-guide labels have their
// own pill, the measure tool has its own readout, and so on. Sharing a
// generic "TextPill" abstraction across all three would couple their
// styling pages prematurely.
//
// Constants are declared at module scope rather than inline so the test
// file can assert against the exact font-size used at render time
// without round-tripping through Konva's draw.

const PILL_FONT_SIZE = 11
const PILL_PAD_X = 6
const PILL_PAD_Y = 3
const PILL_LINE_HEIGHT = 13
const PILL_CORNER_RADIUS = 4
// Translucent white background so the pill reads on dark walls AND
// floor backgrounds without overpowering the geometry underneath.
// Same alpha tier as the alignment-guide pill so the two readouts feel
// like part of one coherent HUD layer.
const PILL_BG_FILL = '#ffffff'
const PILL_BG_OPACITY = 0.92
const PILL_BG_STROKE = '#94a3b8'   // slate-400 — soft outline so the pill
                                   // doesn't blur into a white background
const PILL_FG_FILL = '#0f172a'     // slate-900 — high-contrast readable text
const PILL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, monospace'

interface DimensionPillProps {
  /** Anchor (segment midpoint, in canvas units). The pill will center on this. */
  cx: number
  cy: number
  /** Inverse stage zoom — passed in so each pill doesn't re-read the store. */
  invScale: number
  /** Pre-formatted, possibly multi-line, label string. */
  text: string
}

/**
 * Render a single dimension pill anchored at (cx, cy).
 *
 * Sizing math: the pill's width grows with the longest line of text,
 * the height grows with the line count. We approximate text width with
 * `length * fontSize * 0.6` (monospace fudge factor — see the same
 * trick in AlignmentGuides). Actual Konva text-measurement would
 * require the canvas font metrics to be loaded, which is overkill for
 * a heads-up readout that's allowed to be a couple of sub-pixels off.
 */
function DimensionPill({ cx, cy, invScale, text }: DimensionPillProps) {
  const lines = text.split('\n')
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0)
  // 0.6 em-width is a reasonable monospace fallback (digits are slimmer
  // than this; punctuation slightly wider — net error is < 1 pixel).
  const widthPx = Math.max(28, maxChars * PILL_FONT_SIZE * 0.6) + PILL_PAD_X * 2
  const heightPx = lines.length * PILL_LINE_HEIGHT + PILL_PAD_Y * 2

  return (
    <Group
      x={cx}
      y={cy}
      // Centre the pill on (cx, cy). offset is applied BEFORE the inverse
      // scale below, so the px values convert to canvas units at the
      // current zoom — same trick AlignmentGuides uses.
      offsetX={widthPx / 2}
      offsetY={heightPx / 2}
      scaleX={invScale}
      scaleY={invScale}
      listening={false}
    >
      <Rect
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
        // Tabular figures keep the digit columns aligned across re-renders
        // so the readout doesn't jitter as numbers change. Konva passes
        // `fontVariant` to the underlying canvas `font` shorthand.
        fontStyle="500"
        fill={PILL_FG_FILL}
        listening={false}
      />
    </Group>
  )
}

export function WallDrawingOverlay({
  points,
  bulges,
  currentPoint,
  isDrawing,
  previewBulge,
}: WallDrawingOverlayProps) {
  const settings = useCanvasStore((s) => s.settings)
  const stageScale = useCanvasStore((s) => s.stageScale)

  // Pre-drawing ghost: when the wall tool is armed and the cursor is over
  // the canvas but the user hasn't clicked yet, render a small dimmed
  // vertex dot at the snap target. Without this, the wall tool feels like
  // it "does nothing" on hover — compare with the door/window tools which
  // already render an AttachmentGhost preview. useWallDrawing updates
  // `currentPoint` on mousemove regardless of drawing state, so this is
  // effectively free.
  if (!isDrawing) {
    if (!currentPoint) return null
    return (
      <Layer listening={false}>
        <Circle
          x={currentPoint.x}
          y={currentPoint.y}
          radius={4}
          fill="#3B82F6"
          stroke="#ffffff"
          strokeWidth={2}
          opacity={0.45}
        />
      </Layer>
    )
  }

  if (points.length === 0) return null

  // The preview extends `points` by `currentPoint` and `bulges` by the
  // live preview bulge (or 0 if we're not dragging).
  const previewPoints = currentPoint
    ? [...points, currentPoint.x, currentPoint.y]
    : points
  const previewBulges = currentPoint ? [...bulges, previewBulge ?? 0] : bulges

  // Inverse stage scale keeps every pill a fixed size on screen as the
  // user zooms. Guard against a pathological zero scale.
  const invScale = stageScale > 0 ? 1 / stageScale : 1

  // Build one pill per segment we want to label. A wall in progress with
  // N committed vertices has N-1 committed-but-pending segments, plus a
  // live preview segment when `currentPoint` is set. Each pill is
  // anchored at the segment midpoint.
  //
  // We iterate over `previewPoints` so the live segment falls out of the
  // loop naturally — no special-case branch for "is this the live one."
  // The bulge for each segment comes from `previewBulges[i]`; the live
  // segment uses `previewBulge` (or 0) and the committed segments use
  // their stored bulge (always 0 when the user committed via plain
  // click; non-zero only when a drag-bulge was committed).
  type PillSpec = { key: string; cx: number; cy: number; text: string }
  const pills: PillSpec[] = []
  if (settings.scaleUnit) {
    for (let i = 0; i + 3 < previewPoints.length; i += 2) {
      const x0 = previewPoints[i]
      const y0 = previewPoints[i + 1]
      const x1 = previewPoints[i + 2]
      const y1 = previewPoints[i + 3]
      const chord = distanceBetween({ x: x0, y: y0 }, { x: x1, y: y1 })
      if (chord <= 0) continue
      const segIdx = i / 2
      const segBulge = previewBulges[segIdx] ?? 0
      const len = segmentLength(chord, segBulge)
      const angle = segmentAngleDeg(x0, y0, x1, y1)
      const text = formatDimensionPillText(
        len,
        angle,
        settings.scale,
        settings.scaleUnit,
      )
      pills.push({
        key: `pill-${segIdx}`,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        text,
      })
    }
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

      {/*
        Auto-close hint (Fix 3): when the in-flight polyline has at
        least three vertices AND the cursor is within snap range of
        the FIRST committed vertex, paint a larger filled circle at
        that first vertex to tell the user "click here to close the
        room." Mirrors the visual idiom of the endpoint snap hit
        marker — a filled green dot reads as "this is what your click
        will land on" without being verbose.

        We bail when:
          - There are fewer than three committed vertices (closing
            now would produce a degenerate two-segment "shape").
          - There's no live cursor point yet.
          - The cursor is outside snap range of the start vertex.
        Each of those is a short-circuit so the hint only renders
        when the user is genuinely about to close, never as a
        passive decoration that sits on top of the start vertex
        from the moment the third click lands.
      */}
      {(() => {
        if (points.length < 6) return null
        if (!currentPoint) return null
        const firstX = points[0]
        const firstY = points[1]
        // Snap radius matches `useWallDrawing.handleCanvasMouseUp` —
        // the same `ENDPOINT_SNAP_PX / stageScale` that drives the
        // commit-time auto-close detection. Sourcing both from the
        // same constant keeps the visual cue and the actual snap
        // behaviour from drifting apart over future tweaks.
        const closeRadius = ENDPOINT_SNAP_PX / (stageScale || 1)
        const dx = currentPoint.x - firstX
        const dy = currentPoint.y - firstY
        if (dx * dx + dy * dy > closeRadius * closeRadius) return null
        return (
          <Circle
            x={firstX}
            y={firstY}
            // Slightly larger and a different fill (green) so the cue
            // reads as "snap target" rather than blending into the
            // already-rendered blue vertex dot at the same coords.
            radius={7}
            fill="#10B981"
            stroke="#ffffff"
            strokeWidth={2}
            opacity={0.85}
            listening={false}
          />
        )
      })()}

      {pills.map((p) => (
        <DimensionPill
          key={p.key}
          cx={p.cx}
          cy={p.cy}
          invScale={invScale}
          text={p.text}
        />
      ))}
    </Layer>
  )
}
