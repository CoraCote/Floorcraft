import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Floor } from '../types/floor'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isTableElement,
} from '../types/elements'

interface FloorState {
  floors: Floor[]
  activeFloorId: string

  setFloors: (floors: Floor[]) => void
  setActiveFloor: (floorId: string) => void
  addFloor: (name?: string) => string
  removeFloor: (floorId: string) => void
  renameFloor: (floorId: string, name: string) => void
  reorderFloor: (floorId: string, newOrder: number) => void
  /**
   * Wave 9C: drag-to-reorder. Moves the floor identified by `floorId` so it
   * sits at `newIndex` in the sorted (by `order`) sequence, then rewrites
   * every floor's `order` to its new position. Idempotent if the floor is
   * already at `newIndex`. Returns `{ fromIndex, toIndex }` so callers can
   * emit audit events with the actual movement; `null` if the floor wasn't
   * found or the move was a no-op.
   */
  reorderFloors: (
    floorId: string,
    newIndex: number,
  ) => { fromIndex: number; toIndex: number } | null
  /**
   * Wave 9C: clones a floor's elements into a brand-new sibling floor
   * inserted immediately after the source in `order`. Seat assignments are
   * stripped from the clones (desk `assignedEmployeeId = null`,
   * workstation/private-office `assignedEmployeeIds = []`, table seats
   * `assignedGuestId = null`) so duplicating never double-seats anyone.
   * Returns the new floor's id, or `null` if the source wasn't found.
   */
  duplicateFloor: (
    floorId: string,
    sourceElements?: Record<string, CanvasElement>,
  ) => { newId: string; newName: string } | null
  getActiveFloor: () => Floor | undefined
  getFloorElements: (floorId: string) => Record<string, CanvasElement>
  setFloorElements: (floorId: string, elements: Record<string, CanvasElement>) => void
}

const defaultFloorId = nanoid()

export const useFloorStore = create<FloorState>((set, get) => ({
  floors: [
    {
      id: defaultFloorId,
      name: 'Floor 1',
      order: 0,
      elements: {},
    },
  ],
  activeFloorId: defaultFloorId,

  setFloors: (floors) => set({ floors }),

  setActiveFloor: (floorId) => set({ activeFloorId: floorId }),

  addFloor: (name) => {
    const id = nanoid()
    const state = get()
    const maxOrder = state.floors.reduce((max, f) => Math.max(max, f.order), -1)
    const floor: Floor = {
      id,
      name: name || `Floor ${state.floors.length + 1}`,
      order: maxOrder + 1,
      elements: {},
    }
    set((s) => ({ floors: [...s.floors, floor] }))
    return id
  },

  removeFloor: (floorId) =>
    set((state) => {
      if (state.floors.length <= 1) return state
      const nextFloors = state.floors.filter((f) => f.id !== floorId)
      // When the active floor is being deleted, fall back to the floor with
      // the lowest `order`, not whatever happens to be first in the array.
      const nextActiveId =
        state.activeFloorId === floorId
          ? [...nextFloors].sort((a, b) => a.order - b.order)[0].id
          : state.activeFloorId
      return { floors: nextFloors, activeFloorId: nextActiveId }
    }),

  renameFloor: (floorId, name) =>
    set((state) => ({
      floors: state.floors.map((f) => (f.id === floorId ? { ...f, name } : f)),
    })),

  reorderFloor: (floorId, newOrder) =>
    set((state) => {
      const sorted = [...state.floors].sort((a, b) => a.order - b.order)
      const moving = sorted.find((f) => f.id === floorId)
      if (!moving) return state
      const rest = sorted.filter((f) => f.id !== floorId)
      const clampedIndex = Math.max(0, Math.min(newOrder, rest.length))
      rest.splice(clampedIndex, 0, moving)
      return { floors: rest.map((f, i) => ({ ...f, order: i })) }
    }),

  reorderFloors: (floorId, newIndex) => {
    const state = get()
    const sorted = [...state.floors].sort((a, b) => a.order - b.order)
    const fromIndex = sorted.findIndex((f) => f.id === floorId)
    if (fromIndex < 0) return null
    const clamped = Math.max(0, Math.min(newIndex, sorted.length - 1))
    if (clamped === fromIndex) return null
    const [moving] = sorted.splice(fromIndex, 1)
    sorted.splice(clamped, 0, moving)
    set({ floors: sorted.map((f, i) => ({ ...f, order: i })) })
    return { fromIndex, toIndex: clamped }
  },

  duplicateFloor: (floorId, sourceElements) => {
    const state = get()
    const sorted = [...state.floors].sort((a, b) => a.order - b.order)
    const sourceIdx = sorted.findIndex((f) => f.id === floorId)
    if (sourceIdx < 0) return null
    const source = sorted[sourceIdx]

    // The active floor's live elements live in elementsStore — callers that
    // want to duplicate the active floor pass the live snapshot in via
    // `sourceElements`. Otherwise we read from the floor's stored copy.
    const elementsToClone = sourceElements ?? source.elements

    // Deep clone with fresh ids and stripped seat assignments. We rebuild
    // the elements map so cloned ids never collide with the source's ids
    // (important: both floors live in the same store, so ids must be unique
    // across all floors).
    const clonedElements: Record<string, CanvasElement> = {}
    for (const el of Object.values(elementsToClone)) {
      const newId = nanoid()
      // Structured clone is the safest deep copy for our element shapes
      // (handles nested arrays like `points`, `seats`, `equipment`). All
      // element fields are JSON-friendly.
      const cloned = structuredClone(el) as CanvasElement
      cloned.id = newId

      // Strip seat assignments. The whole point of duplicate is "use this
      // floor as a template" — carrying assignments would double-seat
      // employees in the employeeStore (one employee → two seats).
      if (isDeskElement(cloned)) {
        cloned.assignedEmployeeId = null
      } else if (isWorkstationElement(cloned)) {
        // Workstations carry a SPARSE positional array — preserve the
        // length so the cloned bench renders the right number of empty
        // slots and the slot ↔ index contract holds.
        cloned.assignedEmployeeIds = Array.from(
          { length: cloned.positions },
          () => null,
        )
      } else if (isPrivateOfficeElement(cloned)) {
        cloned.assignedEmployeeIds = []
      } else if (isTableElement(cloned)) {
        cloned.seats = cloned.seats.map((s) => ({ ...s, assignedGuestId: null }))
      }

      clonedElements[newId] = cloned
    }

    const newId = nanoid()
    const newName = `${source.name} copy`
    const newFloor: Floor = {
      id: newId,
      name: newName,
      // Order is rewritten below, so any value works here.
      order: 0,
      elements: clonedElements,
    }

    // Insert immediately after the source, then renumber all `order` fields.
    const next = [...sorted]
    next.splice(sourceIdx + 1, 0, newFloor)
    set({ floors: next.map((f, i) => ({ ...f, order: i })) })

    return { newId, newName }
  },

  getActiveFloor: () => {
    const state = get()
    return state.floors.find((f) => f.id === state.activeFloorId)
  },

  getFloorElements: (floorId) => {
    const floor = get().floors.find((f) => f.id === floorId)
    return floor ? floor.elements : {}
  },

  setFloorElements: (floorId, elements) =>
    set((state) => ({
      floors: state.floors.map((f) =>
        f.id === floorId ? { ...f, elements } : f
      ),
    })),
}))
