import { create } from 'zustand'
import { temporal } from 'zundo'
import { nanoid } from 'nanoid'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isTableElement,
} from '../types/elements'
import { UNDO_LIMIT } from '../lib/constants'

interface ElementsState {
  elements: Record<string, CanvasElement>

  // CRUD
  addElement: (element: CanvasElement) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => void
  removeElement: (id: string) => void
  removeElements: (ids: string[]) => void
  setElements: (elements: Record<string, CanvasElement>) => void

  // Bulk
  duplicateElements: (ids: string[]) => string[]
  moveElements: (ids: string[], dx: number, dy: number) => void

  // Z-ordering
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void

  // Grouping
  groupElements: (ids: string[]) => string
  ungroupElements: (groupId: string) => void

  // Helpers
  getMaxZIndex: () => number
  getElementsByGroup: (groupId: string) => CanvasElement[]
}

export const useElementsStore = create<ElementsState>()(
  temporal(
    (set, get) => ({
      elements: {},

      addElement: (element) =>
        set((state) => ({
          elements: { ...state.elements, [element.id]: element },
        })),

      updateElement: (id, updates) =>
        set((state) => {
          const existing = state.elements[id]
          if (!existing) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...existing, ...updates } as CanvasElement,
            },
          }
        }),

      removeElement: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.elements
          return { elements: rest }
        }),

      removeElements: (ids) =>
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            delete next[id]
          }
          return { elements: next }
        }),

      setElements: (elements) => set({ elements }),

      duplicateElements: (ids) => {
        const newIds: string[] = []
        const newGroupId = nanoid()
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = state.elements[id]
            if (!el) continue
            const newId = nanoid()
            newIds.push(newId)
            let copy: CanvasElement = {
              ...el,
              id: newId,
              x: el.x + 20,
              y: el.y + 20,
              groupId: ids.length > 1 ? newGroupId : el.groupId,
              zIndex: get().getMaxZIndex() + 1,
            } as CanvasElement
            // Clear assignment fields so the duplicate doesn't falsely claim
            // the original's occupants.
            if (isDeskElement(copy)) {
              copy = { ...copy, assignedEmployeeId: null }
            } else if (isWorkstationElement(copy)) {
              copy = { ...copy, assignedEmployeeIds: [] }
            } else if (isPrivateOfficeElement(copy)) {
              copy = { ...copy, assignedEmployeeIds: [] }
            } else if (isTableElement(copy)) {
              copy = {
                ...copy,
                seats: copy.seats.map((s) => ({ ...s, assignedGuestId: null })),
              }
            }
            next[newId] = copy
          }
          return { elements: next }
        })
        return newIds
      },

      moveElements: (ids, dx, dy) =>
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = next[id]
            if (!el || el.locked) continue
            next[id] = { ...el, x: el.x + dx, y: el.y + dy } as CanvasElement
          }
          return { elements: next }
        }),

      bringToFront: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: get().getMaxZIndex() + 1 } as CanvasElement,
            },
          }
        }),

      sendToBack: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          // Manual loop instead of Math.min(...arr) to avoid hitting the JS
          // argument-count limit on very large element sets.
          let minZ = Infinity
          for (const e of Object.values(state.elements)) {
            if (e.zIndex < minZ) minZ = e.zIndex
          }
          if (minZ === Infinity) minZ = 0
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: minZ - 1 } as CanvasElement,
            },
          }
        }),

      bringForward: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: el.zIndex + 1 } as CanvasElement,
            },
          }
        }),

      sendBackward: (id) =>
        set((state) => {
          const el = state.elements[id]
          if (!el) return state
          return {
            elements: {
              ...state.elements,
              [id]: { ...el, zIndex: el.zIndex - 1 } as CanvasElement,
            },
          }
        }),

      groupElements: (ids) => {
        const groupId = nanoid()
        set((state) => {
          const next = { ...state.elements }
          for (const id of ids) {
            const el = next[id]
            if (!el) continue
            next[id] = { ...el, groupId } as CanvasElement
          }
          return { elements: next }
        })
        return groupId
      },

      ungroupElements: (groupId) =>
        set((state) => {
          const next = { ...state.elements }
          for (const [id, el] of Object.entries(next)) {
            if (el.groupId === groupId) {
              next[id] = { ...el, groupId: null } as CanvasElement
            }
          }
          return { elements: next }
        }),

      getMaxZIndex: () => {
        // Manual loop instead of Math.max(...arr) to avoid hitting the JS
        // argument-count limit on very large element sets.
        let maxZ = -Infinity
        for (const e of Object.values(get().elements)) {
          if (e.zIndex > maxZ) maxZ = e.zIndex
        }
        return maxZ === -Infinity ? 0 : maxZ
      },

      getElementsByGroup: (groupId) =>
        Object.values(get().elements).filter((e) => e.groupId === groupId),
    }),
    {
      limit: UNDO_LIMIT,
      // Exclude assignment fields from undo tracking so undo/redo does not
      // desync element state with employee.seatId. Assignment mutations go
      // through seatAssignment.ts which atomically updates both stores;
      // the employeeStore is not wrapped in temporal, so undoing an
      // assignment on the element side alone would leave the employee
      // pointing at a seat that no longer claims them (or vice versa).
      partialize: (state) => {
        const stripped: Record<string, CanvasElement> = {}
        for (const [id, el] of Object.entries(state.elements)) {
          if (isDeskElement(el)) {
            stripped[id] = { ...el, assignedEmployeeId: null }
          } else if (isWorkstationElement(el)) {
            stripped[id] = { ...el, assignedEmployeeIds: [] }
          } else if (isPrivateOfficeElement(el)) {
            stripped[id] = { ...el, assignedEmployeeIds: [] }
          } else if (isTableElement(el)) {
            stripped[id] = {
              ...el,
              seats: el.seats.map((s) => ({ ...s, assignedGuestId: null })),
            }
          } else {
            stripped[id] = el
          }
        }
        return { elements: stripped }
      },
    }
  )
)
