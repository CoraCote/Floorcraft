import { Group, Circle, Text } from 'react-konva'
import { useRoomBookingsStore } from '../../../stores/roomBookingsStore'
import { todayIso } from '../../../lib/roomBookings'

interface RoomBookingBadgeProps {
  /** Id of the room element this badge belongs to. */
  elementId: string
  /** Element world width — badge is positioned at the top-right corner. */
  width: number
  /** Element world height — badge is positioned at the top-right corner. */
  height: number
}

/**
 * Small Konva badge shown on top of a bookable room element when it
 * has one or more bookings for today. Subscribes directly to the
 * roomBookings store so any add/remove reflows the badge without
 * having to prop-drill the count down through the renderer tree.
 *
 * Positioning: the room renderers draw their background rect anchored
 * at `(-width/2, -height/2)`, so the top-right corner sits at
 * `(+width/2, -height/2)`. The badge is a small filled circle with
 * the count centred inside it.
 */
export function RoomBookingBadge({ elementId, width, height }: RoomBookingBadgeProps) {
  // Subscribe to the whole list then filter here. Cheap: each office
  // has far fewer bookings than canvas elements, and zustand keeps the
  // reference stable across unrelated state changes.
  const bookings = useRoomBookingsStore((s) => s.bookings)
  const today = todayIso()
  const count = bookings.reduce(
    (n, b) => (b.elementId === elementId && b.date === today ? n + 1 : n),
    0,
  )
  if (count === 0) return null

  // Clamp badge size against tiny rooms so the circle never swallows
  // the element visual — phone booths in particular can be ~30×30.
  const radius = Math.max(6, Math.min(10, Math.min(width, height) / 5))
  const cx = width / 2 - radius
  const cy = -height / 2 + radius

  return (
    <Group listening={false}>
      <Circle x={cx} y={cy} radius={radius} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1} />
      <Text
        x={cx - radius}
        y={cy - radius / 2 - 1}
        width={radius * 2}
        height={radius * 2}
        align="center"
        text={count > 9 ? '9+' : String(count)}
        fontSize={Math.max(9, radius)}
        fontStyle="bold"
        fill="#FFFFFF"
        listening={false}
      />
    </Group>
  )
}
