import { Layer, Rect, Text } from 'react-konva'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useFloorStore } from '../../../stores/floorStore'

/**
 * Renders translucent, labeled rectangles for every neighborhood on the
 * active floor. The layer sits BELOW `ElementRenderer` so seats, walls,
 * and furniture render on top of the tint.
 *
 * `listening={false}` — neighborhood picking happens through the
 * `NeighborhoodEditOverlay` so this layer stays cheap on pointer events.
 * The main canvas doesn't need to hit-test tinted rectangles; the
 * dedicated overlay owns that flow and lets this layer batch-repaint
 * without interaction concerns.
 */
export function NeighborhoodLayer() {
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)

  const visible = Object.values(neighborhoods).filter(
    (n) => n.floorId === activeFloorId,
  )

  if (visible.length === 0) return <Layer listening={false} />

  return (
    <Layer listening={false}>
      {visible.flatMap((n) => {
        const left = n.x - n.width / 2
        const top = n.y - n.height / 2
        return [
          <Rect
            key={`${n.id}-fill`}
            name={`neighborhood-${n.id}`}
            x={left}
            y={top}
            width={n.width}
            height={n.height}
            // Fill: hex color at 15% alpha. Konva accepts an 8-digit hex
            // string — '26' ≈ 0.15 * 255 rounded. Keeping the alpha in
            // the fill string (rather than via the `opacity` attribute)
            // means the stroke stays fully opaque so the outline reads
            // clearly even when the tint is very faint.
            fill={`${n.color}26`}
            stroke={n.color}
            strokeWidth={1}
            dash={[6, 4]}
          />,
          <Text
            key={`${n.id}-label`}
            name={`neighborhood-label-${n.id}`}
            x={left + 6}
            y={top + 4}
            text={n.name}
            fontSize={12}
            fontStyle="bold"
            fill={n.color}
          />,
        ]
      })}
    </Layer>
  )
}
