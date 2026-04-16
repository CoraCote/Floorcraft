import { useState, useMemo, useCallback } from 'react'
import { X, ArrowRight, Check, Trash2, Plus } from 'lucide-react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { useAllFloorElements } from '../../hooks/useActiveFloorElements'
import { assignEmployee } from '../../lib/seatAssignment'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'

interface PendingMove {
  employeeId: string
  fromSeatId: string | null
  fromFloorId: string | null
  toSeatId: string
  toFloorId: string
}

export function MovePlanner() {
  const employees = useEmployeeStore((s) => s.employees)
  const floors = useFloorStore((s) => s.floors)
  const floorsWithElements = useAllFloorElements()
  const { setMovePlannerActive, setActiveReport } = useUIStore(
    useShallow((s) => ({
      setMovePlannerActive: s.setMovePlannerActive,
      setActiveReport: s.setActiveReport,
    }))
  )

  const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedFloorId, setSelectedFloorId] = useState('')
  const [selectedDeskId, setSelectedDeskId] = useState('')

  const allEmployees = useMemo(() => Object.values(employees).sort((a, b) => a.name.localeCompare(b.name)), [employees])

  const floorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of floors) m[f.id] = f.name
    return m
  }, [floors])

  const assignableDesks = useMemo(() => {
    if (!selectedFloorId) return []
    const f = floorsWithElements.find((x) => x.floorId === selectedFloorId)
    if (!f) return []
    return Object.values(f.elements)
      .filter((el) => isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el))
      .map((el) => ({ id: el.id, label: el.label || el.id }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [floorsWithElements, selectedFloorId])

  const handleAddMove = useCallback(() => {
    if (!selectedEmployeeId || !selectedFloorId || !selectedDeskId) return
    const emp = employees[selectedEmployeeId]
    if (!emp) return

    setPendingMoves((prev) => [
      ...prev.filter((m) => m.employeeId !== selectedEmployeeId),
      {
        employeeId: selectedEmployeeId,
        fromSeatId: emp.seatId,
        fromFloorId: emp.floorId,
        toSeatId: selectedDeskId,
        toFloorId: selectedFloorId,
      },
    ])
    setSelectedEmployeeId('')
    setSelectedDeskId('')
  }, [selectedEmployeeId, selectedFloorId, selectedDeskId, employees])

  const handleApplyAll = useCallback(() => {
    for (const move of pendingMoves) {
      assignEmployee(move.employeeId, move.toSeatId, move.toFloorId)
    }
    setPendingMoves([])
  }, [pendingMoves])

  const handleDiscard = useCallback(() => {
    setPendingMoves([])
    setMovePlannerActive(false)
    setActiveReport(null)
  }, [setMovePlannerActive, setActiveReport])

  const handleRemoveMove = useCallback((employeeId: string) => {
    setPendingMoves((prev) => prev.filter((m) => m.employeeId !== employeeId))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {/* Yellow banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
        <span className="font-semibold">Move Planner</span> — Plan seat changes before committing
      </div>

      {/* Add Move form */}
      <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-xs font-medium text-gray-600">Add a move</div>
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select employee...</option>
          {allEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} {emp.seatId ? `(${emp.seatId})` : '(unassigned)'}
            </option>
          ))}
        </select>

        <select
          value={selectedFloorId}
          onChange={(e) => {
            setSelectedFloorId(e.target.value)
            setSelectedDeskId('')
          }}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Target floor...</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={selectedDeskId}
          onChange={(e) => setSelectedDeskId(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={!selectedFloorId}
        >
          <option value="">Target desk...</option>
          {assignableDesks.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>

        <button
          onClick={handleAddMove}
          disabled={!selectedEmployeeId || !selectedFloorId || !selectedDeskId}
          className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          Add Move
        </button>
      </div>

      {/* Pending moves list */}
      {pendingMoves.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-gray-500">
            Pending Moves ({pendingMoves.length})
          </div>
          {pendingMoves.map((move) => {
            const emp = employees[move.employeeId]
            const fromLabel = move.fromSeatId
              ? move.fromFloorId !== move.toFloorId
                ? `${floorMap[move.fromFloorId || ''] || '?'}, ${move.fromSeatId}`
                : move.fromSeatId
              : 'Unassigned'
            const toLabel =
              move.fromFloorId !== move.toFloorId
                ? `${floorMap[move.toFloorId] || '?'}, ${move.toSeatId}`
                : move.toSeatId
            return (
              <div
                key={move.employeeId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded text-xs"
              >
                <span className="font-medium text-gray-800 truncate flex-1">
                  {emp?.name || move.employeeId}
                </span>
                <span className="text-gray-500 flex-shrink-0">{fromLabel}</span>
                <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
                <span className="text-blue-600 flex-shrink-0">{toLabel}</span>
                <button
                  onClick={() => handleRemoveMove(move.employeeId)}
                  className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApplyAll}
          disabled={pendingMoves.length === 0}
          className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={12} />
          Apply All
        </button>
        <button
          onClick={handleDiscard}
          className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          <Trash2 size={12} />
          Discard
        </button>
      </div>
    </div>
  )
}
