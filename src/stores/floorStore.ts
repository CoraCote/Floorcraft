import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Floor } from '../types/floor'
import type { CanvasElement } from '../types/elements'

interface FloorState {
  floors: Floor[]
  activeFloorId: string

  setFloors: (floors: Floor[]) => void
  setActiveFloor: (floorId: string) => void
  addFloor: (name?: string) => string
  removeFloor: (floorId: string) => void
  renameFloor: (floorId: string, name: string) => void
  reorderFloor: (floorId: string, newOrder: number) => void
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
