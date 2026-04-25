import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useShallow } from 'zustand/react/shallow'
import {
  Undo2, Redo2, ZoomIn, ZoomOut,
  Maximize2, Minimize2,
  Cloud, CloudOff, UploadCloud, X as XIcon,
  Ruler, Grid3x3, Compass, Printer, Image as ImageIcon,
  ChevronDown, Link2, Eye, Check, Share2, Download,
} from 'lucide-react'
import { SeatLabelStylePicker } from './TopBar/SeatLabelStylePicker'
import { FileMenu, type FileMenuGroup } from './TopBar/FileMenu'
import { buildWayfindingPdf, buildFileName } from '../../lib/pdfExport'
import { exportFloorAsPng } from '../../lib/pngExport'
import { buildExportFilename } from '../../lib/exportFilename'
import { getActiveStage } from '../../lib/stageRegistry'
import { useState, useRef, useEffect } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useTemporalState } from '../../hooks/useTemporalState'
import { formatRelative } from '../../lib/time'
import { useCan } from '../../hooks/useCan'
import { TeamSwitcher } from '../team/TeamSwitcher'
import { UserMenu } from '../team/UserMenu'
import { ScaleSettingsPopover } from './ScaleSettingsPopover'
import { ViewAsMenu } from './ViewAsMenu'
import { ShareLinkDialog } from './ShareLinkDialog'
import { PlanHealthPill } from './PlanHealthPill'

