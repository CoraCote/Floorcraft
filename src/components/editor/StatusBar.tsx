import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'
import { useMemo } from 'react'

export function StatusBar() {
  const elements = useElementsStore((s) => s.elements)
  const guests = useSeatingStore((s) => s.guests)

  const { totalSeats, unassignedSeats, assignedCount, guestCount, guestsWithoutSeats } = useMemo(() => {
    const allSeats: { assignedGuestId: string | null }[] = []
    for (const el of Object.values(elements)) {
      if ('seats' in el && Array.isArray((el as any).seats)) {
        for (const seat of (el as any).seats) {
          allSeats.push(seat)
        }
      }
    }
    const totalSeats = allSeats.length
    const unassignedSeats = totalSeats - allSeats.filter((s) => s.assignedGuestId !== null).length
    const guestList = Object.values(guests)
    const guestCount = guestList.length
    const assignedCount = guestList.filter((g) => g.seatElementId !== null).length
    const guestsWithoutSeats = guestCount - assignedCount
    return { totalSeats, unassignedSeats, assignedCount, guestCount, guestsWithoutSeats }
  }, [elements, guests])

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center px-4 gap-6 text-xs text-gray-600">
      <span>Total Seats: <strong>{totalSeats}</strong></span>
      <span>Assigned: <strong>{assignedCount}</strong></span>
      <span>Unassigned: <strong>{unassignedSeats}</strong></span>
      {guestCount > 0 && (
        <span>Guests Without Seats: <strong>{guestsWithoutSeats}</strong></span>
      )}
    </div>
  )
}
