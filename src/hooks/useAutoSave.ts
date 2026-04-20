import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useFloorStore } from '../stores/floorStore'
import { isEmployeeStatus } from '../types/employee'

const SAVE_KEY = 'floocraft-autosave'
const SAVE_DEBOUNCE = 2000

export function useAutoSave() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)
  const project = useProjectStore((s) => s.currentProject)
  const settings = useCanvasStore((s) => s.settings)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)
  const setSaveState = useProjectStore((s) => s.setSaveState)
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Skip the very first effect run — on mount, every tracked store is just
  // its initial value (or the payload we just rehydrated in `loadAutoSave`).
  // Writing it straight back would flash "Saving…" → "Saved" with no user
  // change, and would overwrite the freshly-loaded timestamp.
  //
  // We compare against a snapshot of the initial dependencies rather than a
  // "first run" boolean so React 18 StrictMode's mount → cleanup → remount
  // pass doesn't get treated as a real change: the remount sees identical
  // deps to the discarded first mount, so `allUnchanged` is true and we
  // still short-circuit. Once any tracked store identity differs from the
  // snapshot, the real save pipeline runs.
  type InitialSnapshot = {
    project: typeof project
    elements: typeof elements
    employees: typeof employees
    departmentColors: typeof departmentColors
    floors: typeof floors
    activeFloorId: typeof activeFloorId
    settings: typeof settings
  }
  const initialSnapshotRef = useRef<InitialSnapshot | null>(null)

  // Save
  useEffect(() => {
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = {
        project,
        elements,
        employees,
        departmentColors,
        floors,
        activeFloorId,
        settings,
      }
      return
    }
    const snap = initialSnapshotRef.current
    const allUnchanged =
      snap.project === project &&
      snap.elements === elements &&
      snap.employees === employees &&
      snap.departmentColors === departmentColors &&
      snap.floors === floors &&
      snap.activeFloorId === activeFloorId &&
      snap.settings === settings
    if (allUnchanged) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      // Flip to 'saving' at the start so the TopBar indicator can show the
      // in-flight state — even though localStorage is synchronous, this makes
      // the transition visible to users (and to disk-bound future backends).
      setSaveState('saving')
      try {
        const data = {
          project,
          elements,
          employees,
          departmentColors,
          floors,
          activeFloorId,
          settings,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(SAVE_KEY, JSON.stringify(data))
        setLastSavedAt(data.savedAt)
        setSaveState('saved')
      } catch (err) {
        // localStorage can throw on quota exceeded or in private-mode Safari.
        // Surface via saveState so the UI can prompt a manual retry.
        if (typeof console !== 'undefined') console.error('Autosave failed:', err)
        setSaveState('error')
      }
    }, SAVE_DEBOUNCE)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [elements, employees, departmentColors, floors, activeFloorId, project, settings, setLastSavedAt, setSaveState])
}

type AutoSavePayload = {
  project: ReturnType<typeof useProjectStore.getState>['currentProject']
  elements: ReturnType<typeof useElementsStore.getState>['elements']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  departmentColors: ReturnType<typeof useEmployeeStore.getState>['departmentColors']
  floors: ReturnType<typeof useFloorStore.getState>['floors']
  activeFloorId: ReturnType<typeof useFloorStore.getState>['activeFloorId']
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
}

/**
 * Migrate a deserialized elements map. Older payloads predate the curved-walls
 * feature and don't have `bulges` or `connectedWallIds` on wall elements.
 * Back-fill these fields so consumers can safely `.some(b => b !== 0)` and
 * `.length === points.length/2 - 1` without first checking for undefined.
 * Unknown properties are preserved — this is a forward-compatible migration.
 */
function migrateElements(
  elements: Record<string, unknown>,
): ReturnType<typeof useElementsStore.getState>['elements'] {
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(elements ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const el = raw as Record<string, unknown>
    if (el.type === 'wall' && Array.isArray(el.points)) {
      const expectedBulges = Math.max(0, el.points.length / 2 - 1)
      const currentBulges = Array.isArray(el.bulges) ? el.bulges : []
      // Pad/trim to exactly the segment count; replace non-finite entries
      // with 0 so arc rendering never hits NaN.
      const bulges: number[] = []
      for (let i = 0; i < expectedBulges; i++) {
        const b = currentBulges[i]
        bulges.push(typeof b === 'number' && Number.isFinite(b) ? b : 0)
      }
      out[id] = {
        ...el,
        bulges,
        connectedWallIds: Array.isArray(el.connectedWallIds)
          ? el.connectedWallIds
          : [],
      }
    } else {
      out[id] = el
    }
  }
  return out as ReturnType<typeof useElementsStore.getState>['elements']
}

/**
 * Migrate a deserialized employees map. Older payloads predate the
 * `status` field; back-fill to `'active'` (and coerce any invalid value
 * to `'active'` too) so consumers can trust the enum unconditionally.
 */
function migrateEmployees(
  employees: Record<string, unknown>,
): ReturnType<typeof useEmployeeStore.getState>['employees'] {
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(employees ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    out[id] = {
      ...e,
      status: isEmployeeStatus(e.status) ? e.status : 'active',
    }
  }
  return out as ReturnType<typeof useEmployeeStore.getState>['employees']
}

/**
 * Shape-validate a deserialized autosave payload. We don't run a full schema
 * (overkill for a local-storage autosave), but we reject payloads where
 * required top-level fields are the wrong type — better to start a new
 * project than to load a half-broken one and crash the renderer.
 */
function isValidPayload(value: unknown): value is Partial<AutoSavePayload> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  // `elements` and `employees` are Records keyed by id. Arrays and
  // non-objects get coerced to `{}` in the loader below — we DON'T reject
  // the whole payload over a malformed sub-field, because discarding the
  // user's entire save to punish a legacy/empty `employees: []` would be
  // far worse than silently normalising it. Only reject if the type is
  // genuinely unusable (e.g. `elements: "oops"`).
  if (v.elements && typeof v.elements !== 'object') return false
  if (v.employees && typeof v.employees !== 'object') return false
  if (v.floors && !Array.isArray(v.floors)) return false
  return true
}

/** Normalise a field that must be a Record. Arrays/non-objects → `{}`. */
function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function loadAutoSave(): AutoSavePayload | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isValidPayload(parsed)) return null
  // Apply element migrations before returning, so callers never have to
  // think about legacy payload shapes. `ensureRecord` coerces arrays into
  // `{}` so downstream `Object.entries` never sees numeric array keys
  // (which would otherwise produce phantom element ids like `"0"`, `"1"`).
  //
  // Important: only populate each field when it was *present* in the raw
  // payload. Synthesising `employees: {}` for a payload that legitimately
  // omitted the field (very early autosaves, or hand-crafted fixtures)
  // would stomp on whatever the consumer has already seeded — the bootstrap
  // in `ProjectShell` guards with `if (saved.employees)` and relies on
  // `undefined` to mean "leave the store alone".
  const payload = parsed as AutoSavePayload
  const rawObj = parsed as Record<string, unknown>
  if (rawObj.elements !== undefined) {
    payload.elements = migrateElements(ensureRecord(rawObj.elements))
  }
  if (rawObj.employees !== undefined) {
    payload.employees = migrateEmployees(ensureRecord(rawObj.employees))
  }
  return payload
}
