import { useMemo } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { PanelEmptyState } from './PanelEmptyState'
import { useRoomBookingsStore } from '../../../stores/roomBookingsStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useProjectStore } from '../../../stores/projectStore'
import { useCan } from '../../../hooks/useCan'
import { focusElements } from '../../../lib/focusElements'
import {
  bookingsByRoomForDate,
  formatMinutes,
  todayIso,
} from '../../../lib/roomBookings'
import {
  isConferenceRoomElement,
  isCommonAreaElement,
} from '../../../types/elements'

/**
 * Today's meeting-room bookings rolled up by room. Mounted inside
 * `InsightsPanel` beside the annotations section. Click a row to focus
 * the room on the canvas (switches floor if needed).
 *
 * Permissions:
 *   - View: everyone.
 *   - Cancel own booking: editRoster || editMap.
 *   - Cancel anyone's booking: editMap.
 *
 * IMPORTANT: each `useCan(...)` call is extracted to its own variable
 * above the combined boolean so React's rules-of-hooks aren't violated
 * by short-circuit evaluation (`useCan('a') || useCan('b')` would skip
 * the second hook call on truthy-first).
 */
export function RoomBookingsPanel() {
  const bookings = useRoomBookingsStore((s) => s.bookings)
  const removeBooking = useRoomBookingsStore((s) => s.removeBooking)
  const canEditMap = useCan('editMap')
  const canEditRoster = useCan('editRoster')
  const canEditAny = canEditMap || canEditRoster
  const currentUserId = useProjectStore((s) => s.currentUserId)

  const today = todayIso()
  const elements = useElementsStore((s) => s.elements)
  const floorsList = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)

  const rolled = useMemo(
    () => bookingsByRoomForDate(bookings, today),
    [bookings, today],
  )

  // Resolve an elementId to a label across every floor (rooms can live
  // on any floor). Falls back to the type descriptor if the element was
  // deleted — orphans still render so the user can clean them up.
  const resolveLabel = (elementId: string): string => {
    const active = elements[elementId]
    if (active) return roomLabel(active)
    for (const f of floorsList) {
      if (f.id === activeFloorId) continue
      const el = f.elements[elementId]
      if (el) return roomLabel(el)
    }
    return 'Removed room'
  }

  const rows = Object.entries(rolled).sort(([a], [b]) =>
    resolveLabel(a).localeCompare(resolveLabel(b)),
  )

  return (
    <div className="mb-3" data-testid="room-bookings-panel">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarClock size={12} className="text-gray-400 dark:text-gray-500" />
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Room bookings
        </div>
        <div className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">today</div>
      </div>

      {rows.length === 0 ? (
        // Shared empty-state idiom (Wave 17D) — was a bare line of
        // muted text that read as "we forgot to render something"
        // rather than an intentional zero-state. `compact` because this
        // section lives stacked inside InsightsPanel.
        <PanelEmptyState
          icon={CalendarClock}
          title="No room bookings today"
          body="Use the book tool to reserve a meeting room."
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(([elementId, list]) => (
            <div
              key={elementId}
              // The row is keyboard-activatable (Enter / Space below)
              // so it needs a visible focus ring — without one a tab
              // user lands here with no signal they've arrived.
              className="flex flex-col gap-1 p-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              role="button"
              tabIndex={0}
              onClick={() => focusElements([elementId])}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  focusElements([elementId])
                }
              }}
            >
              <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                {resolveLabel(elementId)}
              </div>
              <div className="flex flex-col gap-0.5">
                {list.map((b) => {
                  const isOwn = currentUserId !== null && b.bookedBy === currentUserId
                  const canCancel = canEditMap || (canEditAny && isOwn)
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300"
                    >
                      <span className="font-mono">
                        {formatMinutes(b.startMinutes)}–
                        {formatMinutes(b.endMinutes)}
                      </span>
                      <span className="truncate flex-1 mx-2" title={b.bookedByName}>
                        {b.bookedByName || 'Someone'}
                        {b.note ? ` · ${b.note}` : ''}
                      </span>
                      {canCancel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBooking(b.id)
                          }}
                          title="Cancel booking"
                          aria-label={`Cancel booking ${formatMinutes(b.startMinutes)}`}
                          className="text-gray-400 dark:text-gray-500 hover:text-red-500 flex-shrink-0"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Produce a human-readable room label for the panel row header. The
 * three bookable room types each carry a different naming field, so we
 * dispatch on the discriminator rather than relying on the generic
 * `label` which is often blank for these elements.
 */
function roomLabel(el: {
  type: string
  label?: string
  roomName?: string
  areaName?: string
}): string {
  if (isConferenceRoomElement(el as never)) {
    const cr = el as { roomName: string }
    return cr.roomName || 'Conference room'
  }
  if (isCommonAreaElement(el as never)) {
    const ca = el as { areaName: string }
    return ca.areaName || 'Common area'
  }
  if (el.type === 'phone-booth') {
    return el.label || 'Phone booth'
  }
  return el.label || el.type
}
