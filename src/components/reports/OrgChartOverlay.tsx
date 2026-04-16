import { useMemo } from 'react'
import { Layer, Line } from 'react-konva'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { useFloorElements } from '../../hooks/useActiveFloorElements'

export function OrgChartOverlay() {
  const orgChartOverlayEnabled = useUIStore((s) => s.orgChartOverlayEnabled)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const floorElements = useFloorElements(activeFloorId)
  const { employees, getDepartmentColor } = useEmployeeStore(
    useShallow((s) => ({
      employees: s.employees,
      getDepartmentColor: s.getDepartmentColor,
    }))
  )

  const lines = useMemo(() => {
    if (!orgChartOverlayEnabled) return []

    const allEmployees = Object.values(employees)
    const floorEmployees = allEmployees.filter((e) => e.floorId === activeFloorId)

    // Build a quick lookup: employeeId -> employee
    const empMap = employees

    const result: Array<{
      key: string
      points: number[]
      color: string
    }> = []

    for (const emp of floorEmployees) {
      if (!emp.managerId || !emp.seatId) continue

      const manager = empMap[emp.managerId]
      if (!manager || manager.floorId !== activeFloorId || !manager.seatId) continue

      const empElement = floorElements[emp.seatId]
      const mgrElement = floorElements[manager.seatId]
      if (!empElement || !mgrElement) continue

      // Elements use (x, y) as CENTER (renderers offset children by -width/2, -height/2)
      result.push({
        key: `${manager.id}-${emp.id}`,
        points: [mgrElement.x, mgrElement.y, empElement.x, empElement.y],
        color: manager.department ? getDepartmentColor(manager.department) : '#6B7280',
      })
    }

    return result
  }, [orgChartOverlayEnabled, activeFloorId, floorElements, employees, getDepartmentColor])

  if (!orgChartOverlayEnabled || lines.length === 0) {
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
    </Layer>
  )
}
