import { useMemo, useState } from 'react'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useReservationsStore } from '../../stores/reservationsStore'
import { useCan } from '../../hooks/useCan'
import { canReserveDesk, todayIso } from '../../lib/reservations'
import { isDeskElement } from '../../types/elements'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useToastStore } from '../../stores/toastStore'

/**
 * Hot-desk reservations page. Shows a 14-day window of open desks and the
 * reservations attached to each (desk, date) pair.
 *
 * Why a grid, not a list: facilities + space planners asked "show me next
 * week at a glance" — a date-by-desk matrix answers that question directly,
 * whereas a list of reservations buries it. The grid only contains desks
 * that are currently reservable (unassigned + non-decommissioned); once a
 * desk gets a permanent assignment it falls out of the view on the next
 * render.
 *
 * Redaction: employee names come from `useVisibleEmployees`, so viewers
 * without `viewPII` see initials like "A." rather than full names.
 */
const DAYS = 14

export function ReservationsPage() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const visibleEmployees = useVisibleEmployees()
  const reservations = useReservationsStore((s) => s.reservations)
  const create = useReservationsStore((s) => s.create)
  const cancel = useReservationsStore((s) => s.cancel)
  const pushToast = useToastStore((s) => s.push)
  // Read both permission flags unconditionally so the hook order is stable —
  // `useCan('a') || useCan('b')` short-circuits the second call and breaks
  // `react-hooks/rules-of-hooks` (both useCan calls must run every render).
  const canEditRoster = useCan('editRoster')
  const canEditMap = useCan('editMap')
  const canEdit = canEditRoster || canEditMap

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')

  const reservableDesks = useMemo(
    () =>
      Object.values(elements)
        .filter((el) => canReserveDesk(el))
        .filter(isDeskElement)
        .sort((a, b) => (a.label || a.deskId).localeCompare(b.label || b.deskId)),
    [elements],
  )

  const today = todayIso()
  const dates = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < DAYS; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      )
    }
    return out
  }, [])

  // Pre-index reservations by (deskId|date) so the cell lookup is O(1).
  const byCell = useMemo(() => {
    const map: Record<string, (typeof reservations)[number]> = {}
    for (const r of reservations) {
      if (r.date < today) continue
      map[`${r.deskElementId}|${r.date}`] = r
    }
    return map
  }, [reservations, today])

  const employeeList = useMemo(
    () => Object.values(employees).filter((e) => e.status !== 'departed'),
    [employees],
  )

  const onCellClick = (deskId: string, date: string) => {
    if (!canEdit) return
    const existing = byCell[`${deskId}|${date}`]
    if (existing) {
      cancel(existing.id)
      return
    }
    if (!selectedEmployeeId) {
      pushToast({ tone: 'info', title: 'Pick an employee first.' })
      return
    }
    const desk = elements[deskId]
    if (!desk) return
    const result = create(desk, selectedEmployeeId, date)
    if (!result.ok) {
      const msg: Record<typeof result.error, string> = {
        'desk-not-reservable': 'That desk cannot be reserved.',
        'desk-already-reserved': 'Desk is already reserved for that day.',
        'employee-already-booked': 'That person already has a reservation for the day.',
      }
      pushToast({ tone: 'warning', title: msg[result.error] })
    }
  }

  return (
    <div className="p-6" data-testid="reservations-page">
      <h1 className="text-lg font-semibold mb-4">Hot-desk reservations</h1>

      {canEdit && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <label htmlFor="res-emp-picker">Reserve for:</label>
          <select
            id="res-emp-picker"
            data-testid="reservations-employee-picker"
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
          >
            <option value="">— pick an employee —</option>
            {employeeList.map((e) => {
              const vis = visibleEmployees[e.id]
              const label = vis ? vis.name : e.name
              return (
                <option key={e.id} value={e.id}>
                  {label}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {reservableDesks.length === 0 ? (
        <p className="text-sm text-gray-500">
          No reservable desks right now. Every desk is either permanently
          assigned or decommissioned.
        </p>
      ) : (
        <div className="overflow-auto border border-gray-200 rounded">
          <table className="text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left sticky left-0 bg-gray-50">
                  Desk
                </th>
                {dates.map((d) => (
                  <th key={d} className="px-2 py-1 text-left whitespace-nowrap">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservableDesks.map((desk) => (
                <tr key={desk.id} className="border-t border-gray-100">
                  <td className="px-2 py-1 sticky left-0 bg-white whitespace-nowrap">
                    {desk.label || desk.deskId}
                  </td>
                  {dates.map((d) => {
                    const res = byCell[`${desk.id}|${d}`]
                    const vis = res ? visibleEmployees[res.employeeId] : undefined
                    return (
                      <td key={d} className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => onCellClick(desk.id, d)}
                          disabled={!canEdit}
                          data-testid={`reservations-cell-${desk.id}-${d}`}
                          className={`w-full min-w-[60px] rounded px-1 py-0.5 text-[11px] ${
                            res
                              ? 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                              : 'text-gray-400 hover:bg-gray-50'
                          } ${canEdit ? '' : 'cursor-not-allowed opacity-60'}`}
                        >
                          {res ? (vis?.name ?? 'R') : '·'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
