import { Group, Path, Text } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { wallPathData, wallSegments, segmentMidpoint } from '../../../lib/wallPath'

interface WallRendererProps {
  element: WallElement
}

/**
 * Render a wall as a single <Path> (plus optional secondary accents for
 * non-solid wallTypes). `wallPathData` already emits `L` commands for straight
 * (bulge === 0) segments and `A` commands for curved ones, so a uniform
 * <Path> handles both cases. Using a single primitive keeps the Konva node
 * identity stable across bulge changes — toggling between different node
 * types (e.g. <Line> ↔ <Path>) would force react-konva to destroy and
 * recreate the node, which disrupts the Transformer ref and any in-flight
 * drag. Hit-testing width is bumped so thin walls stay clickable.
 *
 * Wall types (see `WallType` in types/elements):
 *   - `solid`       default drywall treatment (existing stroke).
 *   - `glass`       lighter color (#93C5FD) + 0.4 opacity.
 *   - `half-height` a secondary thinner dashed rail painted over the main
 *                   stroke, signalling a short/pony wall.
 *   - `demountable` dashed stroke + an "M" text marker at the first
 *                   segment's midpoint for modular/reconfigurable walls.
 *
 * These effects compose with the orthogonal `dashStyle` (solid/dashed/dotted)
 * — e.g. a glass wall can still be `dashStyle: 'dashed'`. Wall-type dashing
 * only overrides the base dash array when the user hasn't explicitly picked
 * a dashStyle, so both axes stay editable.
 */
export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const wallType = element.wallType ?? 'solid'

  // Glass gets a lighter preset stroke when the user hasn't overridden the
  // stored stroke from the default. Selection highlight always wins so the
  // user can see what's selected regardless of type.
  let baseStroke = element.style.stroke
  if (wallType === 'glass' && baseStroke === '#111827') {
    baseStroke = '#93C5FD'
  }
  const stroke = isSelected ? '#3B82F6' : baseStroke
  const hitStrokeWidth = Math.max(12, element.thickness + 6)

  // Opacity + dash derive from wallType first, then dashStyle can still
  // override the dash pattern when set explicitly.
  const opacity = wallType === 'glass' ? 0.4 : 1

  // Scale dash patterns by thickness so the rhythm reads well at any wall
  // weight. 'dotted' uses a very short dash + round line cap (Konva
  // inherits the cap inside the gap so a 0.1-unit "dash" renders as a
  // circular dot the width of the stroke).
  let dash: number[] | undefined
  if (element.dashStyle === 'dashed') {
    dash = [element.thickness * 2.5, element.thickness * 1.5]
  } else if (element.dashStyle === 'dotted') {
    dash = [0.1, element.thickness * 1.4]
  } else if (wallType === 'demountable') {
    // Demountable walls imply a dashed treatment even without an explicit
    // dashStyle. Users can still pick 'solid' in the line-style picker to
    // override — the branch above takes precedence when dashStyle is set.
    dash = [element.thickness * 2.5, element.thickness * 1.5]
  }

  const pathData = wallPathData(element.points, element.bulges)

  // Midpoint for the demountable "M" marker. Use the first segment's
  // midpoint (arc midpoint if curved) — for a multi-segment polyline this
  // reads as "one marker per wall", which is what export legends expect.
  let markerX = 0
  let markerY = 0
  if (wallType === 'demountable' && element.points.length >= 4) {
    const segs = wallSegments(element.points, element.bulges)
    if (segs.length > 0) {
      const mid = segmentMidpoint(segs[0])
      markerX = mid.x
      markerY = mid.y
    }
  }

  return (
    <Group opacity={opacity}>
      <Path
        data={pathData}
        stroke={stroke}
        strokeWidth={element.thickness}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={hitStrokeWidth}
        fillEnabled={false}
        dash={dash}
      />
      {wallType === 'half-height' && (
        // Secondary dashed rail painted on the same path at reduced opacity
        // + stroke width. Reads as a "short wall" hatch without needing
        // a parallel-offset path (which would require normal sampling and
        // get expensive for curved segments). The dash is short+tight so
        // it visually contrasts with user-chosen dashStyle if any.
        <Path
          data={pathData}
          stroke={stroke}
          strokeWidth={Math.max(1, element.thickness * 0.4)}
          opacity={0.5}
          lineCap="round"
          lineJoin="round"
          dash={[element.thickness * 0.6, element.thickness * 0.6]}
          listening={false}
          fillEnabled={false}
        />
      )}
      {wallType === 'demountable' && element.points.length >= 4 && (
        <Text
          x={markerX}
          y={markerY}
          text="M"
          fontSize={Math.max(10, element.thickness * 1.6)}
          fontStyle="bold"
          fill={stroke}
          offsetX={Math.max(10, element.thickness * 1.6) * 0.3}
          offsetY={Math.max(10, element.thickness * 1.6) * 0.5}
          listening={false}
        />
      )}
    </Group>
  )
}
