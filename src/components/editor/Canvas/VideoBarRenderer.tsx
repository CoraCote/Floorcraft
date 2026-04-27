import { Group, Rect, Circle, Text } from 'react-konva'
import type { VideoBarElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { truncateToWidth } from '../../../lib/textTruncate'

interface Props {
  element: VideoBarElement
}

const TOO_SMALL_FOR_LABEL = (w: number, h: number) => w < 60 || h < 10

/**
 * Video-bar (conference camera + mic array + speaker) renderer.
 *
 * Visual identity is a long slim pill — the form factor every modern
 * conference video bar (Logitech Rally Bar, Poly Studio X, Neat Bar)
 * shares — with a central camera dot and four smaller mic-array dots
 * arranged symmetrically around it. The mic dots disambiguate the
 * silhouette from a plain monitor at first glance (a video bar lives
 * BELOW or ABOVE a display in real conference rooms; both can appear
 * in the same plan and need to read as different things).
 *
 * Status:
 *   - `'broken'`  red stroke + red camera dot.
 *   - `'planned'` dashed outline.
 */
export function VideoBarRenderer({ element }: Props) {
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

  // Camera + mic-array dot sizes scale with bar height so they remain
  // proportional after resizes. Camera is ~30% of height; mic dots
  // ~18% so they read as smaller satellites.
  const camR = Math.max(1.5, h * 0.3)
  const micR = Math.max(0.8, h * 0.18)
  // Mic dots are placed at ±25% and ±42% along the bar's width — two
  // pairs flanking the camera, so the array is symmetric and reads as
  // "mics" rather than "decorative pattern".
  const micPositions = [-w * 0.42, -w * 0.25, w * 0.25, w * 0.42]

  const labelText = element.model ?? element.label
  const showLabel = !TOO_SMALL_FOR_LABEL(w, h) && !!labelText

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Pill body — full corner radius on the short axis so the long
       *  ends stay round regardless of resize. */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={h / 2}
        opacity={element.style.opacity}
        dash={dash}
      />
      {/* Mic array — four small dots flanking the central camera. */}
      {micPositions.map((mx, i) => (
        <Circle
          key={i}
          x={mx}
          y={0}
          radius={micR}
          fill="#94A3B8"
          opacity={element.style.opacity * 0.85}
          listening={false}
        />
      ))}
      {/* Central camera dot — the focal point of the silhouette. */}
      <Circle
        x={0}
        y={0}
        radius={camR}
        fill={isBroken ? '#DC2626' : '#0F172A'}
        stroke="#94A3B8"
        strokeWidth={0.6}
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
