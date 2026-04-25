import { Layer, Line, Group, Rect, Text } from 'react-konva'
import { useMemo } from 'react'
import { ALIGNMENT_GUIDE_COLOR } from '../../../lib/constants'
import type { AlignmentGuide } from '../../../lib/geometry'
import { formatLength, toRealLength } from '../../../lib/units'
import { useCanvasStore } from '../../../stores/canvasStore'

interface AlignmentGuidesProps {
  guides: AlignmentGuide[]
}

/**
 * Wave 13A — distance-label styling constants.
 *
 * Dimensions are declared in SCREEN pixels and each label group is
 * rendered with `scaleX = scaleY = 1 / stageScale` so the chip stays a
 * fixed size regardless of zoom. Keeping these as module-level constants
 * makes the dimensions tweakable without hunting through the JSX, and
 * lets the test file assert exact formatter output without guessing
 * pixel math.
 */
const LABEL_FONT_SIZE = 10
const LABEL_PAD_X = 5
const LABEL_PAD_Y = 2
const LABEL_CORNER_RADIUS = 3
const LABEL_BG = '#2563eb' // Tailwind blue-600 — matches the spec's pill
const LABEL_FG = '#ffffff'
const LABEL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace'
/**
 * Skip labels for dashed guides shorter than this (in SCREEN pixels).
 * Tiny guides usually mean the two rects are overlapping on the axis —
 * the label would cover the element entirely and obscure the drag
 * target. Measured at the current zoom so zooming out hides labels
 * earlier (fewer screen pixels) and zooming in keeps them longer.
 */
const MIN_SCREEN_PX_FOR_LABEL = 20

interface PreparedLabel {
  key: string
  /** Canvas-space anchor point (centre of the label). */
  x: number
  y: number
  text: string
  /** Screen-space width in px at scale=1. */
  widthPx: number
  /** Screen-space height in px at scale=1. */
  heightPx: number
}

/**
 * Estimate the pixel width of the chip text without mounting a Konva
 * node. Using a constant em-width for the monospace fallback (0.6 of
 * the font size) is close enough that the background pill hugs the
 * glyphs — a couple of sub-pixels off is fine for a floating label.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6
}

/**
 * Live dashed-line + distance-label overlay surfaced during drag.
 *
 * The dashed lines are the legacy behaviour (unchanged). Wave 13A adds
 * a small blue-on-white pill centred on each guide showing the
 * real-world gap between the dragged element and its snap target. The
 * label is purely visual — `listening={false}` and `aria-hidden` so it
 * can't interfere with pointer events or screen-readers.
 */
export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  const stageScale = useCanvasStore((s) => s.stageScale)
  const projectScale = useCanvasStore((s) => s.settings.scale)
  const projectScaleUnit = useCanvasStore((s) => s.settings.scaleUnit)

  // Build the label payloads once per (guides, scale, unit) triple.
  // Iterating the array on every mousemove would otherwise allocate a
  // fresh array + string per frame even when nothing meaningful changed.
  const labels = useMemo<PreparedLabel[]>(() => {
    const out: PreparedLabel[] = []
    for (let i = 0; i < guides.length; i += 1) {
      const g = guides[i]
      if (g.gap === undefined || g.gapMidpoint === undefined) continue
      // Skip labels whose dashed line is too short at the current zoom to
      // host a readable chip. The dashed line extends 20 canvas units past
      // each end (`start - 20 .. end + 20`), but the informative span is
      // `start..end`; compare that to the screen-px threshold.
      const canvasSpan = Math.max(0, g.end - g.start)
      const screenSpan = canvasSpan * stageScale
      if (screenSpan < MIN_SCREEN_PX_FOR_LABEL) continue

      const real = toRealLength(g.gap, projectScale, projectScaleUnit)
      const text = `${formatLength(real, projectScaleUnit)} ${projectScaleUnit}`
      const widthPx = estimateTextWidth(text, LABEL_FONT_SIZE) + LABEL_PAD_X * 2
      const heightPx = LABEL_FONT_SIZE + LABEL_PAD_Y * 2

      // For a vertical guide, `position` is the X (constant along the
      // line) and `gapMidpoint` is the Y anchor. Horizontal guides are
      // the mirror case.
      const x = g.orientation === 'vertical' ? g.position : g.gapMidpoint
      const y = g.orientation === 'vertical' ? g.gapMidpoint : g.position

      out.push({
        key: `${i}:${g.orientation}:${g.position}`,
        x,
        y,
        text,
        widthPx,
        heightPx,
      })
    }
    return out
  }, [guides, stageScale, projectScale, projectScaleUnit])

  if (guides.length === 0) return null

  // Inverse stage scale keeps chip size + font constant on screen as the
  // user zooms. Guard against a pathological zero scale (shouldn't occur
  // thanks to ZOOM_MIN but the divide-by-zero would be catastrophic).
  const invScale = stageScale > 0 ? 1 / stageScale : 1

  return (
    <Layer listening={false}>
      {guides.map((guide, i) => (
        <Line
          key={`line-${i}`}
          points={
            guide.orientation === 'vertical'
              ? [guide.position, guide.start - 20, guide.position, guide.end + 20]
              : [guide.start - 20, guide.position, guide.end + 20, guide.position]
          }
          stroke={ALIGNMENT_GUIDE_COLOR}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      ))}
      {labels.map((label) => (
        <Group
          key={`lbl-${label.key}`}
          // Konva scaling keeps the pill a fixed size in SCREEN pixels
          // so zoom doesn't shrink or balloon the text. The group is
          // centred on (x, y) by offsetting half the pre-scale pixel
          // size — offset is applied BEFORE the scale transform so
          // multiplying by invScale converts the px offset into canvas
          // units at the current zoom.
          x={label.x}
          y={label.y}
          offsetX={label.widthPx / 2}
          offsetY={label.heightPx / 2}
          scaleX={invScale}
          scaleY={invScale}
          listening={false}
          // Marker read by the test harness — Konva renders to canvas
          // so there's no DOM role/aria surface, but our jest mock for
          // react-konva preserves props, which is enough for assertion.
          aria-hidden={true}
        >
          <Rect
            x={0}
            y={0}
            width={label.widthPx}
            height={label.heightPx}
            fill={LABEL_BG}
            cornerRadius={LABEL_CORNER_RADIUS}
            listening={false}
          />
          <Text
            x={LABEL_PAD_X}
            y={LABEL_PAD_Y}
            text={label.text}
            fontSize={LABEL_FONT_SIZE}
            fontFamily={LABEL_FONT_FAMILY}
            fontStyle="500"
            fill={LABEL_FG}
            listening={false}
          />
        </Group>
      ))}
    </Layer>
  )
}
