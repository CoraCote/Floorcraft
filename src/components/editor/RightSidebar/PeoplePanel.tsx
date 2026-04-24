import { useEmployeeStore } from '../../../stores/employeeStore'
import { useUIStore } from '../../../stores/uiStore'
import { useSeatDragStore } from '../../../stores/seatDragStore'
import { useCan } from '../../../hooks/useCan'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { redactEmployee } from '../../../lib/redactEmployee'
import { useState } from 'react'
import { Search, Plus, Upload, Users, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Link, useParams } from 'react-router-dom'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PeoplePanel() {
  const {
    employees,
    searchQuery,
    filterBy,
    setSearchQuery,
    setFilterBy,
    addEmployee,
    getFilteredEmployees,
    getUnassignedEmployees,
    getNewHires,
    getDepartmentColor,
  } = useEmployeeStore(
    useShallow((s) => ({
      employees: s.employees,
      searchQuery: s.searchQuery,
      filterBy: s.filterBy,
      setSearchQuery: s.setSearchQuery,
      setFilterBy: s.setFilterBy,
      addEmployee: s.addEmployee,
      getFilteredEmployees: s.getFilteredEmployees,
      getUnassignedEmployees: s.getUnassignedEmployees,
      getNewHires: s.getNewHires,
      getDepartmentColor: s.getDepartmentColor,
    }))
  )

  const setCsvImportOpen = useUIStore((s) => s.setCsvImportOpen)
  const canEdit = useCan('editRoster')
  const canViewPII = useCan('viewPII')
  // Touch the visible-employees hook so the panel re-renders when role or
  // redaction status changes — downstream filters still run against the
  // raw store (the search query matches name/email strings the user typed
  // themselves), but every displayed record is projected through
  // `redactEmployee` when the capability is missing.
  useVisibleEmployees()
  // Post Phase 6: the PeoplePanel only ever mounts inside an office
  // route, so both params are guaranteed present.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const rosterHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/roster` : null

  const filteredEmployeesRaw = getFilteredEmployees()
  const filteredEmployees = canViewPII
    ? filteredEmployeesRaw
    : filteredEmployeesRaw.map(redactEmployee)
  const totalCount = Object.keys(employees).length
  const unassignedCount = getUnassignedEmployees().length
  const newHiresCount = getNewHires().length

  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDepartment, setNewDepartment] = useState('')

  const handleAddEmployee = () => {
    if (!newName.trim()) return
    addEmployee({
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      department: newDepartment.trim() || undefined,
    })
    setNewName('')
    setNewEmail('')
    setNewDepartment('')
    setShowAddForm(false)
  }

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) {
        next.delete(dept)
      } else {
        next.add(dept)
      }
      return next
    })
  }

  // Group employees by department
  const grouped = new Map<string, typeof filteredEmployees>()
  for (const emp of filteredEmployees) {
    const dept = emp.department || 'Unassigned Department'
    if (!grouped.has(dept)) grouped.set(dept, [])
    grouped.get(dept)!.push(emp)
  }
  const sortedDepts = [...grouped.keys()].sort()

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{totalCount} people</span>
          {rosterHref && (
            <Link
              to={rosterHref}
              className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
              title="Open full roster view"
            >
              Open Roster
              <ExternalLink size={10} />
            </Link>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus size={12} />
            Add
          </button>
          <button
            onClick={() => setCsvImportOpen(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
          >
            <Upload size={12} />
            CSV
          </button>
        </div>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="flex flex-col gap-1.5 mb-3 p-2 bg-gray-50 rounded-lg">
          <input
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddEmployee()
            }}
            autoFocus
          />
          <input
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddEmployee()
            }}
          />
          <div className="flex gap-1">
            <input
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              placeholder="Department"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddEmployee()
              }}
            />
            <button
              onClick={handleAddEmployee}
              disabled={!newName.trim()}
              className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
              title="Add employee"
              aria-label="Add employee"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          placeholder="Search people..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Quick filter pills */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setFilterBy('all')}
          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'all'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilterBy('unassigned')}
          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'unassigned'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Unassigned ({unassignedCount})
        </button>
        <button
          onClick={() => setFilterBy('new-hires')}
          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'new-hires'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          New Hires ({newHiresCount})
        </button>
      </div>

      {/* Employee list grouped by department */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {filteredEmployees.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No people found. Add manually or import CSV.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedDepts.map((dept) => {
              const deptEmployees = grouped.get(dept)!
              const isCollapsed = collapsedDepts.has(dept)
              return (
                <div key={dept}>
                  <button
                    onClick={() => toggleDept(dept)}
                    className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 rounded"
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span>{dept}</span>
                    <span className="text-gray-400 font-normal">({deptEmployees.length})</span>
                  </button>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-0.5 ml-1">
                      {deptEmployees.map((employee) => {
                        const deptColor = employee.department
                          ? getDepartmentColor(employee.department)
                          : '#9CA3AF'
                        return (
                          <div
                            key={employee.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 group ${canEdit ? 'cursor-grab' : 'cursor-default'}`}
                            draggable={canEdit}
                            title={!canEdit ? 'Read-only access. Contact an editor to make changes.' : undefined}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/employee-id', employee.id)
                              e.dataTransfer.effectAllowed = 'move'
                              // Publish the in-flight drag so CanvasStage /
                              // DeskRenderer can paint drop-target outlines
                              // (green for open desks, amber for occupied).
                              useSeatDragStore.getState().setDraggingEmployee(employee.id)
                            }}
                            onDragEnd={() => {
                              // Reset regardless of success — both "drop landed
                              // on a desk" and "drop fell through to nothing"
                              // end the gesture and should clear the outlines.
                              useSeatDragStore.getState().reset()
                            }}
                          >
                            {/* Avatar */}
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                              style={{ backgroundColor: deptColor }}
                            >
                              {getInitials(employee.name)}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">
                                {employee.name}
                              </div>
                              {employee.title && (
                                <div className="text-[10px] text-gray-400 truncate">
                                  {employee.title}
                                </div>
                              )}
                            </div>
                            {/* Assignment status */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                  employee.seatId ? 'bg-green-500' : 'bg-red-400'
                                }`}
                              />
                              <span
                                className={`text-[10px] ${
                                  employee.seatId ? 'text-green-600' : 'text-red-500'
                                }`}
                              >
                                {employee.seatId || 'Unassigned'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
