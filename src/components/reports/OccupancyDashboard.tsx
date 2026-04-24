import { useMemo } from 'react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useAllFloorElements } from '../../hooks/useActiveFloorElements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

function getOccupancyColor(pct: number): string {
  if (pct >= 80) return '#10B981'
  if (pct >= 60) return '#F59E0B'
  return '#EF4444'
}

function countAssignableSeats(elements: Record<string, CanvasElement>): number {
  let count = 0
  for (const el of Object.values(elements)) {
    if (isDeskElement(el)) {
      count += 1
    } else if (isWorkstationElement(el)) {
      count += el.positions
    } else if (isPrivateOfficeElement(el)) {
      count += el.capacity
    }
  }
  return count
}

export function OccupancyDashboard() {
  // Seat counts and department aggregates survive redaction; routing
  // through the hook keeps the read-side rule uniform.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)
  const floorsWithElements = useAllFloorElements()

  const allEmployees = useMemo(() => Object.values(employees), [employees])

  const overall = useMemo(() => {
    let totalSeats = 0
    for (const f of floorsWithElements) {
      totalSeats += countAssignableSeats(f.elements)
    }
    const assigned = allEmployees.filter((e) => e.seatId !== null).length
    const pct = totalSeats > 0 ? Math.round((assigned / totalSeats) * 100) : 0
    return { assigned, totalSeats, pct }
  }, [floorsWithElements, allEmployees])

  const perFloor = useMemo(() => {
    return floorsWithElements.map((f) => {
      const seats = countAssignableSeats(f.elements)
      const assigned = allEmployees.filter((e) => e.floorId === f.floorId && e.seatId !== null).length
      const pct = seats > 0 ? Math.round((assigned / seats) * 100) : 0
      return { id: f.floorId, name: f.floorName, assigned, seats, pct }
    })
  }, [floorsWithElements, allEmployees])

  const perDepartment = useMemo(() => {
    const deptMap: Record<string, { total: number; assigned: number }> = {}
    for (const emp of allEmployees) {
      const dept = emp.department || 'Unassigned'
      if (!deptMap[dept]) deptMap[dept] = { total: 0, assigned: 0 }
      deptMap[dept].total++
      if (emp.seatId !== null) deptMap[dept].assigned++
    }
    return Object.entries(deptMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, data]) => ({ name, ...data }))
  }, [allEmployees])

  return (
    <div className="flex flex-col gap-5">
      {/* Overall occupancy */}
      <div className="text-center">
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: getOccupancyColor(overall.pct),
            lineHeight: 1,
          }}
        >
          {overall.pct}%
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {overall.assigned} / {overall.totalSeats} seats occupied
        </div>
      </div>

      {/* Per-floor breakdown */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2">By Floor</div>
        <div className="flex flex-col gap-2">
          {perFloor.map((f) => (
            <div key={f.id}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-700 font-medium">{f.name}</span>
                <span className="text-gray-500">
                  {f.pct}% ({f.assigned}/{f.seats})
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(f.pct, 100)}%`,
                    backgroundColor: getOccupancyColor(f.pct),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-department breakdown */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2">By Department</div>
        <div className="flex flex-col gap-1.5">
          {perDepartment.map((dept) => (
            <div key={dept.name} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    dept.name === 'Unassigned' ? '#9CA3AF' : getDepartmentColor(dept.name),
                }}
              />
              <span className="text-gray-700 flex-1 truncate">{dept.name}</span>
              <span className="text-gray-500 flex-shrink-0">
                {dept.assigned}/{dept.total} seats
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
