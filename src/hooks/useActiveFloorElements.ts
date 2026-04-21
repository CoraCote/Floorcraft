import { useMemo } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { CanvasElement } from '../types/elements'

/**
 * Returns all elements for a given floor, reading from elementsStore for the
 * active floor (so live edits are visible) and from floorStore for others.
 */
export function useFloorElements(floorId: string): Record<string, CanvasElement> {
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const activeElements = useElementsStore((s) => s.elements)
  const floors = useFloorStore((s) => s.floors)

  return useMemo(() => {
    if (floorId === activeFloorId) {
      return activeElements
    }
    const floor = floors.find((f) => f.id === floorId)
    return floor?.elements ?? {}
  }, [floorId, activeFloorId, activeElements, floors])
}

/**
 * Returns elements across ALL floors, using live data for the active floor.
 */
export function useAllFloorElements(): Array<{
  floorId: string
  floorName: string
  elements: Record<string, CanvasElement>
}> {
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const activeElements = useElementsStore((s) => s.elements)
  const floors = useFloorStore((s) => s.floors)

  return useMemo(() => {
    return floors.map((floor) => ({
      floorId: floor.id,
      floorName: floor.name,
      elements: floor.id === activeFloorId ? activeElements : floor.elements,
    }))
  }, [floors, activeFloorId, activeElements])
}
