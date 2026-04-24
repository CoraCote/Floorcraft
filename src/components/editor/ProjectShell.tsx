import { Outlet, useLocation, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { TopBar } from './TopBar'
import { ContextMenu } from './ContextMenu'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { CSVImportDialog } from './RightSidebar/CSVImportDialog'
import { CSVImportSummaryModal } from './CSVImportSummaryModal'
import { ExportDialog } from './ExportDialog'
import { NewProjectModal } from '../dashboard/NewProjectModal'
import { ShareModal } from './ShareModal'
import { EmployeeDirectory } from '../reports/EmployeeDirectory'
import { ConflictModal } from './ConflictModal'
import { Toaster } from '../common/Toaster'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useInsightsStore } from '../../stores/insightsStore'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'
import { coerceSeatHistoryEntries } from '../../lib/offices/seatHistoryPersistence'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useUndoDataLossToast } from '../../hooks/useUndoDataLossToast'
import { supabase } from '../../lib/supabase'
import { loadOffice } from '../../lib/offices/officeRepository'
import { currentUserOfficeRole } from '../../lib/offices/currentUserOfficeRole'
import { useOfficeSync } from '../../lib/offices/useOfficeSync'
import { useSession } from '../../lib/auth/session'
import { isEmployeeStatus, type Employee } from '../../types/employee'
import { migrateEmployees } from '../../lib/offices/loadFromLegacyPayload'
import { commitDueStatusChanges } from '../../lib/commitDueStatusChanges'
import { todayIsoDate } from '../../lib/time'
import { useEffectiveDateTick } from '../../hooks/useEffectiveDateTick'
import type { Project } from '../../types/project'

type ShellState = 'loading' | 'not_found' | 'ready'

/**
 * Shared shell for all office views (`/t/:teamSlug/o/:officeSlug/*`).
 * Owns:
 *
 *  - Loading the office record from Supabase (team id → office row) and
 *    hydrating the per-domain stores with its payload.
 *  - Running `useOfficeSync` for debounced optimistic saves.
 *  - The conflict modal, fed by `projectStore.conflict`.
 *  - The TopBar, global modals, and session-level hooks (keyboard
 *    shortcuts, browser tab title).
 *
 * Individual views (`MapView`, `RosterPage`) render inside `<Outlet />`
 * and bring only their own layout concerns.
 */
