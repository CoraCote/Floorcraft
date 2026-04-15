import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Guest } from '../types/guests'
import { GROUP_COLORS } from '../lib/constants'

interface SeatingState {
  guests: Record<string, Guest>
  groupColors: Record<string, string>
  searchQuery: string
  sortBy: 'name' | 'group' | 'status'

  // Actions
  addGuest: (name: string, groupName?: string, dietary?: string, vip?: boolean) => string
  addGuests: (guests: Omit<Guest, 'id' | 'projectId' | 'createdAt' | 'seatElementId'>[]) => void
  updateGuest: (id: string, updates: Partial<Guest>) => void
  removeGuest: (id: string) => void
  removeGuests: (ids: string[]) => void
  setGuests: (guests: Record<string, Guest>) => void
  assignGuestToSeat: (guestId: string, seatElementId: string) => void
  unassignGuest: (guestId: string) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: SeatingState['sortBy']) => void
  setGroupColor: (groupName: string, color: string) => void

  // Computed
  getAssignedCount: () => number
  getUnassignedGuests: () => Guest[]
  getGuestsBySeat: (seatElementId: string) => Guest[]
  getConflicts: () => Map<string, string[]>
  getGroupColor: (groupName: string) => string
  getFilteredGuests: () => Guest[]
}

export const useSeatingStore = create<SeatingState>((set, get) => ({
  guests: {},
  groupColors: {},
  searchQuery: '',
  sortBy: 'name',

  addGuest: (name, groupName, dietary, vip) => {
    const id = nanoid()
    const guest: Guest = {
      id,
      projectId: '',
      name,
      groupName: groupName || null,
      dietary: dietary || null,
      vip: vip || false,
      customAttributes: {},
      seatElementId: null,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      guests: { ...state.guests, [id]: guest },
    }))
    if (groupName) {
      get().getGroupColor(groupName) // ensure color assigned
    }
    return id
  },

  addGuests: (newGuests) =>
    set((state) => {
      const next = { ...state.guests }
      const nextColors = { ...state.groupColors }
      let colorIdx = Object.keys(nextColors).length

      for (const g of newGuests) {
        const id = nanoid()
        next[id] = {
          id,
          projectId: '',
          name: g.name,
          groupName: g.groupName || null,
          dietary: g.dietary || null,
          vip: g.vip || false,
          customAttributes: g.customAttributes || {},
          seatElementId: null,
          createdAt: new Date().toISOString(),
        }
        if (g.groupName && !nextColors[g.groupName]) {
          nextColors[g.groupName] = GROUP_COLORS[colorIdx % GROUP_COLORS.length]
          colorIdx++
        }
      }
      return { guests: next, groupColors: nextColors }
    }),

  updateGuest: (id, updates) =>
    set((state) => {
      const guest = state.guests[id]
      if (!guest) return state
      return { guests: { ...state.guests, [id]: { ...guest, ...updates } } }
    }),

  removeGuest: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.guests
      return { guests: rest }
    }),

  removeGuests: (ids) =>
    set((state) => {
      const next = { ...state.guests }
      for (const id of ids) delete next[id]
      return { guests: next }
    }),

  setGuests: (guests) => set({ guests }),

  assignGuestToSeat: (guestId, seatElementId) =>
    set((state) => {
      const guest = state.guests[guestId]
      if (!guest) return state
      return {
        guests: {
          ...state.guests,
          [guestId]: { ...guest, seatElementId },
        },
      }
    }),

  unassignGuest: (guestId) =>
    set((state) => {
      const guest = state.guests[guestId]
      if (!guest) return state
      return {
        guests: {
          ...state.guests,
          [guestId]: { ...guest, seatElementId: null },
        },
      }
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setGroupColor: (groupName, color) =>
    set((state) => ({
      groupColors: { ...state.groupColors, [groupName]: color },
    })),

  getAssignedCount: () =>
    Object.values(get().guests).filter((g) => g.seatElementId !== null).length,

  getUnassignedGuests: () =>
    Object.values(get().guests).filter((g) => g.seatElementId === null),

  getGuestsBySeat: (seatElementId) =>
    Object.values(get().guests).filter((g) => g.seatElementId === seatElementId),

  getConflicts: () => {
    const seatMap = new Map<string, string[]>()
    for (const guest of Object.values(get().guests)) {
      if (guest.seatElementId) {
        const existing = seatMap.get(guest.seatElementId) || []
        existing.push(guest.id)
        seatMap.set(guest.seatElementId, existing)
      }
    }
    const conflicts = new Map<string, string[]>()
    for (const [seatId, guestIds] of seatMap.entries()) {
      if (guestIds.length > 1) {
        conflicts.set(seatId, guestIds)
      }
    }
    return conflicts
  },

  getGroupColor: (groupName) => {
    const state = get()
    if (state.groupColors[groupName]) return state.groupColors[groupName]
    const colorIdx = Object.keys(state.groupColors).length
    const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length]
    set((s) => ({ groupColors: { ...s.groupColors, [groupName]: color } }))
    return color
  },

  getFilteredGuests: () => {
    const state = get()
    let guests = Object.values(state.guests)

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      guests = guests.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.groupName && g.groupName.toLowerCase().includes(q))
      )
    }

    guests.sort((a, b) => {
      switch (state.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'group':
          return (a.groupName || '').localeCompare(b.groupName || '')
        case 'status':
          return (a.seatElementId ? 1 : 0) - (b.seatElementId ? 1 : 0)
        default:
          return 0
      }
    })

    return guests
  },
}))
