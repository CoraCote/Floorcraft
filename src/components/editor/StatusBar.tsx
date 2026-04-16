import { useElementsStore } from '../../stores/elementsStore'
import { useMemo } from 'react'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'

export function StatusBar() {
  const elements = useElementsStore((s) => s.elements)

  const { totalDesks, assignedDesks, openDesks, occupancyPct } = useMemo(() => {
    let totalDesks = 0
    let assignedDesks = 0

    for (const el of Object.values(elements)) {
      if (isDeskElement(el)) {
        totalDesks += 1
        if (el.assignedEmployeeId !== null) {
          assignedDesks += 1
        }
      } else if (isWorkstationElement(el)) {
        totalDesks += el.positions
        assignedDesks += el.assignedEmployeeIds.length
      } else if (isPrivateOfficeElement(el)) {
        totalDesks += el.capacity
        assignedDesks += el.assignedEmployeeIds.length
      }
    }

    const openDesks = totalDesks - assignedDesks
    const occupancyPct = totalDesks > 0 ? Math.round((assignedDesks / totalDesks) * 100) : 0

    return { totalDesks, assignedDesks, openDesks, occupancyPct }
  }, [elements])

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center px-4 gap-6 text-xs text-gray-600">
      <span>Desks: <strong>{totalDesks}</strong></span>
      <span>Assigned: <strong>{assignedDesks}</strong></span>
      <span>Open: <strong>{openDesks}</strong></span>
      <span>Occupancy: <strong>{occupancyPct}%</strong></span>
    </div>
  )
}
