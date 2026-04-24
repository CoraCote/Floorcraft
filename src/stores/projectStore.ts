import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import { generateSlug } from '../lib/slug'
import type { OfficeRole } from '../lib/offices/permissionsRepository'

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
  // Current viewer's effective role for the loaded office. `null` means
  // "unknown" — either no office is loaded yet, or the role lookup failed.
  // Consumers treat `null` permissively (same as editor) so transient
  // outages don't lock operators out.
  currentOfficeRole: OfficeRole | null
  // Owner-only "view as role" impersonation. Client-side UI-gating only —
  // the server still sees the owner token, so this is a reversible preview,
  // not a real privilege downgrade. `null` when not impersonating.
  // Intentionally NOT persisted across reloads (see top-level store init):
  // logging in and finding yourself still impersonating would be a footgun.
  impersonatedRole: OfficeRole | null
  // Team + user context for audit emission. Resolved once per office load
  // from `ProjectShell`. Both `null` in pre-login / anonymous-link paths —
  // `audit.emit` treats the missing ids as "skip emission" so callers
  // don't have to branch.
  currentTeamId: string | null
  currentUserId: string | null

  setCurrentProject: (project: Project) => void
  updateProjectName: (name: string) => void
  setDirty: (dirty: boolean) => void
  setLastSavedAt: (at: string) => void
  setSaveState: (s: SaveState) => void
  setOfficeId: (id: string | null) => void
  setLoadedVersion: (v: string | null) => void
  setConflict: (c: ProjectConflict) => void
  setCurrentOfficeRole: (role: OfficeRole | null) => void
  setImpersonatedRole: (role: OfficeRole | null) => void
  setCurrentTeamId: (id: string | null) => void
  setCurrentUserId: (id: string | null) => void

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
  currentOfficeRole: null,
  impersonatedRole: null,
  currentTeamId: null,
  currentUserId: null,

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
  // Setting the base role always clears any active impersonation. An owner
  // who loses their seat mid-session must not keep a stale "view as viewer"
  // — at that point it stops being a preview and becomes a real downgrade,
  // which the UI never intended to apply.
  setCurrentOfficeRole: (role) => set({ currentOfficeRole: role, impersonatedRole: null }),

  // Guard: only owners can impersonate. Non-owners calling this (e.g. a
  // rogue devtools snippet) get a no-op — `useCan` then stays pinned to
  // the real role. Clearing (`role === null`) is always allowed so an
  // owner who drops their seat can still turn impersonation off manually.
  setImpersonatedRole: (role) => {
    if (role === null) {
      set({ impersonatedRole: null })
      return
    }
    if (useProjectStore.getState().currentOfficeRole !== 'owner') return
    set({ impersonatedRole: role })
  },
  setCurrentTeamId: (id) => set({ currentTeamId: id }),
  setCurrentUserId: (id) => set({ currentUserId: id }),

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
