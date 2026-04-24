import { useMemo } from 'react'
import { Layer, Line } from 'react-konva'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useFloorElements } from '../../hooks/useActiveFloorElements'

export function OrgChartOverlay() {
  const orgChartOverlayEnabled = useUIStore((s) => s.orgChartOverlayEnabled)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const floorElements = useFloorElements(activeFloorId)
  // Under redaction managerId is blanked, so the overlay renders no lines
  // for viewers — which is the intended GDPR outcome: the reporting graph
  // itself is PII.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  const { lines, crossFloorStubs } = useMemo(() => {
    if (!orgChartOverlayEnabled) return { lines: [], crossFloorStubs: [] }

    const allEmployees = Object.values(employees)
    const floorEmployees = allEmployees.filter((e) => e.floorId === activeFloorId)

    // Build a quick lookup: employeeId -> employee
    const empMap = employees

    const lines: Array<{
      key: string
      points: number[]
      color: string
    }> = []
    const crossFloorStubs: Array<{
      key: string
      points: number[]
      color: string
    }> = []

    for (const emp of floorEmployees) {
      if (!emp.managerId || !emp.seatId) continue

      const manager = empMap[emp.managerId]
      if (!manager || !manager.seatId) continue

      const empElement = floorElements[emp.seatId]
      if (!empElement) continue

      const color = manager.department ? getDepartmentColor(manager.department) : '#6B7280'

      if (manager.floorId === activeFloorId) {
        // Same floor — draw the org-line to the manager's seat if we can
        // resolve it on this floor.
        const mgrElement = floorElements[manager.seatId]
        if (!mgrElement) continue

        // Elements use (x, y) as CENTER (renderers offset children by -width/2, -height/2)
        lines.push({
          key: `${manager.id}-${emp.id}`,
          points: [mgrElement.x, mgrElement.y, empElement.x, empElement.y],
          color,
        })
      } else {
        // Manager is on a different floor — surface a short dashed stub pointing
        // up from the report's seat so the relationship isn't silently hidden.
        crossFloorStubs.push({
          key: `xfloor-${manager.id}-${emp.id}`,
          points: [empElement.x, empElement.y, empElement.x, empElement.y - 20],
          color,
        })
      }
    }

    return { lines, crossFloorStubs }
  }, [orgChartOverlayEnabled, activeFloorId, floorElements, employees, getDepartmentColor])

  if (!orgChartOverlayEnabled || (lines.length === 0 && crossFloorStubs.length === 0)) {
    return null
  }

  return (
    <Layer listening={false}>
      {lines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke={line.color}
          strokeWidth={1.5}
          dash={[6, 4]}
          opacity={0.7}
        />
      ))}
      {crossFloorStubs.map((stub) => (
        <Line
          key={stub.key}
          points={stub.points}
          stroke={stub.color}
          strokeWidth={1.5}
          dash={[2, 3]}
          opacity={0.6}
        />
      ))}
    </Layer>
  )
}
