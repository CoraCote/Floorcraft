import { useState, useMemo, useCallback } from 'react'
import { X, ArrowUpDown } from 'lucide-react'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { switchToFloor } from '../../lib/seatAssignment'
import type { Employee } from '../../types/employee'

type SortColumn =
  | 'name'
  | 'department'
  | 'team'
  | 'title'
  | 'floor'
  | 'desk'
  | 'manager'
  | 'type'
  | 'officeDays'
  | 'tags'

type SortDirection = 'asc' | 'desc'

export function EmployeeDirectory() {
  // Directory is a viewer-first surface — it's often the first page a
  // viewer-role user sees. Route through the redaction hook so names show
  // as initials and email/manager/office-days empty out.
  const employees = useVisibleEmployees()
  const floors = useFloorStore((s) => s.floors)
  const { setEmployeeDirectoryOpen, setSelectedIds, setActiveReport } = useUIStore(
    useShallow((s) => ({
      setEmployeeDirectoryOpen: s.setEmployeeDirectoryOpen,
      setSelectedIds: s.setSelectedIds,
      setActiveReport: s.setActiveReport,
    }))
  )
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const allEmployees = useMemo(() => Object.values(employees), [employees])

  const floorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of floors) {
      m[f.id] = f.name
    }
    return m
  }, [floors])

  const employeeMap = useMemo(() => employees, [employees])

  const filtered = useMemo(() => {
    let list = allEmployees
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.department && e.department.toLowerCase().includes(q)) ||
          (e.team && e.team.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [allEmployees, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let av = ''
      let bv = ''
      switch (sortColumn) {
        case 'name':
          av = a.name; bv = b.name; break
        case 'department':
          av = a.department || ''; bv = b.department || ''; break
        case 'team':
          av = a.team || ''; bv = b.team || ''; break
        case 'title':
          av = a.title || ''; bv = b.title || ''; break
        case 'floor':
          av = a.floorId ? (floorMap[a.floorId] || '') : ''
          bv = b.floorId ? (floorMap[b.floorId] || '') : ''
          break
        case 'desk':
          av = a.seatId || ''; bv = b.seatId || ''; break
        case 'manager':
          av = a.managerId ? (employeeMap[a.managerId]?.name || '') : ''
          bv = b.managerId ? (employeeMap[b.managerId]?.name || '') : ''
          break
        case 'type':
          av = a.employmentType; bv = b.employmentType; break
        case 'officeDays':
          av = a.officeDays.join(','); bv = b.officeDays.join(','); break
        case 'tags':
          av = a.tags.join(','); bv = b.tags.join(','); break
      }
      return av.localeCompare(bv) * dir
    })
    return copy
  }, [filtered, sortColumn, sortDir, floorMap, employeeMap])

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return col
    })
  }, [])

  const handleRowClick = useCallback(
    (emp: Employee) => {
      if (emp.floorId) {
        // switchToFloor saves the outgoing floor's live elements before loading
        // the target floor, so unsaved edits on the current floor are preserved.
        switchToFloor(emp.floorId)
      }
      if (emp.seatId) {
        setSelectedIds([emp.seatId])
      }
      setEmployeeDirectoryOpen(false)
      setActiveReport(null)
    },
    [setSelectedIds, setEmployeeDirectoryOpen, setActiveReport]
  )

  const handleClose = useCallback(() => {
    setEmployeeDirectoryOpen(false)
    setActiveReport(null)
  }, [setEmployeeDirectoryOpen, setActiveReport])

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department' },
    { key: 'team', label: 'Team' },
    { key: 'title', label: 'Title' },
    { key: 'floor', label: 'Floor' },
    { key: 'desk', label: 'Desk' },
    { key: 'manager', label: 'Manager' },
    { key: 'type', label: 'Type' },
    { key: 'officeDays', label: 'Office Days' },
    { key: 'tags', label: 'Tags' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Employee Directory</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search by name, department, team, title, email, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortColumn === col.key && (
                        <ArrowUpDown size={12} className="text-blue-500" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => handleRowClick(emp)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{emp.name}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{emp.department || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{emp.team || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{emp.title || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {emp.floorId ? (floorMap[emp.floorId] || '—') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{emp.seatId || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {emp.managerId ? (employeeMap[emp.managerId]?.name || '—') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{emp.employmentType}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {emp.officeDays.length > 0 ? emp.officeDays.join(', ') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {emp.tags.length > 0 ? emp.tags.join(', ') : '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                    {search ? 'No employees match your search.' : 'No employees added yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 text-xs text-gray-500">
          {sorted.length} employee{sorted.length !== 1 ? 's' : ''} shown
        </div>
      </div>
    </div>
  )
}
