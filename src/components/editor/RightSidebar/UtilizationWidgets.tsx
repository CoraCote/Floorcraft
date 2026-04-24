import { useMemo } from 'react'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useAllFloorElements } from '../../../hooks/useActiveFloorElements'
import type { CanvasElement } from '../../../types/elements'
import {
  computeUtilizationMetrics,
  occupancyHealth,
  meetingSeatsHealth,
  phoneBoothHealth,
  type MetricHealth,
} from '../../../lib/utilizationMetrics'

/**
 * Compact KPI strip that lives at the top of the Insights Panel. Facilities
 * managers asked for an at-a-glance "how is this office doing?" readout —
 * insight cards are great for specific problems but don't answer "is this
 * office under-seated?" without aggregating them by eye.
 *
 * Five tiles, in priority order:
 *   1. Occupancy  — % of seats assigned
 *   2. Seats/person — ratio of seats to active headcount
 *   3. Meeting seats/person — cross-check against meeting-room shortage
 *   4. Phone booths/person — 1:1 / hybrid-call capacity
 *   5. Common areas — count of kitchens/lounges (no ratio; more of a "did
 *      we even include one?" check)
 */
export function UtilizationWidgets() {
  const floorsWithElements = useAllFloorElements()
  const elements = useMemo(
    () =>
      floorsWithElements.reduce(
        (acc, f) => Object.assign(acc, f.elements),
        {} as Record<string, CanvasElement>,
      ),
    [floorsWithElements],
  )
  const employees = useEmployeeStore((s) => s.employees)

  const m = useMemo(
    () => computeUtilizationMetrics(elements, employees),
    [elements, employees],
  )

  // If the project is empty (common on a fresh load) hide the widgets
  // entirely — an all-zero row looks broken.
  if (m.totalSeats === 0 && m.activeEmployees === 0) return null

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        label="Occupancy"
        value={`${Math.round(m.occupancyRatio * 100)}%`}
        sub={`${m.assignedSeats}/${m.totalSeats} seats`}
        health={occupancyHealth(m.occupancyRatio, m.totalSeats)}
        title="Portion of seats assigned. Healthy range: 60–90%."
      />
      <Tile
        label="Seats/person"
        value={m.activeEmployees > 0 ? m.seatsPerPerson.toFixed(2) : '—'}
        sub={`${m.totalSeats} seats · ${m.activeEmployees} people`}
        health="unknown"
        title="Total seats divided by active employees. < 1 means more headcount than seats."
      />
      <Tile
        label="Meeting seats"
        value={
          m.activeEmployees > 0
            ? `${(m.meetingSeatsPerPerson * 100).toFixed(0)}%`
            : '—'
        }
        sub={`${m.meetingRoomSeats} seats`}
        health={meetingSeatsHealth(m.meetingSeatsPerPerson, m.activeEmployees)}
        title="Meeting-room seats as a % of headcount. Healthy: 10–35%."
      />
      <Tile
        label="Phone booths"
        value={m.phoneBooths.toString()}
        sub={
          m.activeEmployees > 0
            ? `${(m.phoneBoothsPerPerson * 100).toFixed(0)}% of HC`
            : 'no headcount'
        }
        health={phoneBoothHealth(m.phoneBoothsPerPerson, m.activeEmployees)}
        title="One booth per 50 headcount is a floor; per 25 is healthy for hybrid offices."
      />
      <Tile
        label="Common areas"
        value={m.commonAreas.toString()}
        sub={m.commonAreas === 0 ? 'none drawn' : 'kitchens, lounges'}
        health={m.commonAreas === 0 ? 'warn' : 'healthy'}
        title="Count of common-area elements (kitchens / lounges / breakrooms)."
        className="col-span-2"
      />
    </div>
  )
}

/**
 * One KPI tile. Health tint is applied to the accent bar + label so the
 * overall density of colour in the panel maps to "attention required".
 */
function Tile({
  label,
  value,
  sub,
  health,
  title,
  className = '',
}: {
  label: string
  value: string
  sub: string
  health: MetricHealth
  title: string
  className?: string
}) {
  const tone = HEALTH_TONES[health]
  return (
    <div
      className={`relative rounded-md border border-gray-200 bg-white p-2 ${className}`}
      title={title}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l ${tone.bar}`} />
      <div className="pl-1.5">
        <div className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
          {label}
        </div>
        <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-[10px] text-gray-500 leading-tight">{sub}</div>
      </div>
    </div>
  )
}

const HEALTH_TONES: Record<MetricHealth, { bar: string; label: string }> = {
  healthy: { bar: 'bg-green-400', label: 'text-green-700' },
  warn: { bar: 'bg-amber-400', label: 'text-amber-700' },
  critical: { bar: 'bg-red-400', label: 'text-red-700' },
  unknown: { bar: 'bg-gray-200', label: 'text-gray-500' },
}
