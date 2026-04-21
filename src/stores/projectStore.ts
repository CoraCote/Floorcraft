import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'

/**
 * Save-cycle state surfaced by `useAutoSave` so UI can show a live indicator.
 * `'idle'` is the resting state when nothing has saved yet this session.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface ProjectState {
  currentProject: Project | null
  isDirty: boolean
  lastSavedAt: string | null
  saveState: SaveState

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  updateSharePermission: (perm: Project['sharePermission']) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void
  setSaveState: (s: SaveState) => void

  createNewProject: (name?: string) => Project
}

export const useProjectStore = create<ProjectState>((set, _get) => ({
  currentProject: null,
  isDirty: false,
  lastSavedAt: null,
  saveState: 'idle',

  setCurrentProject: (project) => set({ currentProject: project }),

  updateProjectName: (name) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, name }
        : null,
      isDirty: true,
    })),

  updateSharePermission: (perm) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, sharePermission: perm }
        : null,
      isDirty: true,
    })),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSavedAt: (at) => set({ lastSavedAt: at, isDirty: false }),
  setSaveState: (s) => set({ saveState: s }),

  createNewProject: (name) => {
    const defaultFloorId = nanoid()
    const project: Project = {
      id: nanoid(),
      ownerId: null,
      name: name || 'Untitled Office Plan',
      slug: generateSlug(),
      sharePermission: 'private',
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
