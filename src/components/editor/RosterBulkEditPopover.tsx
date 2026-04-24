import { useState, useCallback, useEffect } from 'react'
import { applyBulkEdit, type BulkEditPatch } from '../../lib/bulkEditEmployees'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useUIStore } from '../../stores/uiStore'
import type { EmployeeStatus } from '../../types/employee'
import { EMPLOYEE_STATUSES } from '../../types/employee'

interface Props {
  selectedIds: string[]
  onClose: () => void
}

/**
 * Inline popover anchored to the Edit button in the roster bulk-action
 * bar. Four fields (dept, title, team, status); every field left blank
 * means "leave this alone" on each selected employee. Apply closes; Esc
 * closes without applying.
 */
export function RosterBulkEditPopover({ selectedIds, onClose }: Props) {
  const [department, setDepartment] = useState('')
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState('')
  const [status, setStatus] = useState<EmployeeStatus | ''>('')

  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  useEffect(() => {
    registerModalOpen()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      registerModalClose()
    }
  }, [registerModalOpen, registerModalClose, onClose])

  const apply = useCallback(() => {
    const patch: BulkEditPatch = {
      department: department === '' ? null : department,
      title: title === '' ? null : title,
      team: team === '' ? null : team,
      status: status === '' ? null : (status as EmployeeStatus),
    }
    const update = useEmployeeStore.getState().updateEmployee
    applyBulkEdit(selectedIds, patch, update)
    onClose()
  }, [selectedIds, department, title, team, status, onClose])

  return (
    <div
      className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl p-3 w-72"
      role="dialog"
      aria-label="Bulk edit selected employees"
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Editing {selectedIds.length} selected
      </div>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1" htmlFor="bulk-edit-dept">
        Department
      </label>
      <input
        id="bulk-edit-dept"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1" htmlFor="bulk-edit-title">
        Title
      </label>
      <input
        id="bulk-edit-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1" htmlFor="bulk-edit-team">
        Team
      </label>
      <input
        id="bulk-edit-team"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1" htmlFor="bulk-edit-status">
        Status
      </label>
      <select
        id="bulk-edit-status"
        value={status}
        onChange={(e) => setStatus(e.target.value as EmployeeStatus | '')}
        className="w-full mb-3 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-900"
      >
        <option value="">Leave unchanged</option>
        {EMPLOYEE_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
