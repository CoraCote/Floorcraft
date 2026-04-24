import { useEffect, useState } from 'react'
import { useRoomBookingsStore } from '../../../stores/roomBookingsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useProjectStore } from '../../../stores/projectStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { formatMinutes, todayIso, type BookingError } from '../../../lib/roomBookings'
import { useRoomBookingDialogStore } from '../../../lib/roomBookingDialogStore'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'

/**
 * Half-hour step hour-range picker + note. Date defaults to today but
 * can be changed via a native date input. Submitting runs the rule
 * helpers in `src/lib/roomBookings.ts`; on conflict we show the error
 * inline and keep the dialog open so the user can retry.
 */
export function RoomBookingDialog() {
  const elementId = useRoomBookingDialogStore((s) => s.elementId)
  const close = useRoomBookingDialogStore((s) => s.close)
  if (!elementId) return null
  return <RoomBookingDialogBody elementId={elementId} onClose={close} />
}

function RoomBookingDialogBody({
  elementId,
  onClose,
}: {
  elementId: string
  onClose: () => void
}) {
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  const element = useElementsStore((s) => s.elements[elementId])
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const currentUserId = useProjectStore((s) => s.currentUserId)
  // Pull a display name from the employee matching the Supabase id if
  // one exists; otherwise fall back to the auth user id prefix. Keeps
  // the audit trail reading sensibly without forcing a profile table.
  const employees = useEmployeeStore((s) => s.employees)
  const bookedByName =
    (currentUserId &&
      Object.values(employees).find((e) => e.id === currentUserId)?.name) ||
    (currentUserId ? currentUserId.slice(0, 8) : 'You')

  const addBooking = useRoomBookingsStore((s) => s.addBooking)

  const [date, setDate] = useState(todayIso())
  const [startMinutes, setStartMinutes] = useState(9 * 60) // 09:00
  const [endMinutes, setEndMinutes] = useState(10 * 60) // 10:00
  const [note, setNote] = useState('')
  const [error, setError] = useState<BookingError | null>(null)

  if (!element) {
    // Stale open after the element was deleted — just close.
    onClose()
    return null
  }

  const handleSubmit = () => {
    if (!currentUserId) {
      setError('invalid-range')
      return
    }
    const res = addBooking({
      element,
      floorId: activeFloorId,
      date,
      startMinutes,
      endMinutes,
      bookedBy: currentUserId,
      bookedByName,
      note: note.trim(),
    })
    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Book meeting room" size="sm">
      <ModalBody className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-sm"
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Start</span>
            <span className="font-mono">{formatMinutes(startMinutes)}</span>
          </div>
          <input
            aria-label="Start time"
            type="range"
            min={0}
            max={1410}
            step={30}
            value={startMinutes}
            onChange={(e) => {
              const next = Number(e.target.value)
              setStartMinutes(next)
              if (next >= endMinutes) setEndMinutes(Math.min(1440, next + 30))
            }}
          />

          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>End</span>
            <span className="font-mono">{formatMinutes(endMinutes)}</span>
          </div>
          <input
            aria-label="End time"
            type="range"
            min={30}
            max={1440}
            step={30}
            value={endMinutes}
            onChange={(e) => {
              const next = Number(e.target.value)
              setEndMinutes(next)
              if (next <= startMinutes) setStartMinutes(Math.max(0, next - 30))
            }}
          />
        </div>

        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Note (optional)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder="Planning sync"
            className="border border-gray-200 rounded px-2 py-1 text-sm"
          />
        </label>

        {error && (
          <div
            role="alert"
            className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1"
          >
            {errorLabel(error)}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleSubmit}>
          Book
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function errorLabel(err: BookingError): string {
  switch (err) {
    case 'invalid-range':
      return 'Start time must be before end time.'
    case 'not-a-room':
      return 'Only meeting rooms can be booked.'
    case 'conflict':
      return 'This room is already booked during that window.'
  }
}
