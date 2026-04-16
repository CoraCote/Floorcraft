import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'

interface ProjectState {
  currentProject: Project | null
  isDirty: boolean
  lastSavedAt: string | null

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  updateSharePermission: (perm: Project['sharePermission']) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void

  createNewProject: (name?: string) => Project
}

export const useProjectStore = create<ProjectState>((set, _get) => ({
  currentProject: null,
  isDirty: false,
  lastSavedAt: null,

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
