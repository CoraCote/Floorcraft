import { Group, Line, Path, Text } from 'react-konva'
import type { WallElement, WallType } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { wallPathData, wallSegments, segmentMidpoint } from '../../../lib/wallPath'
import { buildWallPolygon } from '../../../lib/wallPolygon'
import { useTheme } from '../../../lib/theme'

interface WallRendererProps {
  element: WallElement
}

/**
 * P3 visual contract: walls render as **closed polygons** offset from the
 * centerline by `thickness/2` on each side. This replaces the previous
 * "stroked polyline" treatment so a wall reads as a real architectural
 * surface (filled body + outline) instead of a fat line.
 *
 * # Layer order
 *
 * The Group composes (bottom → top):
 *   1. The polygon body  — `<Line closed fill stroke>` (the wall surface)
 *   2. wallType accents  — half-height dashed rail, demountable "M"
 *   3. Centerline dash overlay — only when `dashStyle ∈ {dashed, dotted}`,
 *      drawn as a fine `<Path>` along the wall centerline. We keep the
 *      polygon outline crisp instead of dashing the polygon ring itself,
 *      which would visually break up the surface.
 *
 * Doors and windows are rendered by their own components on a layer
 * ABOVE walls (see Canvas layer ordering); they paint opaque rectangles
 * over the polygon to simulate "cuts" in the wall — no boolean op needed.
 *
 * # Per-type fill palette
 *
 * The user can override the stored `style.stroke` from the inspector;
 * when they do, that color drives the polygon's outline. The fill is
 * derived from `wallType`:
 *   - solid       → warm gray `#D6D3D1` (reads on cream desk fill)
 *   - glass       → translucent blue `#DBEAFE` @ 0.4 opacity
 *   - half-height → light gray `#E7E5E4` (lighter signals "short wall")
 *   - demountable → warm gray `#D6D3D1`, dashed centerline overlay
 *
 * Selection & hover behaviour:
 *   - Selected → polygon outline switches to `#3B82F6` and thickens to
 *     2.5px, so the wall reads "selected" without changing the fill body.
 *   - Click hit-test happens on the closed polygon (Konva handles this
 *     for `<Line closed>` automatically when `listening`).
 *
 * Vertex handles (rendered by `WallEditOverlay`) still sit at the
 * **centerline** vertices, not at the offset polygon corners — the user
 * is editing the centerline, not the polygon. That's preserved here by
 * not changing how the centerline is exposed.
 */
export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const wallType: WallType = element.wallType ?? 'solid'
  const { resolvedTheme } = useTheme()

  // Build the offset polygon ring once per render. The buildWallPolygon
  // helper is pure and cheap (linear in segments); React re-rendering
  // when points/bulges/thickness change recomputes naturally.
  const { ring } = buildWallPolygon(element.points, element.bulges, element.thickness)

  // Outline color: user's stored stroke OR a sensible default per theme,
  // unless the wall is selected (selection always wins so the user sees
  // their selection regardless of color).
  let baseStroke = element.style.stroke
  // Default wall stroke is `#111827` (gray-900). On a dark canvas this is
  // invisible; swap to gray-100 when the user hasn't overridden.
  if (resolvedTheme === 'dark' && baseStroke === '#111827') {
    baseStroke = '#F3F4F6'
  }
  const outlineStroke = isSelected ? '#3B82F6' : baseStroke
  const outlineWidth = isSelected ? 2.5 : 1

  // Per-type fill. Glass also gets a translucent group opacity so doors
  // / windows underneath bleed through when they overlap, matching
  // architectural-glass conventions.
  const fill = fillForWallType(wallType, resolvedTheme)
  const groupOpacity = wallType === 'glass' ? 0.55 : 1

  // Centerline dash overlay. Only rendered when the user explicitly set
  // dashStyle, OR when the wall type is demountable (which implies
  // dashed). Solid demountable walls still get the dashed indicator —
  // the user can override by picking 'solid' in the line-style picker.
  const dashStyle = element.dashStyle
  let dash: number[] | undefined
  if (dashStyle === 'dashed') {
    dash = [element.thickness * 2.5, element.thickness * 1.5]
  } else if (dashStyle === 'dotted') {
    dash = [0.1, element.thickness * 1.4]
  } else if (wallType === 'demountable') {
    dash = [element.thickness * 2.5, element.thickness * 1.5]
  }

  // Half-height secondary rail: a thin dashed centerline indicating "short
  // wall". Painted on top of the polygon at reduced opacity. Same data
  // as wallPathData(centerline) so it tracks bulged segments.
  const centerlinePath =
    wallType === 'half-height' || dash
      ? wallPathData(element.points, element.bulges)
      : null

  // Demountable "M" marker at the first segment's midpoint (chord/arc).
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

  // Hit-stroke width: keep the polygon clickable even for very thin walls
  // by widening the hit-test region on the outline. listening defaults to
  // true; locked walls turn it off.
  const hitStrokeWidth = Math.max(12, element.thickness + 6)

  return (
    <Group opacity={groupOpacity}>
      {/* Polygon body — fill + thin outline. This is THE wall surface. */}
      <Line
        points={ring}
        closed
        fill={fill}
        stroke={outlineStroke}
        strokeWidth={outlineWidth}
        lineJoin="round"
        listening={!element.locked}
        hitStrokeWidth={hitStrokeWidth}
      />
      {/* half-height: secondary dashed rail on the centerline */}
      {wallType === 'half-height' && centerlinePath && (
        <Path
          data={centerlinePath}
          stroke={outlineStroke}
          strokeWidth={Math.max(1, element.thickness * 0.4)}
          opacity={0.5}
          lineCap="round"
          lineJoin="round"
          dash={[element.thickness * 0.6, element.thickness * 0.6]}
          listening={false}
          fillEnabled={false}
        />
      )}
      {/* Dashed/dotted centerline overlay. Painted on TOP of the polygon
          so the dash pattern reads without breaking up the polygon outline. */}
      {dash && centerlinePath && (
        <Path
          data={centerlinePath}
          stroke={outlineStroke}
          strokeWidth={Math.max(1, element.thickness * 0.4)}
          opacity={0.7}
          lineCap="round"
          dash={dash}
          listening={false}
          fillEnabled={false}
        />
      )}
      {/* Demountable: small "M" marker at the first segment's midpoint */}
      {wallType === 'demountable' && element.points.length >= 4 && (
        <Text
          x={markerX}
          y={markerY}
          text="M"
          fontSize={Math.max(10, element.thickness * 1.6)}
          fontStyle="bold"
          fill={outlineStroke}
          offsetX={Math.max(10, element.thickness * 1.6) * 0.3}
          offsetY={Math.max(10, element.thickness * 1.6) * 0.5}
          listening={false}
        />
      )}
    </Group>
  )
}

/**
 * Pick the polygon fill color for a wall type. Light-mode + dark-mode
 * variants are tuned to read on the canvas's neutral background while
 * not dominating the visual hierarchy (rooms/desks should still pop).
 */
function fillForWallType(type: WallType, theme: 'light' | 'dark'): string {
  if (theme === 'dark') {
    switch (type) {
      case 'glass':
        return '#1E3A5F'
      case 'half-height':
        return '#3F3F46'
      case 'demountable':
      case 'solid':
      default:
        return '#52525B'
    }
  }
  switch (type) {
    case 'glass':
      return '#DBEAFE'
    case 'half-height':
      return '#E7E5E4'
    case 'demountable':
    case 'solid':
    default:
      return '#D6D3D1'
  }
}
