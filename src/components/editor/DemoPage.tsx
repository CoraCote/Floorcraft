import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { CanvasStage } from './Canvas/CanvasStage'
import { CanvasFinder } from './CanvasFinder'
import { CanvasActionDock } from './Canvas/CanvasActionDock'
import { CanvasScaleBar } from './Canvas/CanvasScaleBar'
import { NorthArrow } from './Canvas/NorthArrow'
import { AlignDistributeToolbar } from './Canvas/AlignDistributeToolbar'
import { ElementHoverCard } from './Canvas/ElementHoverCard'
import { Minimap } from './Minimap'
import { StatusBar } from './StatusBar'
import { FloorSwitcher } from './FloorSwitcher'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { LayerVisibilityPanel } from './LeftSidebar/LayerVisibilityPanel'
import { CollapsibleSection } from './LeftSidebar/CollapsibleSection'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { SidebarToggle } from './RightSidebar/SidebarToggle'
import { useUIStore } from '../../stores/uiStore'
import { buildDemoOfficePayload } from '../../lib/demo/createDemoOffice'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useAnnotationsStore } from '../../stores/annotationsStore'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'
import { useReservationsStore } from '../../stores/reservationsStore'
import { useRoomBookingsStore } from '../../stores/roomBookingsStore'
import { useSeatSwapsStore } from '../../stores/seatSwapsStore'
import type { Project } from '../../types/project'

/**
 * Public `/demo` route. Mounts the bundled demo office (the same seed
 * that "Try sample office" hydrates from inside the editor) into the
 * live stores and renders a minimal read-only canvas shell so visitors
 * who click "Open the demo plan" on the landing page can poke at a
 * fully-populated floor plan without an account.
 *
 * Implementation note: we deliberately do NOT route through
 * `ProjectShell` — that component fetches from Supabase and demands
 * `teamSlug`/`officeSlug` URL params. Instead, this page hydrates the
 * exact same stores from `buildDemoOfficePayload()` and pins
 * `currentOfficeRole` to `'shareViewer'`, the synthetic role granting
 * only `viewMap`. Every editor mutation goes through `useCan('editMap')`
 * downstream, so the canvas is structurally read-only — no chance a
 * visitor accidentally edits a public demo.
 *
 * Chrome is intentionally light: a thin "Demo" banner with sign-up CTA
 * up top, the FloorSwitcher (so visitors can flip between floors), the
 * CanvasStage with its action dock and minimap, and a status bar. No
 * sidebars, no top-bar action cluster — the demo's job is to show the
 * canvas, not the editor surface.
 */
