import { create } from 'zustand'
import type { Project, ProjectVersion } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'

interface ProjectState {
  currentProject: Project | null
  versions: ProjectVersion[]
  isDirty: boolean
  lastSavedAt: string | null

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  updateSharePermission: (perm: Project['sharePermission']) => void
  setVersions: (versions: ProjectVersion[]) => void
  addVersion: (version: ProjectVersion) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void

  createNewProject: (name?: string) => Project
}

export const useProjectStore = create<ProjectState>((set, _get) => ({
  currentProject: null,
  versions: [],
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

  setVersions: (versions) => set({ versions }),
  addVersion: (version) =>
    set((state) => ({ versions: [version, ...state.versions] })),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setLastSavedAt: (at) => set({ lastSavedAt: at, isDirty: false }),

  createNewProject: (name) => {
    const project: Project = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      ownerId: null,
      name: name || 'Untitled Floor Plan',
      slug: generateSlug(),
      sharePermission: 'private',
      canvasData: {},
      canvasSettings: { ...DEFAULT_CANVAS_SETTINGS },
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set({ currentProject: project, versions: [], isDirty: false })
    return project
  },
}))
