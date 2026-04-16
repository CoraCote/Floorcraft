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

export function loadAutoSave(): {
  project: ReturnType<typeof useProjectStore.getState>['currentProject']
  elements: ReturnType<typeof useElementsStore.getState>['elements']
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  departmentColors: ReturnType<typeof useEmployeeStore.getState>['departmentColors']
  floors: ReturnType<typeof useFloorStore.getState>['floors']
  activeFloorId: ReturnType<typeof useFloorStore.getState>['activeFloorId']
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
} | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
