import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useFloorStore } from '../stores/floorStore'

const SAVE_KEY = 'floocraft-autosave'
const SAVE_DEBOUNCE = 2000

export function useAutoSave() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)
  const project = useProjectStore((s) => s.currentProject)
  const settings = useCanvasStore((s) => s.settings)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Save
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
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
    }, SAVE_DEBOUNCE)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [elements, employees, departmentColors, floors, activeFloorId, project, settings, setLastSavedAt])
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
 * Shape-validate a deserialized autosave payload. We don't run a full schema
 * (overkill for a local-storage autosave), but we reject payloads where
 * required top-level fields are the wrong type — better to start a new
 * project than to load a half-broken one and crash the renderer.
 */
function isValidPayload(value: unknown): value is Partial<AutoSavePayload> {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  // `elements` must at least be an object. Other fields get looser checks.
  if (v.elements && typeof v.elements !== 'object') return false
  if (v.employees && typeof v.employees !== 'object') return false
  if (v.floors && !Array.isArray(v.floors)) return false
  return true
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
  // think about legacy payload shapes.
  const payload = parsed as AutoSavePayload
  if (payload.elements) {
    payload.elements = migrateElements(
      payload.elements as unknown as Record<string, unknown>,
    )
  }
  return payload
}
