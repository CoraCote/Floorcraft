import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'

/**
 * Save-cycle state surfaced by `useOfficeSync` so the TopBar can show a
 * live indicator. `'idle'` is the resting state when nothing has saved
 * yet this session.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Conflict signal raised by `useOfficeSync` when an optimistic save loses
 * the `updated_at` race with another editor. The payload is the exact
 * store snapshot the user was trying to persist; the conflict modal uses
 * it to either keep the local edits (Overwrite) or discard and reload
 * (Reload).
 */
export type ProjectConflict = { payload: unknown } | null

interface ProjectState {
  currentProject: Project | null
  isDirty: boolean
  lastSavedAt: string | null
  saveState: SaveState
  // Supabase-backed sync metadata (Phase 4). `officeId` is the row PK; the
  // slug is cosmetic and lives on `currentProject`. `loadedVersion` is the
  // `updated_at` we fetched with, used as the optimistic-lock predicate on
  // every save.
  officeId: string | null
  loadedVersion: string | null
  conflict: ProjectConflict

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void
  setSaveState: (s: SaveState) => void
  setOfficeId: (id: string | null) => void
  setLoadedVersion: (v: string | null) => void
  setConflict: (c: ProjectConflict) => void

  createNewProject: (name?: string) => Project
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  isDirty: false,
  lastSavedAt: null,
  saveState: 'idle',
  officeId: null,
  loadedVersion: null,
  conflict: null,

  setCurrentProject: (project) => set({ currentProject: project }),

  updateProjectName: (name) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, name }
        : null,
      isDirty: true,
    })),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSavedAt: (at) => set({ lastSavedAt: at, isDirty: false }),
  setSaveState: (s) => set({ saveState: s }),
  setOfficeId: (id) => set({ officeId: id }),
  setLoadedVersion: (v) => set({ loadedVersion: v }),
  setConflict: (c) => set({ conflict: c }),

  createNewProject: (name) => {
    const defaultFloorId = nanoid()
    const project: Project = {
      id: nanoid(),
      ownerId: null,
      name: name || 'Untitled Office Plan',
      slug: generateSlug(),
      buildingName: null,
      floors: [{
        id: defaultFloorId,
        name: 'Floor 1',
        order: 0,
        elements: {},
      }],
      activeFloorId: defaultFloorId,
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS },
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set({ currentProject: project, isDirty: false })
    return project
  },
}))
