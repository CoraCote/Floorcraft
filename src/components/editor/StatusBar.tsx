import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'

export function StatusBar() {
  const allSeats = useElementsStore((s) => s.getAllSeats())
  const guestCount = useSeatingStore((s) => Object.keys(s.guests).length)
  const assignedCount = useSeatingStore((s) => s.getAssignedCount())
  const totalSeats = allSeats.length
  const unassignedSeats = totalSeats - allSeats.filter((s) => s.seat.assignedGuestId !== null).length
  const guestsWithoutSeats = guestCount - assignedCount

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
