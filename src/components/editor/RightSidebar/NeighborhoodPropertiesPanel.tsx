import { useState } from 'react'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCan } from '../../../hooks/useCan'
import { NEIGHBORHOOD_PALETTE } from '../../../types/neighborhood'

/**
 * Submit-on-blur properties panel for a selected neighborhood. Separate
 * component from `PropertiesPanel` because neighborhoods live in their
 * own store and don't share the CanvasElement shape — keeping this as a
 * standalone component avoids threading `Neighborhood | CanvasElement`
 * through every widget in the element panel.
 */
export function NeighborhoodPropertiesPanel({ id }: { id: string }) {
  const n = useNeighborhoodStore((s) => s.neighborhoods[id])
  const updateNeighborhood = useNeighborhoodStore((s) => s.updateNeighborhood)
  const deleteNeighborhood = useNeighborhoodStore((s) => s.deleteNeighborhood)
  const employees = useEmployeeStore((s) => s.employees)
  const canEdit = useCan('editMap')
  const inputDisabled = !canEdit

  // Local draft state for the text fields so we commit on blur (the spec
  // calls for submit-on-blur). A per-field draft keeps the commit scope
  // small and avoids a blur on one field accidentally rolling back a
  // concurrent change landed elsewhere in the store.
  const [nameDraft, setNameDraft] = useState(n?.name ?? '')
  const [deptDraft, setDeptDraft] = useState(n?.department ?? '')
  const [teamDraft, setTeamDraft] = useState(n?.team ?? '')
  const [notesDraft, setNotesDraft] = useState(n?.notes ?? '')

  // Derive props-driven state via React's recommended pattern (same as
  // DeskIdInput in PropertiesPanel): when the selection or the stored
  // value changes, re-seed the drafts.
  const [prevId, setPrevId] = useState(id)
  const [prevName, setPrevName] = useState(n?.name ?? '')
  const [prevDept, setPrevDept] = useState(n?.department ?? '')
  const [prevTeam, setPrevTeam] = useState(n?.team ?? '')
  const [prevNotes, setPrevNotes] = useState(n?.notes ?? '')
  if (
    prevId !== id ||
    prevName !== (n?.name ?? '') ||
    prevDept !== (n?.department ?? '') ||
    prevTeam !== (n?.team ?? '') ||
    prevNotes !== (n?.notes ?? '')
  ) {
    setPrevId(id)
    setPrevName(n?.name ?? '')
    setPrevDept(n?.department ?? '')
    setPrevTeam(n?.team ?? '')
    setPrevNotes(n?.notes ?? '')
    setNameDraft(n?.name ?? '')
    setDeptDraft(n?.department ?? '')
    setTeamDraft(n?.team ?? '')
    setNotesDraft(n?.notes ?? '')
  }

  if (!n) return null

  // Department datalist: unique non-null department strings from the
  // current roster. Matches the list the roster drawer already exposes
  // so autocompletion feels native.
  const departments = Array.from(
    new Set(
      Object.values(employees)
        .map((e) => e.department)
        .filter((d): d is string => !!d && d.length > 0),
    ),
  ).sort()

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Neighborhood
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
        <input
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={nameDraft}
          disabled={inputDisabled}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim()
            if (trimmed && trimmed !== n.name) {
              updateNeighborhood(id, { name: trimmed })
            } else if (!trimmed) {
              // Empty names would silently disappear on the canvas label;
              // revert the draft to the stored value so the user sees the
              // rollback explicitly.
              setNameDraft(n.name)
            }
          }}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Color"
            className="w-10 h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
            value={n.color}
            disabled={inputDisabled}
            onChange={(e) => updateNeighborhood(id, { color: e.target.value })}
          />
          <div className="flex gap-1 flex-wrap">
            {NEIGHBORHOOD_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use color ${c}`}
                title={c}
                onClick={() => updateNeighborhood(id, { color: c })}
                disabled={inputDisabled}
                className={`w-5 h-5 rounded border ${
                  n.color.toLowerCase() === c.toLowerCase()
                    ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
          Department
        </label>
        <input
          list="neighborhood-department-list"
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={deptDraft}
          disabled={inputDisabled}
          onChange={(e) => setDeptDraft(e.target.value)}
          onBlur={() => {
            const trimmed = deptDraft.trim() || null
            if (trimmed !== (n.department ?? null)) {
              updateNeighborhood(id, { department: trimmed })
            }
          }}
        />
        <datalist id="neighborhood-department-list">
          {departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Team</label>
        <input
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={teamDraft}
          disabled={inputDisabled}
          onChange={(e) => setTeamDraft(e.target.value)}
          onBlur={() => {
            const trimmed = teamDraft.trim() || null
            if (trimmed !== (n.team ?? null)) {
              updateNeighborhood(id, { team: trimmed })
            }
          }}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
        <textarea
          rows={3}
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={notesDraft}
          disabled={inputDisabled}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const trimmed = notesDraft.trim() || null
            if (trimmed !== (n.notes ?? null)) {
              updateNeighborhood(id, { notes: trimmed })
            }
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">X</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(n.x)}
            disabled={inputDisabled}
            onChange={(e) => updateNeighborhood(id, { x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Y</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(n.y)}
            disabled={inputDisabled}
            onChange={(e) => updateNeighborhood(id, { y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Width</label>
          <input
            type="number"
            min={1}
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(n.width)}
            disabled={inputDisabled}
            onChange={(e) => updateNeighborhood(id, { width: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Height</label>
          <input
            type="number"
            min={1}
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(n.height)}
            disabled={inputDisabled}
            onChange={(e) => updateNeighborhood(id, { height: Math.max(1, Number(e.target.value)) })}
          />
        </div>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => {
            deleteNeighborhood(id)
            useUIStore.getState().clearSelection()
          }}
          className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          Delete neighborhood
        </button>
      )}
    </div>
  )
}
