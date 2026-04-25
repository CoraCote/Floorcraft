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

/**
 * Wave 13C typography polish: swapped the raw hex-colour occupancy ramp
 * for a three-step Tailwind class pair (fill + text) so the bars respect
 * the theme and dark-mode variants without colour-hex sprinkled through
 * render. The math is unchanged from Wave 10-era — only the presentation
 * moved. Section headers use the same uppercase `text-[10px]` tracking
 * label the rest of the Reports chrome now uses.
 */
function occupancyTone(pct: number): { fill: string; text: string } {
  if (pct >= 80)
    return {
      fill: 'bg-emerald-500 dark:bg-emerald-400',
      text: 'text-emerald-600 dark:text-emerald-400',
    }
  if (pct >= 60)
    return {
      fill: 'bg-amber-500 dark:bg-amber-400',
      text: 'text-amber-600 dark:text-amber-400',
    }
  return {
    fill: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
  }
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

  const overallTone = occupancyTone(overall.pct)

  return (
    <div className="flex flex-col gap-5">
      {/* Overall occupancy */}
      <div className="text-center">
        <div
          className={`text-4xl font-bold tabular-nums leading-none ${overallTone.text}`}
        >
          {overall.pct}%
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
          {overall.assigned} / {overall.totalSeats} seats occupied
        </div>
      </div>

      {/* Per-floor breakdown */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          By floor
        </div>
        <div className="flex flex-col gap-2">
          {perFloor.map((f) => {
            const tone = occupancyTone(f.pct)
            return (
              <div key={f.id}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-700 dark:text-gray-200 font-medium">{f.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                    {f.pct}% ({f.assigned}/{f.seats})
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${tone.fill}`}
                    style={{ width: `${Math.min(f.pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-department breakdown */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          By department
        </div>
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
              <span className="text-gray-700 dark:text-gray-200 flex-1 truncate">{dept.name}</span>
              <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
                {dept.assigned}/{dept.total} seats
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
