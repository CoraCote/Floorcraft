import { useMemo } from 'react'
import { Layer, Rect, Text } from 'react-konva'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useFloorElements } from '../../hooks/useActiveFloorElements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

const EMPLOYMENT_TYPE_COLORS: Record<string, string> = {
  'full-time': '#3B82F6',
  contractor: '#F59E0B',
  'part-time': '#8B5CF6',
  intern: '#10B981',
}

const TEAM_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
  '#14B8A6', '#D946EF',
]

const UNASSIGNED_COLOR = '#E5E7EB'

function isAssignable(el: CanvasElement): boolean {
  return isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)
}

interface SeatOverlay {
  key: string
  x: number
  y: number
  width: number
  height: number
  fill: string
}

interface LegendEntry {
  label: string
  color: string
}

export function SeatMapColorMode() {
  const seatMapColorMode = useUIStore((s) => s.seatMapColorMode)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const floorElements = useFloorElements(activeFloorId)
  // Color overlays are department/team/employmentType driven, all of which
  // survive redaction. Routing through `useVisibleEmployees` keeps the
  // rule "display layer = redacted" easy to audit.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  const { overlays, legend } = useMemo(() => {
    if (!seatMapColorMode) return { overlays: [], legend: [] }

    // Build seatId -> employee lookup
    const seatToEmployee: Record<string, typeof employees[string]> = {}
    for (const emp of Object.values(employees)) {
      if (emp.seatId && emp.floorId === activeFloorId) {
        seatToEmployee[emp.seatId] = emp
      }
    }

    // Build team color map
    const teamColorMap: Record<string, string> = {}
    let teamIdx = 0

    const resultOverlays: SeatOverlay[] = []
    const legendMap: Record<string, string> = {}

    for (const el of Object.values(floorElements)) {
      if (!isAssignable(el)) continue

      const emp = seatToEmployee[el.id]
      let fill = UNASSIGNED_COLOR
      let legendLabel = 'Unassigned'

      if (emp) {
        switch (seatMapColorMode) {
          case 'department':
            if (emp.department) {
              fill = getDepartmentColor(emp.department)
              legendLabel = emp.department
            }
            break
          case 'team':
            if (emp.team) {
              if (!teamColorMap[emp.team]) {
                teamColorMap[emp.team] = TEAM_PALETTE[teamIdx % TEAM_PALETTE.length]
                teamIdx++
              }
              fill = teamColorMap[emp.team]
              legendLabel = emp.team
            }
            break
          case 'employment-type':
            fill = EMPLOYMENT_TYPE_COLORS[emp.employmentType] || '#9CA3AF'
            legendLabel = emp.employmentType
            break
          case 'office-days':
            fill = '#9CA3AF'
            legendLabel = 'N/A'
            break
        }
      }

      legendMap[legendLabel] = fill

      // (el.x, el.y) is the CENTER; Rect needs the top-left corner.
      resultOverlays.push({
        key: el.id,
        x: el.x - el.width / 2,
        y: el.y - el.height / 2,
        width: el.width,
        height: el.height,
        fill,
      })
    }

    const legendEntries: LegendEntry[] = Object.entries(legendMap)
      .sort(([a], [b]) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        return a.localeCompare(b)
      })
      .map(([label, color]) => ({ label, color }))

    return { overlays: resultOverlays, legend: legendEntries }
  }, [seatMapColorMode, activeFloorId, floorElements, employees, getDepartmentColor])

  if (!seatMapColorMode || overlays.length === 0) {
    return null
  }

  return (
    <Layer listening={false}>
      {overlays.map((ov) => (
        <Rect
          key={ov.key}
          x={ov.x}
          y={ov.y}
          width={ov.width}
          height={ov.height}
          fill={ov.fill}
          opacity={0.45}
          cornerRadius={2}
        />
      ))}

      {/* Legend background */}
      <Rect
        x={12}
        y={12}
        width={140}
        height={legend.length * 20 + 28}
        fill="#FFFFFF"
        opacity={0.92}
        cornerRadius={6}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      <Text
        x={20}
        y={18}
        text={
          seatMapColorMode === 'department'
            ? 'Department'
            : seatMapColorMode === 'team'
              ? 'Team'
              : seatMapColorMode === 'employment-type'
                ? 'Type'
                : 'Office Days'
        }
        fontSize={11}
        fontStyle="bold"
        fill="#374151"
      />
      {legend.map((entry, i) => (
        <Rect
          key={`dot-${entry.label}`}
          x={20}
          y={34 + i * 20}
          width={10}
          height={10}
          fill={entry.color}
          cornerRadius={5}
        />
      ))}
      {legend.map((entry, i) => (
        <Text
          key={`lbl-${entry.label}`}
          x={36}
          y={33 + i * 20}
          text={entry.label}
          fontSize={10}
          fill="#6B7280"
        />
      ))}
    </Layer>
  )
}
