import { create } from 'zustand'
import type { CursorInfo, Comment } from '../types/collaboration'

interface CollaborationState {
  cursors: Record<string, CursorInfo>
  comments: Comment[]
  isConnected: boolean

  setCursors: (cursors: Record<string, CursorInfo>) => void
  updateCursor: (userId: string, cursor: CursorInfo) => void
  removeCursor: (userId: string) => void
  setComments: (comments: Comment[]) => void
  addComment: (comment: Comment) => void
  updateComment: (id: string, updates: Partial<Comment>) => void
  removeComment: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  cursors: {},
  comments: [],
  isConnected: false,

  setCursors: (cursors) => set({ cursors }),
  updateCursor: (userId, cursor) =>
    set((state) => ({ cursors: { ...state.cursors, [userId]: cursor } })),
  removeCursor: (userId) =>
    set((state) => {
      const { [userId]: _removed, ...rest } = state.cursors
      return { cursors: rest }
    }),
  setComments: (comments) => set({ comments }),
  addComment: (comment) =>
    set((state) => ({ comments: [...state.comments, comment] })),
  updateComment: (id, updates) =>
    set((state) => ({
      comments: state.comments.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeComment: (id) =>
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== id),
    })),
  setConnected: (connected) => set({ isConnected: connected }),
}))
