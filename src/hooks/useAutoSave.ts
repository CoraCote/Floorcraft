import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useSeatingStore } from '../stores/seatingStore'
import { useProjectStore } from '../stores/projectStore'
import { useCanvasStore } from '../stores/canvasStore'

const SAVE_KEY = 'floocraft-autosave'
const SAVE_DEBOUNCE = 2000

export function useAutoSave() {
  const elements = useElementsStore((s) => s.elements)
  const guests = useSeatingStore((s) => s.guests)
  const groupColors = useSeatingStore((s) => s.groupColors)
  const project = useProjectStore((s) => s.currentProject)
  const settings = useCanvasStore((s) => s.settings)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Save
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      const data = {
        project,
        elements,
        guests,
        groupColors,
        settings,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
      setLastSavedAt(data.savedAt)
    }, SAVE_DEBOUNCE)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [elements, guests, groupColors, project, settings, setLastSavedAt])
}

export function loadAutoSave(): {
  project: ReturnType<typeof useProjectStore.getState>['currentProject']
  elements: ReturnType<typeof useElementsStore.getState>['elements']
  guests: ReturnType<typeof useSeatingStore.getState>['guests']
  groupColors: ReturnType<typeof useSeatingStore.getState>['groupColors']
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