export function DemoPage() {
  // Subscribe to the right-sidebar open flag so toggling via the
  // floating pull-tab or the inline collapse handle updates the layout
  // reactively. Demo opens with the sidebar visible so visitors see the
  // Plan / Roster / Insights structure on first paint.
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)

  // Hydration runs in `useEffect`, not in the render body — calling
  // Zustand setState during render mutates external state that
  // sibling components (e.g. `NewVersionBanner`, which subscribes to
  // `projectStore`) read in their own render passes, which React
  // surfaces as "Cannot update a component while rendering a different
  // component". Effect-time mutation is the right pattern for an
  // external store; we accept the one-frame flash between mount and
  // first effect run.
  const previousRef = useRef<{
    role: ReturnType<typeof useProjectStore.getState>['currentOfficeRole']
    project: ReturnType<typeof useProjectStore.getState>['currentProject']
    officeId: ReturnType<typeof useProjectStore.getState>['officeId']
  } | null>(null)

  useEffect(() => {
    const payload = buildDemoOfficePayload()

    useElementsStore.setState({ elements: payload.elements })
    useEmployeeStore.setState({
      employees: payload.employees,
      departmentColors: payload.departmentColors,
    })
    useFloorStore.setState({
      floors: payload.floors,
      activeFloorId: payload.activeFloorId,
    })
    useCanvasStore.setState({ settings: payload.settings })
    useNeighborhoodStore.setState({ neighborhoods: payload.neighborhoods })
    useAnnotationsStore.setState({ annotations: payload.annotations })

    // Empty-out the stores that don't appear in the seed but might hold
    // state from a previous editor session in the same browser tab.
    useSeatHistoryStore.setState({ entries: {} })
    useReservationsStore.setState({ reservations: [] })
    useRoomBookingsStore.setState({ bookings: [] })
    useSeatSwapsStore.setState({ requests: {} })

    // Project facade — only the fields the canvas actually reads at
    // runtime (TopBar isn't mounted on this route, so we skip the
    // share-modal/permissions plumbing).
    const facade = {
      id: 'demo-office',
      name: 'Demo office',
      slug: 'demo',
      teamId: 'demo-team',
      isPrivate: false,
    } as unknown as Project

    previousRef.current = {
      role: useProjectStore.getState().currentOfficeRole,
      project: useProjectStore.getState().currentProject,
      officeId: useProjectStore.getState().officeId,
    }
    useProjectStore.setState({
      currentProject: facade,
      officeId: facade.id,
      currentOfficeRole: 'shareViewer',
      impersonatedRole: null,
      // Pin saveState so the (unmounted) save-indicator doesn't pop into
      // a "saving…" state during navigation away from /demo.
      saveState: 'saved',
      conflict: null,
    })

    return () => {
      // Restore the previous editor session's project/role so a user
      // who jumped to /demo from inside their own office doesn't lose
      // their context on navigation back.
      const prev = previousRef.current
      if (!prev) return
      useProjectStore.setState({
        currentProject: prev.project,
        officeId: prev.officeId,
        currentOfficeRole: prev.role,
      })
    }
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[color:var(--color-paper)] dark:bg-gray-950">
      <DemoBanner />
      <FloorSwitcher />
      <div className="flex flex-1 overflow-hidden">
        {/* 56-px tool rail (Select / Pan / Measure for shareViewer). */}
        <div className="w-14 flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-r border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-y-auto">
          <ToolSelector />
        </div>
        {/* Secondary 240-px sidebar — Layers only in read-only mode.
            The Library tile palette is gated on editMap so it would
            render half-disabled and just confuse a visitor; we skip it
            entirely here. */}
        <div className="w-[240px] flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-r border-[color:var(--color-paper-line)] dark:border-gray-800 flex flex-col overflow-y-auto">
          <CollapsibleSection title="Layers" defaultOpen storageKey="demo-layers">
            <LayerVisibilityPanel />
          </CollapsibleSection>
        </div>
        <div className="flex-1 relative overflow-hidden bg-[color:var(--color-paper)]">
          <CanvasStage />
          <StatusBar />
          <Minimap />
          <AlignDistributeToolbar />
          <ElementHoverCard />
          <CanvasActionDock />
          <CanvasScaleBar />
          <NorthArrow />
          {/* Closed-state pull-tab to expand the right sidebar. */}
          {!rightSidebarOpen && <SidebarToggle variant="floating" />}
        </div>
        {/* Right inspector — Plan / Roster / Insights tabs. Properties
            panel inside Plan shows occupant info when a desk is selected;
            Roster lets visitors browse the seeded employees; Insights
            surfaces analyzer warnings the seed data triggers. */}
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-l border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
      <CanvasFinder />
    </div>
  )
}

/**
 * Slim top banner. A read-only badge on the left, a sign-up CTA on the
 * right, the office name in the middle. Mirrors the eyebrow / mono
 * cadence of the marketing surface so the demo feels of-a-piece.
 */
function DemoBanner() {
  return (
    <header className="flex items-center justify-between gap-4 px-6 h-12 border-b border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper)] dark:bg-gray-950 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
          <span aria-hidden="true" className="relative inline-flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-md border border-[color:var(--color-blueprint)]" />
            <span className="absolute inset-1 rotate-45 border border-[color:var(--color-blueprint)]" />
          </span>
          <span className="text-sm">Floorcraft</span>
        </Link>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] border border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-blueprint-soft)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-blueprint)]" />
          Demo · read-only
        </span>
        <span className="hidden md:inline text-sm text-gray-500 dark:text-gray-400 truncate">
          Sample office — explore the canvas, switch floors, no account needed.
        </span>
      </div>
      <Link
        to="/signup"
        className="group inline-flex items-center gap-2 px-4 py-1.5 bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white text-sm font-medium rounded-md transition-colors flex-shrink-0"
      >
        Make your own
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </header>
  )
}
