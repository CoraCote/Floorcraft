import { useEmployeeStore } from '../../../stores/employeeStore'
import { useUIStore } from '../../../stores/uiStore'
import { useSeatDragStore } from '../../../stores/seatDragStore'
import { useCan } from '../../../hooks/useCan'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { redactEmployee } from '../../../lib/redactEmployee'
import { useState } from 'react'
import { Search, Plus, Upload, Users, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

const INPUT_CLASS =
  'w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500 bg-white dark:bg-gray-900'
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
      <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 dark:border-gray-800 mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{totalCount} people</span>
          {rosterHref && (
            <Link
              to={rosterHref}
              className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:underline"
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus size={12} />
            Add
          </button>
          <button
            onClick={() => setCsvImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <Upload size={12} />
            CSV
          </button>
        </div>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900/50 mb-3 flex flex-col gap-2">
          <input
            className={INPUT_CLASS}
            placeholder="Jane Smith"
            aria-label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddEmployee()
            }}
            autoFocus
          />
          <input
            className={INPUT_CLASS}
            placeholder="jane@example.com"
            aria-label="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddEmployee()
            }}
          />
          <input
            className={INPUT_CLASS}
            placeholder="Engineering"
            aria-label="Department"
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddEmployee()
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setNewName('')
                setNewEmail('')
                setNewDepartment('')
              }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline"
            >
              Cancel
            </button>
            <button
              onClick={handleAddEmployee}
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40"
              title="Add employee"
              aria-label="Add employee"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500" />
        <input
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:border-blue-400"
          placeholder="Search people…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Quick filter pills */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setFilterBy('all')}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'all'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilterBy('unassigned')}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'unassigned'
              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Unassigned ({unassignedCount})
        </button>
        <button
          onClick={() => setFilterBy('new-hires')}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            filterBy === 'new-hires'
              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          New Hires ({newHiresCount})
        </button>
      </div>

      {/* Employee list grouped by department */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div aria-hidden className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Users size={20} className="text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {searchQuery ? 'No people match your search' : 'No people on the roster yet'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-[200px]">
              {searchQuery ? 'Try a different search term, or import a CSV to get started.' : 'Add a teammate manually or bulk-import from CSV.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowAddForm(true)} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Add person
              </button>
              <button onClick={() => setCsvImportOpen(true)} className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50">
                Import CSV
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedDepts.map((dept) => {
              const deptEmployees = grouped.get(dept)!
              const isCollapsed = collapsedDepts.has(dept)
              return (
                <div key={dept} className="border-t border-gray-100 dark:border-gray-800 first:border-t-0 pt-2 mt-2 first:mt-0 first:pt-0">
                  <button
                    onClick={() => toggleDept(dept)}
                    className="flex items-center gap-1.5 w-full px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronDown size={12} className="text-gray-500 dark:text-gray-400" />
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {dept}
                    </span>
                    <span className="ml-auto px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                      {deptEmployees.length}
                    </span>
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
                            className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 group ${canEdit ? 'cursor-grab' : 'cursor-default'}`}
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
                              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                              style={{ backgroundColor: deptColor }}
                            >
                              {getInitials(employee.name)}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                {employee.name}
                              </div>
                              {employee.title && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {employee.title}
                                </div>
                              )}
                            </div>
                            {/* Assignment status pill */}
                            {employee.seatId ? (
                              <span
                                title={employee.seatId}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 flex-shrink-0"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                <span className="truncate max-w-[80px]">{employee.seatId}</span>
                              </span>
                            ) : (
                              <span
                                title="Unassigned"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 flex-shrink-0"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                <span className="truncate max-w-[80px]">Unassigned</span>
                              </span>
                            )}
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
