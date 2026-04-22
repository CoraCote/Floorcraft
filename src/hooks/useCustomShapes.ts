import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from 'nanoid'

const STORAGE_KEY = 'floocraft.library.customShapes'
const MAX_SHAPES = 25

export interface CustomShape {
  id: string
  name: string
  svgSource: string
}

interface CustomShapesState {
  shapes: CustomShape[]
  addShape: (name: string, svgSource: string) => CustomShape | null
  removeShape: (id: string) => void
  /** Returns the shape by id, or null. Handy for drop handlers. */
  getShape: (id: string) => CustomShape | null
}

export const useCustomShapes = create<CustomShapesState>()(
  persist(
    (set, get) => ({
      shapes: [],
      addShape: (name, svgSource) => {
        if (get().shapes.length >= MAX_SHAPES) return null
        const shape: CustomShape = { id: nanoid(8), name, svgSource }
        set((state) => ({ shapes: [...state.shapes, shape] }))
        return shape
      },
      removeShape: (id) =>
        set((state) => ({ shapes: state.shapes.filter((s) => s.id !== id) })),
      getShape: (id) => get().shapes.find((s) => s.id === id) ?? null,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
