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
 *
 * Refined to be less visually intrusive — the previous 10px blue pill
 * was big enough that a dense snap would cover the drag target and
 * obscure the grid underneath. Now: 9px font, 3/2 padding, a slightly
 * translucent background so the grid and neighbouring elements read
 * through. See MAX_LABELS_PER_ORIENTATION below for the label count
 * cap that complements this.
 */
const LABEL_FONT_SIZE = 9
const LABEL_PAD_X = 3
const LABEL_PAD_Y = 1.5
const LABEL_CORNER_RADIUS = 2
const LABEL_BG = '#1e3a8a' // Tailwind blue-900 — darker but translucent; reads on grid
const LABEL_BG_OPACITY = 0.88
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

/**
 * At most one distance label per orientation (horizontal, vertical),
 * for a total of two on screen at any moment. This mirrors the idiom
 * in Figma / Sketch / Framer: while dragging, the tool surfaces the
 * ONE distance that matters on each axis — the nearest snap target —
 * rather than every possible alignment. Before this cap the
 * overlay could easily paint five or six blue pills stacked over
 * each other because the guide generator emits up to six per nearby
 * rect (center×2 + edges×4). The cap is enforced after guide
 * deduplication, so a single logical alignment line only gets
 * counted once.
 */
const MAX_LABELS_PER_ORIENTATION = 1

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

  // Dedupe guide LINES first. `findAlignmentGuides` happily emits
  // multiple guides with the same (orientation, position) — for
  // example when the moving rect shares a left edge AND a
  // center-X with two different neighbours, two vertical guides
  // arrive at the same X. The dashed lines would draw on top of
  // each other (invisible to the user) and each would get its own
  // label chip — that's the "too many pop-ups" the user called
  // out. Rounding to the nearest canvas unit is lenient enough to
  // catch sub-pixel drift while still treating truly distinct
  // alignments as separate. When two guides collapse, we keep the
  // one with the smallest non-zero gap since it's the nearest
  // real neighbour — more informative than a center alignment
  // against a far-away rect.
  const dedupedGuides = useMemo<AlignmentGuide[]>(() => {
    const byKey = new Map<string, AlignmentGuide>()
    for (const g of guides) {
      const key = `${g.orientation}:${Math.round(g.position)}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, g)
        continue
      }
      // Prefer the guide with the smaller positive gap (closer
      // neighbour). A gap of 0 means overlap, which is the least
      // interesting signal — only adopt it if the existing has no
      // gap info at all.
      const existingGap = existing.gap
      const incomingGap = g.gap
      if (incomingGap === undefined) continue
      if (existingGap === undefined) {
        byKey.set(key, g)
        continue
      }
      if (incomingGap > 0 && (existingGap === 0 || incomingGap < existingGap)) {
        byKey.set(key, g)
      }
    }
    return Array.from(byKey.values())
  }, [guides])

  // Build the label payloads once per (guides, scale, unit) triple.
  // Iterating the array on every mousemove would otherwise allocate a
  // fresh array + string per frame even when nothing meaningful changed.
  //
  // The label set is intentionally capped at one per orientation —
  // see MAX_LABELS_PER_ORIENTATION. For each axis we pick the guide
  // with the smallest non-zero gap (i.e., the nearest real snap),
  // falling back to the first overlap guide if nothing has a
  // positive gap to report.
  const labels = useMemo<PreparedLabel[]>(() => {
    type Candidate = { g: AlignmentGuide; i: number; screenSpan: number }
    const byAxis: Record<'horizontal' | 'vertical', Candidate[]> = {
      horizontal: [],
      vertical: [],
    }
    for (let i = 0; i < dedupedGuides.length; i += 1) {
      const g = dedupedGuides[i]
      if (g.gap === undefined || g.gapMidpoint === undefined) continue
      const canvasSpan = Math.max(0, g.end - g.start)
      const screenSpan = canvasSpan * stageScale
      if (screenSpan < MIN_SCREEN_PX_FOR_LABEL) continue
      byAxis[g.orientation].push({ g, i, screenSpan })
    }

    // Sort each axis' candidates: smallest positive gap first, then
    // by longer span (more visible guide). Overlaps (gap === 0) sink
    // to the end so they're only chosen if nothing else qualifies.
    const ranker = (a: Candidate, b: Candidate): number => {
      const aGap = a.g.gap ?? 0
      const bGap = b.g.gap ?? 0
      const aIsOverlap = aGap === 0 ? 1 : 0
      const bIsOverlap = bGap === 0 ? 1 : 0
      if (aIsOverlap !== bIsOverlap) return aIsOverlap - bIsOverlap
      if (aGap !== bGap) return aGap - bGap
      return b.screenSpan - a.screenSpan
    }
    byAxis.horizontal.sort(ranker)
    byAxis.vertical.sort(ranker)

    const chosen = [
      ...byAxis.horizontal.slice(0, MAX_LABELS_PER_ORIENTATION),
      ...byAxis.vertical.slice(0, MAX_LABELS_PER_ORIENTATION),
    ]

    const out: PreparedLabel[] = []
    for (const { g, i } of chosen) {
      if (g.gap === undefined || g.gapMidpoint === undefined) continue
      const real = toRealLength(g.gap, projectScale, projectScaleUnit)
      const text = `${formatLength(real, projectScaleUnit)} ${projectScaleUnit}`
      const widthPx = estimateTextWidth(text, LABEL_FONT_SIZE) + LABEL_PAD_X * 2
      const heightPx = LABEL_FONT_SIZE + LABEL_PAD_Y * 2
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
  }, [dedupedGuides, stageScale, projectScale, projectScaleUnit])

  if (dedupedGuides.length === 0) return null

  // Inverse stage scale keeps chip size + font constant on screen as the
  // user zooms. Guard against a pathological zero scale (shouldn't occur
  // thanks to ZOOM_MIN but the divide-by-zero would be catastrophic).
  const invScale = stageScale > 0 ? 1 / stageScale : 1

  return (
    <Layer listening={false}>
      {dedupedGuides.map((guide, i) => (
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
            opacity={LABEL_BG_OPACITY}
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