export function ProjectShell() {
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const [shellState, setShellState] = useState<ShellState>('loading')

  const employeeDirectoryOpen = useUIStore((s) => s.employeeDirectoryOpen)
  const currentProject = useProjectStore((s) => s.currentProject)
  const conflict = useProjectStore((s) => s.conflict)
  const session = useSession()

  useKeyboardShortcuts()
  useUndoDataLossToast()
  useEffectiveDateTick()
  const { overwrite } = useOfficeSync()

  // Keep the browser tab title in sync with the project + view so users
  // tabbing between offices can tell them apart without clicking.
  const location = useLocation()
  useEffect(() => {
    const name = currentProject?.name?.trim() || 'Untitled Office Plan'
    const view = location.pathname.includes('/roster')
      ? 'Roster'
      : location.pathname.includes('/map')
        ? 'Map'
        : ''
    const prev = document.title
    document.title = view ? `${view} · ${name} — Floorcraft` : `${name} — Floorcraft`
    return () => {
      document.title = prev
    }
  }, [currentProject?.name, location.pathname])

  // Supabase loader. The team lookup is a single-select by slug and the
  // office is fetched via `loadOffice` so RLS policies apply uniformly.
  // Either missing row collapses to a single "not found" state — we
  // intentionally don't distinguish "team doesn't exist" from "office
  // doesn't exist within team" in the UI, to avoid leaking team slugs
  // the viewer has no access to.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!teamSlug || !officeSlug) return
      setShellState('loading')
      const { data: team } = await supabase.from('teams').select('id').eq('slug', teamSlug).single()
      if (!team) {
        if (!cancelled) setShellState('not_found')
        return
      }
      const teamId = (team as { id: string }).id
      const office = await loadOffice(teamId, officeSlug)
      if (!office) {
        if (!cancelled) setShellState('not_found')
        return
      }
      if (cancelled) return

      // Hydrate stores. The payload shape mirrors the pre-Supabase
      // autosave payload (same field names) so migrations stay minimal:
      // back-fill employee status for legacy rows.
      const p = office.payload as Record<string, unknown>
      const rawEmployees = (p.employees ?? {}) as Record<string, Employee>
      // Route through the shared migration helper so the pending-status
      // queue gets back-filled / scrubbed the same way a legacy autosave
      // would — then apply any transitions that are already due at load
      // time, so a project opened on Monday with Friday-effective changes
      // lands in the right state before the user sees anything.
      const migratedEmployees = migrateEmployees(
        rawEmployees as unknown as Record<string, unknown>,
      ) as Record<string, Employee>
      const { nextEmployees } = commitDueStatusChanges(
        migratedEmployees,
        todayIsoDate(),
      )
      // Preserve the explicit status-coercion ProjectShell did historically
      // — matches the contract `isEmployeeStatus` already guards in the
      // migration helper, but we keep the fallback cheap and local.
      for (const [id, e] of Object.entries(nextEmployees)) {
        if (!isEmployeeStatus(e.status)) {
          nextEmployees[id] = { ...e, status: 'active' }
        }
      }
      useElementsStore.setState({
        elements: (p.elements ?? {}) as ReturnType<typeof useElementsStore.getState>['elements'],
      })
      useEmployeeStore.setState({
        employees: nextEmployees,
        departmentColors: (p.departmentColors ?? {}) as Record<string, string>,
      })
      // `activeFloorId` is modelled as a required `string` in the store
      // even though legacy payloads (and brand-new offices) may legitimately
      // have nothing selected yet. Keep the store happy by coercing null
      // or missing values to the empty string — every consumer already
      // falls back to the first floor when the id doesn't match anything.
      const rawActiveFloor = p.activeFloorId
      useFloorStore.setState({
        floors: (p.floors ?? []) as ReturnType<typeof useFloorStore.getState>['floors'],
        activeFloorId: typeof rawActiveFloor === 'string' ? rawActiveFloor : '',
      })
      if (p.settings) {
        useCanvasStore.setState({
          settings: p.settings as ReturnType<typeof useCanvasStore.getState>['settings'],
        })
      }

      // Rehydrate the seat-history log. `coerceSeatHistoryEntries` is
      // defensive — it walks the raw payload shape and discards anything
      // that doesn't look like a `SeatHistoryEntry`, so a partially-saved
      // or hand-edited blob can't crash the drawer. Missing key → `{}`.
      useSeatHistoryStore.setState({ entries: coerceSeatHistoryEntries(p.seatHistory) })

      // Seed the project facade so UI that reads `currentProject` (share
      // modal link, TopBar name) keeps working. The full `Project` shape
      // still predates the team/office split; we fill the minimum the UI
      // actually reads at runtime.
      //
      // Critical: `teamId` and `isPrivate` must be present so the
      // `ShareModal` can resolve permissions and show the correct initial
      // visibility without a second round-trip. `listPermissions` needs
      // the team id to enumerate team members; the visibility radio reads
      // `isPrivate` to select the default option.
      const projectFacade = {
        id: office.id,
        name: office.name,
        slug: office.slug,
        teamId: office.team_id,
        isPrivate: office.is_private,
      } as unknown as Project
      useProjectStore.setState({
        currentProject: projectFacade,
        officeId: office.id,
        loadedVersion: office.updated_at,
        lastSavedAt: office.updated_at,
        saveState: 'saved',
        conflict: null,
        currentOfficeRole: null,
      })
      useProjectStore.setState({
        currentTeamId: office.team_id,
        currentUserId: session.status === 'authenticated' ? session.user.id : null,
      })
      useInsightsStore.getState().setCurrentProjectId(office.id)

      // Resolve the viewer's role for this office. Fire-and-forget: the
      // UI renders optimistically (no role = permissive) while the role
      // lookup lands. If the session isn't authenticated we skip entirely
      // and leave the role null — those users get the hosted-link path
      // where we already fail open.
      if (session.status === 'authenticated') {
        const userId = session.user.id
        void currentUserOfficeRole(office.id, userId).then((role) => {
          // Guard against a stale response landing after the user
          // navigated to a different office.
          if (cancelled) return
          if (useProjectStore.getState().officeId !== office.id) return
          useProjectStore.setState({ currentOfficeRole: role })
        })
      }

      setShellState('ready')
    }
    void load()
    return () => {
      cancelled = true
    }
    // `session` is read inside the effect but we intentionally don't
    // re-run on auth changes — the route would redirect on logout, and
    // RBAC state doesn't need to live-update within a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSlug, officeSlug])

  if (shellState === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading office…</div>
  }
  if (shellState === 'not_found') {
    return <div className="p-6 text-sm text-red-600">Office not found.</div>
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      <TopBar />
      <Outlet />
      <ContextMenu />
      <KeyboardShortcutsOverlay />
      <CSVImportDialog />
      <CSVImportSummaryModal />
      <ExportDialog />
      <NewProjectModal />
      <ShareModal />
      {employeeDirectoryOpen && <EmployeeDirectory />}
      <Toaster />
      {conflict && (
        <ConflictModal
          onReload={() => window.location.reload()}
          onOverwrite={() => void overwrite()}
          onCancel={() => useProjectStore.setState({ conflict: null })}
        />
      )}
    </div>
  )
}
