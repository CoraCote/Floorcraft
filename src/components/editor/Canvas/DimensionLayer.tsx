import { Layer, Label, Tag, Text } from 'react-konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { isWallElement } from '../../../types/elements'

/** Segments shorter than this (in canvas px) are not labeled to avoid clutter. */
const MIN_LABELED_SEGMENT_PX = 4

/**
 * Overlay layer that, when `settings.showDimensions` is on, stamps a
 * length label at the midpoint of every wall segment. Length is measured
 * as the straight chord between consecutive `points` — for curved
 * segments this is still the chord length (the arc length would be
 * slightly larger; intentional simplification in v1).
 *
 * Labels use white-backgrounded Text (via Konva's <Label> + <Tag>) so
 * they stay legible when walls cross grid lines or other content.
 */
export function DimensionLayer() {
  const showDimensions = useCanvasStore((s) => s.settings.showDimensions)
  const scale = useCanvasStore((s) => s.settings.scale)
  const scaleUnit = useCanvasStore((s) => s.settings.scaleUnit)
  const elements = useElementsStore((s) => s.elements)

  if (!showDimensions) return null

  const labels: React.ReactNode[] = []
  for (const el of Object.values(elements)) {
    if (!isWallElement(el)) continue
    if (el.visible === false) continue
    const pts = el.points
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i]
      const y0 = pts[i + 1]
      const x1 = pts[i + 2]
      const y1 = pts[i + 3]
      const dx = x1 - x0
      const dy = y1 - y0
      const lenPx = Math.hypot(dx, dy)
      if (lenPx < MIN_LABELED_SEGMENT_PX) continue

      const lenUnits = lenPx * scale
      const text = `${lenUnits.toFixed(1)} ${scaleUnit}`
      const midX = (x0 + x1) / 2
      const midY = (y0 + y1) / 2

      labels.push(
        <Label
          key={`${el.id}-${i}`}
          x={midX}
          y={midY}
          // Offset the label up-left so it sits above the segment rather
          // than on top of it. Small constant offsets read fine at any
          // zoom since Konva scales the label with the stage transform.
          offsetX={0}
          offsetY={10}
          listening={false}
        >
          <Tag fill="#ffffff" stroke="#9CA3AF" strokeWidth={0.5} cornerRadius={2} />
          <Text
            text={text}
            fontSize={10}
            padding={2}
            fill="#374151"
          />
        </Label>,
      )
    }
  }

  return <Layer listening={false}>{labels}</Layer>
}
