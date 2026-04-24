import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useShallow } from 'zustand/react/shallow'
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Share2, Download,
  Maximize2, Minimize2, PanelRightOpen, PanelRightClose,
  Cloud, CloudOff, UploadCloud, X as XIcon,
  Ruler, Grid3x3, Printer,
} from 'lucide-react'
import { buildWayfindingPdf, buildFileName } from '../../lib/pdfExport'
import { getActiveStage } from '../../lib/stageRegistry'
import { useState, useRef, useEffect } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useTemporalState } from '../../hooks/useTemporalState'
import { formatRelative } from '../../lib/time'
import { useCan } from '../../hooks/useCan'
import { TeamSwitcher } from '../team/TeamSwitcher'
import { UserMenu } from '../team/UserMenu'
import { ScaleSettingsPopover } from './ScaleSettingsPopover'

export function TopBar() {
  const project = useProjectStore((s) => s.currentProject)
  const updateName = useProjectStore((s) => s.updateProjectName)
  const saveState = useProjectStore((s) => s.saveState)
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)
  // Post Phase 6: the router exclusively mounts the editor at
  // `/t/:teamSlug/o/:officeSlug/*`, so we read the new params directly.
  // Any legacy `/project/:slug/*` URL redirects to /dashboard before
  // hitting this component.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const { stageScale, zoomIn, zoomOut, resetZoom, settings, setSettings, toggleGrid, toggleDimensions } = useCanvasStore(useShallow((s) => ({
    stageScale: s.stageScale,
    zoomIn: s.zoomIn,
    zoomOut: s.zoomOut,
    resetZoom: s.resetZoom,
    settings: s.settings,
    setSettings: s.setSettings,
    toggleGrid: s.toggleGrid,
    toggleDimensions: s.toggleDimensions,
  })))
  const { rightSidebarOpen, setRightSidebarOpen, setShareModalOpen, setExportDialogOpen, setPresentationMode, presentationMode, selectedIds, clearSelection } = useUIStore(useShallow((s) => ({ rightSidebarOpen: s.rightSidebarOpen, setRightSidebarOpen: s.setRightSidebarOpen, setShareModalOpen: s.setShareModalOpen, setExportDialogOpen: s.setExportDialogOpen, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, selectedIds: s.selectedIds, clearSelection: s.clearSelection })))
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

  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

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

  const handleNameSubmit = () => {
    if (nameValue.trim()) {
      updateName(nameValue.trim())
    }
    setEditing(false)
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

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
      {/* Team switcher sits at the far left so users can jump between
          offices in different teams without leaving the editor. */}
      <TeamSwitcher currentSlug={teamSlug} />

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex-shrink-0">
        {editing ? (
          <input
            ref={inputRef}
            className="text-sm font-semibold px-2 py-1 border border-blue-400 rounded outline-none"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <button
            className="text-sm font-semibold text-gray-800 hover:bg-gray-100 px-2 py-1 rounded"
            title="Click to rename"
            onClick={() => {
              setNameValue(project?.name || '')
              setEditing(true)
            }}
          >
            {project?.name || 'Untitled Office Plan'}
          </button>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* MAP / ROSTER view toggle. React Router owns the active state so
          we don't need UI-store bookkeeping. Rendered only when the route
          has both params (which is always the case under /t/:teamSlug/o/
          :officeSlug/*, but the guard keeps this component resilient if
          it's ever mounted elsewhere). */}
      {teamSlug && officeSlug && (
        <nav aria-label="Project views" className="flex items-center bg-gray-100 rounded-md p-0.5">
          <NavLink
            to={`/t/${teamSlug}/o/${officeSlug}/map`}
            className={({ isActive }) =>
              `px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
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
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
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
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
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
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`
              }
            >
              Reports
            </NavLink>
          )}
        </nav>
      )}

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          className={`p-1.5 rounded text-gray-600 ${canUndo ? 'hover:bg-gray-100' : 'opacity-40 cursor-not-allowed'}`}
          title={canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo'}
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          className={`p-1.5 rounded text-gray-600 ${canRedo ? 'hover:bg-gray-100' : 'opacity-40 cursor-not-allowed'}`}
          title={canRedo ? 'Redo (Ctrl+Shift+Z)' : 'Nothing to redo'}
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex items-center gap-1">
        <button onClick={zoomOut} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom Out" aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetZoom}
          className="text-xs font-medium text-gray-600 hover:bg-gray-100 px-2 py-1 rounded min-w-[48px] text-center"
          title="Reset Zoom"
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button onClick={zoomIn} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom In" aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Grid + dimension controls. Grouped with the viewport controls
          because they share the "how do I see the canvas" mental model. */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleGrid}
          className={`p-1.5 rounded ${
            settings.showGrid
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'hover:bg-gray-100 text-gray-600'
          }`}
          title="Toggle grid (G)"
          aria-label="Toggle grid"
          aria-pressed={settings.showGrid}
        >
          <Grid3x3 size={16} />
        </button>
        <input
          type="number"
          min={4}
          max={200}
          step={2}
          value={settings.gridSize}
          onChange={(e) => setSettings({ gridSize: Number(e.target.value) })}
          className="w-[60px] text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-blue-400"
          title="Grid size"
          aria-label="Grid size"
        />
        <button
          onClick={toggleDimensions}
          className={`p-1.5 rounded ${
            settings.showDimensions
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'hover:bg-gray-100 text-gray-600'
          }`}
          title="Show/Hide dimensions (D)"
          aria-label="Toggle dimensions"
          aria-pressed={settings.showDimensions}
        >
          <Ruler size={16} />
        </button>
        {/* Scale + unit picker. Sits next to the Ruler/Grid controls
            because it belongs to the same "how does the canvas read" mental
            model — the Measure tool and dimension labels both consume these
            settings. */}
        <ScaleSettingsPopover />
      </div>

      <div className="flex-1" />

      {/* Selection chip — clickable to clear, makes it obvious why
          Delete/Duplicate shortcuts are live. */}
      {selectedIds.length > 0 && (
        <button
          onClick={clearSelection}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
          title="Clear selection"
        >
          {selectedIds.length} selected
          <XIcon size={12} />
        </button>
      )}

      <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} />

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
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'hover:bg-gray-100 text-gray-600'
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
        {presentationMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <button
        onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Toggle Right Sidebar"
        aria-label={rightSidebarOpen ? 'Close right sidebar' : 'Open right sidebar'}
      >
        {rightSidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>

      <button
        onClick={() => setShareModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
      >
        <Share2 size={14} />
        Share
      </button>

      {/*
        Wayfinding PDF — a print-ready handout with a legend. Separate from
        the multi-format Export modal because facilities managers want
        one-click-to-print without picking PDF vs PNG vs JSON every time.
        Gated behind `viewReports`: the same audience (planners, HR
        admins, owners) that already sees utilization reports is the one
        that pre-posts floor plans before a move.
      */}
      {canViewReports && (
        <button
          onClick={handleExportWayfindingPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          title="Download a print-ready PDF of this floor"
          aria-label="Export PDF"
        >
          <Printer size={14} />
          Export PDF
        </button>
      )}

      <button
        onClick={() => setExportDialogOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
      >
        <Download size={14} />
        Export
      </button>

      <div className="w-px h-6 bg-gray-200" />

      {/* Quick jump to the user guide. Opens in a new tab so the user
          doesn't lose their canvas state. */}
      <a
        href="/help"
        target="_blank"
        rel="noreferrer"
        className="text-xs px-2 py-1 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded"
        title="Open user guide in a new tab"
      >
        Help
      </a>

      {/* Account dropdown — rightmost so it's the one element users
          always know where to find. */}
      <UserMenu />
    </div>
  )
}

function SaveIndicator({
  saveState,
  lastSavedAt,
}: {
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: string | null
}) {
  if (saveState === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500" title="Saving to Supabase">
        <UploadCloud size={14} className="animate-pulse" />
        Saving…
      </span>
    )
  }
  if (saveState === 'error') {
    return (
      <span
        className="flex items-center gap-1 text-xs text-red-600"
        title="Save failed — we'll retry; check your connection if this persists"
      >
        <CloudOff size={14} />
        Save failed
      </span>
    )
  }
  const relative = formatRelative(lastSavedAt)
  if (!relative) return null
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500" title={`Saved at ${lastSavedAt}`}>
      <Cloud size={14} />
      Saved {relative}
    </span>
  )
}