export function TopBar() {
  const project = useProjectStore((s) => s.currentProject)
  const saveState = useProjectStore((s) => s.saveState)
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)
  // Post Phase 6: the router exclusively mounts the editor at
  // `/t/:teamSlug/o/:officeSlug/*`, so we read the new params directly.
  // Any legacy `/project/:slug/*` URL redirects to /dashboard before
  // hitting this component.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const { stageScale, zoomIn, zoomOut, resetZoom, settings, setSettings, toggleGrid, toggleDimensions, toggleNorthArrow } = useCanvasStore(useShallow((s) => ({
    stageScale: s.stageScale,
    zoomIn: s.zoomIn,
    zoomOut: s.zoomOut,
    resetZoom: s.resetZoom,
    settings: s.settings,
    setSettings: s.setSettings,
    toggleGrid: s.toggleGrid,
    toggleDimensions: s.toggleDimensions,
    toggleNorthArrow: s.toggleNorthArrow,
  })))
  const { setShareModalOpen, setExportDialogOpen, setPresentationMode, presentationMode, selectedIds, clearSelection } = useUIStore(useShallow((s) => ({ setShareModalOpen: s.setShareModalOpen, setExportDialogOpen: s.setExportDialogOpen, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, selectedIds: s.selectedIds, clearSelection: s.clearSelection })))
  // Drive both temporal-wrapped stores on every undo/redo so a single
  // click rewinds the most recent canvas change regardless of which
  // store owns it (elements vs. neighborhoods).
  const undo = () => {
    useElementsStore.temporal.getState().undo()
    useNeighborhoodStore.temporal.getState().undo()
  }
  const redo = () => {
    useElementsStore.temporal.getState().redo()
    useNeighborhoodStore.temporal.getState().redo()
  }
  const { canUndo, canRedo } = useTemporalState()
  const canViewAudit = useCan('viewAuditLog')
  const canViewReports = useCan('viewReports')
  // Gate the share-link dialog behind `editMap` — editors/owners can hand
  // out read-only links to their work, but a viewer (or a shareViewer who
  // somehow lands here) cannot.
  const canShareMap = useCan('editMap')
  const [shareLinkOpen, setShareLinkOpen] = useState(false)

  // View dropdown stays inline — its items are tightly coupled to the
  // canvas store (zoom, grid, dimensions). Share + Export moved into the
  // unified FileMenu below as part of Wave 8B; that component owns its
  // own click-outside / escape handling.
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setViewMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Tick a state every 10s so the "Saved Xs ago" label stays fresh. We
  // intentionally use a counter (not a date) so React compares primitives
  // and we keep the derivation pure.
  //
  // Pause the interval when the tab is hidden — the user can't see the
  // indicator anyway, and browsers already throttle background intervals,
  // so it would land as a burst of spurious re-renders on tab focus. When
  // the tab comes back we force a tick immediately so the label catches
  // up to the actual elapsed time instead of showing the stale last value.
  const [, forceTick] = useState(0)
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id !== null) return
      id = setInterval(() => forceTick((n) => n + 1), 10_000)
    }
    const stop = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        forceTick((n) => n + 1)
        start()
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const handleExportPng = () => {
    const stage = getActiveStage()
    if (!stage || !project) return
    const floors = useFloorStore.getState().floors
    const activeFloorId = useFloorStore.getState().activeFloorId
    const floor = floors.find((f) => f.id === activeFloorId) ?? floors[0]
    if (!floor) return
    // Gather context for the export chrome (title, scale bar, legend).
    // Pulled at click time rather than wired through React props because
    // the export is fire-and-forget — there's no reactive dependency the
    // caller cares about.
    const settings = useCanvasStore.getState().settings
    const allNeighborhoods = useNeighborhoodStore.getState().neighborhoods
    const neighborhoods = Object.values(allNeighborhoods)
      .filter((n) => n.floorId === floor.id)
      .map((n) => ({ id: n.id, name: n.name, color: n.color }))
    const pxPerUnit =
      settings.scaleUnit === 'px' || settings.scale <= 0
        ? null
        : 1 / settings.scale
    // Tests stub the stage with just `toDataURL`, so these methods may
    // be missing — fall back to 0 (the chrome layout still renders, the
    // canvas area just collapses). At runtime the real Konva.Stage has
    // both methods; this guard exists purely for the test seam.
    const stageWidth = typeof stage.width === 'function' ? stage.width() : 0
    const stageHeight =
      typeof stage.height === 'function' ? stage.height() : 0
    // Fire-and-forget — the promise only exists for future async variants
    // (see `exportFloorAsPng` doc). Swallow errors to keep parity with the
    // PDF button: the user retrying a click is the simplest recovery.
    void exportFloorAsPng(stage, {
      filename: buildExportFilename(project.name, floor.name, 'png'),
      chrome: {
        officeName: project.name,
        floorName: floor.name,
        generatedAt: new Date(),
        pxPerUnit,
        scaleUnit: settings.scaleUnit,
        neighborhoods,
        canvasWidth: stageWidth,
        canvasHeight: stageHeight,
      },
    })
  }

  const handleExportWayfindingPdf = () => {
    const stage = getActiveStage()
    if (!stage || !project) return
    const floors = useFloorStore.getState().floors
    const activeFloorId = useFloorStore.getState().activeFloorId
    const floor = floors.find((f) => f.id === activeFloorId) ?? floors[0]
    if (!floor) return
    const elements = Object.values(useElementsStore.getState().elements)
    const employees = Object.values(useEmployeeStore.getState().employees)
    const settings = useCanvasStore.getState().settings
    const blob = buildWayfindingPdf({
      stage,
      projectName: project.name,
      floor,
      elements,
      employees,
      canvasSettings: settings,
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = buildFileName(project.name, floor.name)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Build the File-menu groups from the same handlers and permission gates
  // the standalone Share/Export dropdowns used to consult. Items are
  // filtered by permission so a viewer never sees an affordance they
  // cannot act on; the menu component itself stays presentational.
  const fileMenuGroups: FileMenuGroup[] = [
    // Rename moved to the OfficeSwitcher dropdown in the FloorSwitcher
    // row (Wave 15D) — the file menu now reads as
    // "things you do TO the file" (export, share) rather than a
    // mixed bag.
    {
      heading: 'Export',
      items: [
        ...(canViewReports
          ? [
              {
                id: 'export-pdf',
                label: 'Export PDF (wayfinding)',
                icon: Printer,
                onSelect: () => handleExportWayfindingPdf(),
              },
              {
                id: 'export-png',
                label: 'Export PNG',
                icon: ImageIcon,
                onSelect: () => handleExportPng(),
              },
            ]
          : []),
        {
          id: 'export-more',
          label: 'More formats…',
          icon: Download,
          onSelect: () => setExportDialogOpen(true),
        },
      ],
    },
    {
      heading: 'Share',
      items: [
        {
          id: 'share-invite',
          label: 'Invite collaborators',
          icon: Share2,
          onSelect: () => setShareModalOpen(true),
        },
        ...(canShareMap
          ? [
              {
                id: 'share-link',
                label: 'Create view-only link',
                icon: Link2,
                onSelect: () => setShareLinkOpen(true),
              },
            ]
          : []),
      ],
    },
  ]

  return (
    <div className="h-14 bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex items-center px-4 gap-3 flex-shrink-0">
      {/* ───── Identity cluster ─────
          Who am I, what file, is it saved, can I undo? These answer the
          "where am I" and "am I safe" mental-model questions that precede
          any action, so they sit at the far left. */}
      <TeamSwitcher currentSlug={teamSlug} />

      {/* Wave 15D: the editable project-name button moved out of this
          row into the FloorSwitcher strip below, where the office
          identity now lives next to the floor tabs. The TopBar's
          left cluster is just "what team am I in" — clean and minimal,
          no longer competing with the rename affordance. */}

      {/* Unified File menu — Wave 8B. Consolidates export and share
          into a single Linear/JSON-Crack-style dropdown so the
          TopBar's right cluster reads as actions on the canvas, not on
          the file. */}
      <FileMenu groups={fileMenuGroups} />

      {/* Hairline divider between the identity cluster and the
          save/undo cluster — JSON-Crack idiom that helps the eye
          group otherwise unrelated chips. */}
      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} />

      <div className="flex items-center gap-1">
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          className={`p-1.5 rounded text-gray-600 dark:text-gray-300 dark:text-gray-400 ${canUndo ? 'hover:bg-gray-100 dark:hover:bg-gray-800' : 'opacity-40 cursor-not-allowed'}`}
          title={canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo'}
          aria-label="Undo"
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          className={`p-1.5 rounded text-gray-600 dark:text-gray-300 dark:text-gray-400 ${canRedo ? 'hover:bg-gray-100 dark:hover:bg-gray-800' : 'opacity-40 cursor-not-allowed'}`}
          title={canRedo ? 'Redo (Ctrl+Shift+Z)' : 'Nothing to redo'}
          aria-label="Redo"
        >
          <Redo2 size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      {/* ───── Viewport cluster ─────
          Everything that changes how the canvas LOOKS without changing its
          content — zoom level, grid, dimension labels, scale+units. The
          zoom/grid/dimensions toggles collapsed into the View dropdown so
          the TopBar no longer reads as a row of twenty identical icons;
          the scale popover and numeric grid-size stepper stay inline
          because they hold persistent values the user wants to see. */}
      <div className="relative" ref={viewMenuRef}>
        <button
          onClick={() => setViewMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 rounded"
          aria-haspopup="menu"
          aria-expanded={viewMenuOpen}
        >
          <Eye size={14} aria-hidden="true" />
          View
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {viewMenuOpen && (
          <div
            role="menu"
            className="absolute left-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow dark:bg-gray-900 dark:border-gray-700 dark:shadow-black/40 z-30 py-1"
          >
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                zoomIn()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
            >
              <ZoomIn size={14} aria-hidden="true" />
              Zoom in
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">+</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                zoomOut()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
            >
              <ZoomOut size={14} aria-hidden="true" />
              Zoom out
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">−</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                resetZoom()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
            >
              <span className="inline-block w-[14px] text-center text-xs font-mono">
                {Math.round(stageScale * 100)}
              </span>
              Reset zoom
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">0</kbd>
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                toggleGrid()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
              aria-pressed={settings.showGrid}
            >
              {settings.showGrid ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <span className="inline-block w-[14px]" />
              )}
              <Grid3x3 size={14} aria-hidden="true" />
              Toggle grid
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">G</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                toggleDimensions()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
              aria-pressed={settings.showDimensions}
            >
              {settings.showDimensions ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <span className="inline-block w-[14px]" />
              )}
              <Ruler size={14} aria-hidden="true" />
              Toggle dimensions
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">D</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setViewMenuOpen(false)
                toggleNorthArrow()
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
              aria-pressed={settings.showNorthArrow ?? true}
            >
              {(settings.showNorthArrow ?? true) ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <span className="inline-block w-[14px]" />
              )}
              <Compass size={14} aria-hidden="true" />
              Toggle compass
              <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono">N</kbd>
            </button>

            {/* Seat-label style picker — Wave 15C. Lives inside the View
                menu alongside grid / dimensions because it's a view
                preference, not a project property. The picker writes
                through `setSettings` so the choice flows through the
                existing autosave plumbing. */}
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <SeatLabelStylePicker
              value={settings.seatLabelStyle ?? 'pill'}
              onChange={(next) => setSettings({ seatLabelStyle: next })}
            />
          </div>
        )}
      </div>

      {/* Grid-size stepper stays inline: it holds a persistent numeric
          value the user wants to see at a glance (12px vs 48px changes
          visibly on the canvas), so burying it in a dropdown would hide
          state. */}
      <input
        type="number"
        min={4}
        max={200}
        step={2}
        value={settings.gridSize}
        onChange={(e) => setSettings({ gridSize: Number(e.target.value) })}
        className="w-[60px] text-xs bg-white text-gray-900 border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
        title="Grid size"
        aria-label="Grid size"
      />

      {/* Scale + unit picker. Same rationale as the grid-size stepper —
          the active scale (1:100, feet vs meters) drives every dimension
          label on the canvas, so keeping it visible avoids round-trips
          into a menu. */}
      <ScaleSettingsPopover />

      <div className="flex-1" />

      {/* ───── Action cluster ─────
          Things the user does TO the canvas or with the office: select,
          present, share, export, navigate between views, manage account. */}

      {/* Selection chip — clickable to clear, makes it obvious why
          Delete/Duplicate shortcuts are live. */}
      {selectedIds.length > 0 && (
        <button
          onClick={clearSelection}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/40 dark:hover:bg-blue-900/40 rounded"
          title="Clear selection"
          aria-label={`Clear selection (${selectedIds.length} selected)`}
        >
          {selectedIds.length} selected
          <XIcon size={12} aria-hidden="true" />
        </button>
      )}

      {/*
        Toggles presentation (fullscreen) mode. Critical: when presentation
        is ON, this button MUST visibly reflect that and act as an exit.
        Earlier versions only rendered the "enter" state, so if a user
        entered from the roster page — which has no fullscreen overlay and
        no in-page exit button — they were trapped with no visible cue.
        The MapView has its own big "Exit" button, but it's hidden by the
        fullscreen overlay on the map only; the TopBar button is the one
        exit affordance that works from every route.
      */}
      <button
        onClick={() => setPresentationMode(!presentationMode)}
        className={`p-1.5 rounded flex items-center gap-1 ${
          presentationMode
            ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
            : 'hover:bg-gray-100 text-gray-600 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
        title={
          presentationMode
            ? 'Exit presentation mode (P or Esc)'
            : 'Presentation Mode (P)'
        }
        aria-label={
          presentationMode ? 'Exit presentation mode' : 'Enter presentation mode'
        }
        aria-pressed={presentationMode}
      >
        {presentationMode
          ? <Minimize2 size={16} aria-hidden="true" />
          : <Maximize2 size={16} aria-hidden="true" />}
      </button>

      {/*
        The right-sidebar collapse / expand button used to live here in
        the TopBar. It now belongs to the side panel itself — the
        collapse chevron is rendered at the left edge of the sidebar's
        tablist row when the panel is open, and an "Open panel" tab is
        rendered as a floating affordance at the top-right of the
        canvas when the panel is closed (see SidebarToggle.tsx). That
        keeps the TopBar focused on document-level concerns and makes
        the collapse control visually adjacent to what it controls.
      */}

      {/* Share + Export collapsed into the FileMenu at the left of the
          TopBar (Wave 8B). The view-only link dialog stays mounted here
          because it's owned by the share-link button — the FileMenu only
          flips its open state via setShareLinkOpen. */}
      <ShareLinkDialog open={shareLinkOpen} onClose={() => setShareLinkOpen(false)} />

      {/* MAP / ROSTER view toggle. React Router owns the active state so
          we don't need UI-store bookkeeping. Moved to the action cluster
          alongside Share/Export because jumping between Map and Roster is
          a navigation action, not part of identity. Guarded on both
          params so the hotkeys are inert outside the editor routes. */}
      {teamSlug && officeSlug && (
        <nav aria-label="Project views" className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          <NavLink
            to={`/t/${teamSlug}/o/${officeSlug}/map`}
            className={({ isActive }) =>
              `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`
            }
          >
            Map
          </NavLink>
          <NavLink
            to={`/t/${teamSlug}/o/${officeSlug}/roster`}
            className={({ isActive }) =>
              `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`
            }
          >
            Roster
          </NavLink>
          {canViewAudit && (
            <NavLink
              to={`/t/${teamSlug}/o/${officeSlug}/audit`}
              className={({ isActive }) =>
                `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`
              }
            >
              Audit
            </NavLink>
          )}
          {canViewReports && (
            <NavLink
              to={`/t/${teamSlug}/o/${officeSlug}/reports`}
              className={({ isActive }) =>
                `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`
              }
            >
              Reports
            </NavLink>
          )}
          {canViewReports && (
            <NavLink
              to={`/t/${teamSlug}/o/${officeSlug}/org-chart`}
              className={({ isActive }) =>
                `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`
              }
            >
              Org Chart
            </NavLink>
          )}
        </nav>
      )}

      {/* Wave 15D: the standalone Help link was removed — it duplicated
          the User-guide row already inside UserMenu. The standalone
          ThemeToggle was also removed for the same reason; theme now
          has a single home inside UserMenu's Account section. */}

      {/* Owner-only "View as…" menu. Rendered to the left of the account
          avatar so it reads as an admin tool rather than part of the user's
          own session state. The component self-gates on role so non-owners
          don't see it at all. */}
      <ViewAsMenu />

      <PlanHealthPill />

      {/* Account block — Wave 15D gives the avatar visual weight by
          parking it inside its own bordered cluster. The left hairline
          + ml-1 wrapper turn UserMenu from "one more icon in the row"
          into "the rightmost cluster", which the user described as
          "barely visible" before this pass. */}
      <div className="ml-1 pl-3 border-l border-gray-200 dark:border-gray-800 flex items-center">
        <UserMenu />
      </div>
    </div>
  )
}

/**
 * Persistent save-state chip. The text label is always rendered next to
 * the icon so color-blind users (and anyone glancing at a small monitor)
 * get an unambiguous status without hovering. Relative timestamp updates
 * piggyback on the TopBar's existing 10s `forceTick` interval — no new
 * timer, see the comment on `forceTick` in TopBar above.
 *
 * - saved  → green cloud + "Saved Xs ago"
 * - saving → gray cloud  + "Saving…"
 * - error  → red cloud-off + "Save failed — click to retry"
 */
function SaveIndicator({
  saveState,
  lastSavedAt,
}: {
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: string | null
}) {
  // The outer wrapper is always mounted so screen readers pick up
  // transitions between "Saving…" / "Saved 3s ago" / "Save failed"
  // without needing to re-evaluate a new live region each time.
  const inner = (() => {
    if (saveState === 'saving') {
      return (
        <span
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
          title="Saving to Supabase"
        >
          <UploadCloud size={14} className="animate-pulse" aria-hidden="true" />
          Saving…
        </span>
      )
    }
    if (saveState === 'error') {
      // useOfficeSync already retries on its own exponential backoff
      // (2s → 5s → 15s → 30s), so there's no user-triggered retry action
      // to wire here. The hint text still names retry as the recovery so
      // the user understands the app is actively working on it — without
      // this, a red "Save failed" chip with no further context reads as a
      // dead end.
      return (
        <span
          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 whitespace-nowrap"
          title="Save failed — we're retrying automatically; check your connection if this persists"
        >
          <CloudOff size={14} aria-hidden="true" />
          Save failed — retrying
        </span>
      )
    }
    const relative = formatRelative(lastSavedAt)
    if (!relative) return null
    return (
      <span
        className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 whitespace-nowrap"
        title={`Saved at ${lastSavedAt}`}
      >
        <Cloud size={14} aria-hidden="true" />
        Saved {relative}
      </span>
    )
  })()
  return (
    <div aria-live="polite" aria-atomic="true" className="flex items-center">
      {inner}
    </div>
  )
}
