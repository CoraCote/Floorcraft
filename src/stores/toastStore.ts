import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  body?: string
  action?: ToastAction
}

interface ToastState {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
}

// Cap at 3 visible toasts — drops oldest when a 4th arrives. Avoids
// stacks of stale notifications eating the screen during bulk actions.
const MAX_TOASTS = 3

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = nanoid()
    set((state) => {
      const next = [...state.items, { ...item, id }]
      return { items: next.slice(-MAX_TOASTS) }
    })
    return id
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}))
