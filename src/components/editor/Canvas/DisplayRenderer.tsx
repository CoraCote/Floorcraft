import { Group, Rect, Circle, Text } from 'react-konva'
import type { DisplayElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { truncateToWidth } from '../../../lib/textTruncate'

interface Props {
  element: DisplayElement
}

/**
 * Threshold for showing the under-element label band. Default size is
 * 80×16 — the height alone is too short for a label inside, so the
 * label sits BELOW. We drop it entirely when the silhouette is too
 * small to be associated with any text.
 */
const TOO_SMALL_FOR_LABEL = (w: number, h: number) => w < 60 || h < 10

/**
 * Display / monitor renderer.
 *
 * Visual identity is a dark rounded rectangle (the screen) with a
 * thin lighter inset (the active picture area) and a small green
 * power-LED dot at the bottom-right. The default 80×16 footprint
 * matches the wall-mounted landscape orientation that's by far the
 * most common in office floor plans (lobby signage, conference
 * monitors). Users can resize / rotate for portrait wall art mounts.
 *
 * Status:
 *   - `'broken'`     red stroke + the LED tints red.
 *   - `'planned'`    dashed outline.
 *   - default        green LED conveys "powered, healthy".
 */
export function DisplayRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  const w = element.width
  const h = element.height
  const isBroken = element.deviceStatus === 'broken'
  const isPlanned = element.deviceStatus === 'planned'

  const baseStroke = isBroken ? '#DC2626' : element.style.stroke
  const stroke = isSelected ? '#3B82F6' : baseStroke
  const strokeWidth = isSelected ? 2 : element.style.strokeWidth
  const dash = isPlanned ? [4, 3] : undefined

  // Bezel inset — leaves a 12-15% margin around the active screen.
  // Clamped to a min so very small displays still show a visible
  // bezel/screen contrast pair instead of merging into one rect.
  const bezel = Math.max(1.5, Math.min(w, h) * 0.12)
  const screenW = w - bezel * 2
  const screenH = h - bezel * 2

  const labelText = element.model ?? element.label
  const showLabel = !TOO_SMALL_FOR_LABEL(w, h) && !!labelText

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Outer body — the bezel. Dark fill (the chassis colour) so the
       *  inner screen rect can be lighter and read as "active area". */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={Math.min(3, h / 3)}
        opacity={element.style.opacity}
        dash={dash}
      />
      {/* Inner screen — slightly lighter than the bezel so the contrast
       *  is visible at small zooms. */}
      <Rect
        x={-screenW / 2}
        y={-screenH / 2}
        width={screenW}
        height={screenH}
        fill="#475569"
        opacity={element.style.opacity * 0.7}
        cornerRadius={Math.min(2, screenH / 4)}
        listening={false}
      />
      {/* Power LED — a small dot at the bottom-right of the bezel.
       *  Green for healthy, red for broken. */}
      <Circle
        x={w / 2 - bezel * 0.6}
        y={h / 2 - bezel * 0.6}
        radius={Math.max(0.8, bezel * 0.25)}
        fill={isBroken ? '#DC2626' : '#22C55E'}
        opacity={element.style.opacity}
        listening={false}
      />
      {showLabel && (
        <Text
          text={truncateToWidth(labelText, Math.max(20, w), 9)}
          x={-w / 2}
          y={h / 2 + 2}
          width={w}
          align="center"
          fontSize={9}
          fill="#374151"
          listening={false}
        />
      )}
    </Group>
  )
}
