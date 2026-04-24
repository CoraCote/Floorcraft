import { useState, useMemo, useCallback } from 'react'
import { User, Monitor } from 'lucide-react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useCan } from '../../hooks/useCan'
import { redactEmployee } from '../../lib/redactEmployee'
import { useShallow } from 'zustand/react/shallow'
import { useAllFloorElements } from '../../hooks/useActiveFloorElements'
import { assignEmployee } from '../../lib/seatAssignment'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

function getOpenDesks(
  elements: Record<string, CanvasElement>,
  assignedSeatIds: Set<string>
): Array<{ id: string; label: string }> {
  const open: Array<{ id: string; label: string }> = []
  for (const el of Object.values(elements)) {
    if (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)) {
      if (!assignedSeatIds.has(el.id)) {
        open.push({ id: el.id, label: el.label || el.id })
      }
    }
  }
  return open.sort((a, b) => a.label.localeCompare(b.label))
}

export function UnassignedReport() {
  const { getUnassignedEmployees } = useEmployeeStore(
    useShallow((s) => ({
      getUnassignedEmployees: s.getUnassignedEmployees,
    }))
  )
  // Display paths route through the redaction projection; the raw
  // `getUnassignedEmployees` selector still runs against the full store so
  // the filter (status=active && no seat) is accurate, then we project
  // each result through `redactEmployee` when the viewer lacks PII access.
  const employees = useVisibleEmployees()
  const canViewPII = useCan('viewPII')
  const floorsWithElements = useAllFloorElements()

  const [highlightedEmpId, setHighlightedEmpId] = useState<string | null>(null)

  const unassigned = useMemo(() => {
    const list = getUnassignedEmployees()
    // Sort by start date ascending (upcoming new hires first) on the raw
    // records so the order doesn't collapse when startDate is redacted to
    // null for every entry.
    const sorted = [...list].sort((a, b) => {
      if (!a.startDate && !b.startDate) return a.name.localeCompare(b.name)
      if (!a.startDate) return 1
      if (!b.startDate) return -1
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
    return canViewPII ? sorted : sorted.map(redactEmployee)
    // `employees` is a reactive snapshot from the store — including it in
    // the deps forces the memo to re-run when assignments change, since
    // `getUnassignedEmployees` itself is a stable selector reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getUnassignedEmployees, employees, canViewPII])

  // Build set of seatIds that have assigned employees
  const assignedSeatIds = useMemo(() => {
    const ids = new Set<string>()
    for (const emp of Object.values(employees)) {
      if (emp.seatId) ids.add(emp.seatId)
    }
    return ids
  }, [employees])

  const openDesksByFloor = useMemo(() => {
    return floorsWithElements.map((f) => ({
      floorId: f.floorId,
      floorName: f.floorName,
      desks: getOpenDesks(f.elements, assignedSeatIds),
    })).filter((f) => f.desks.length > 0)
  }, [floorsWithElements, assignedSeatIds])

  const handleDeskClick = useCallback(
    (deskId: string, floorId: string) => {
      if (!highlightedEmpId) return
      assignEmployee(highlightedEmpId, deskId, floorId)
      setHighlightedEmpId(null)
    },
    [highlightedEmpId]
  )

  const handleEmpClick = useCallback((empId: string) => {
    setHighlightedEmpId((prev) => (prev === empId ? null : empId))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Employees without seats */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
          <User size={12} />
          Employees Without Seats ({unassigned.length})
        </div>
        {unassigned.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-3 text-center">
            All employees are assigned!
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {unassigned.map((emp) => (
              <button
                key={emp.id}
                onClick={() => handleEmpClick(emp.id)}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                  highlightedEmpId === emp.id
                    ? 'bg-blue-100 border border-blue-300'
                    : 'bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">{emp.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {emp.department || 'No department'}
                    {emp.startDate && (
                      <span className="ml-1.5">
                        — starts {new Date(emp.startDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Open desks */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
          <Monitor size={12} />
          Open Desks
          {highlightedEmpId && (
            <span className="text-blue-600 font-normal ml-1">— click a desk to assign</span>
          )}
        </div>
        {openDesksByFloor.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-3 text-center">
            No open desks available.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {openDesksByFloor.map((floor) => (
              <div key={floor.floorId}>
                <div className="text-[11px] font-medium text-gray-600 mb-1">{floor.floorName}</div>
                <div className="flex flex-wrap gap-1">
                  {floor.desks.map((desk) => (
                    <button
                      key={desk.id}
                      onClick={() => handleDeskClick(desk.id, floor.floorId)}
                      disabled={!highlightedEmpId}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                        highlightedEmpId
                          ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer'
                          : 'border-gray-200 bg-gray-50 text-gray-500 cursor-default'
                      }`}
                    >
                      {desk.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
