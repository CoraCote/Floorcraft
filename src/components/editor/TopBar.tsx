import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useShallow } from 'zustand/react/shallow'
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Share2, Download,
  Maximize2, Minimize2, PanelRightOpen, PanelRightClose,
  Cloud, CloudOff, UploadCloud, X as XIcon,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useTemporalState } from '../../hooks/useTemporalState'
import { formatRelative } from '../../lib/time'

export function TopBar() {
  const project = useProjectStore((s) => s.currentProject)
  const updateName = useProjectStore((s) => s.updateProjectName)
  const saveState = useProjectStore((s) => s.saveState)
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)
  const { slug } = useParams<{ slug: string }>()
  const { stageScale, zoomIn, zoomOut, resetZoom } = useCanvasStore(useShallow((s) => ({ stageScale: s.stageScale, zoomIn: s.zoomIn, zoomOut: s.zoomOut, resetZoom: s.resetZoom })))
  const { rightSidebarOpen, setRightSidebarOpen, setShareModalOpen, setExportDialogOpen, setPresentationMode, presentationMode, selectedIds, clearSelection } = useUIStore(useShallow((s) => ({ rightSidebarOpen: s.rightSidebarOpen, setRightSidebarOpen: s.setRightSidebarOpen, setShareModalOpen: s.setShareModalOpen, setExportDialogOpen: s.setExportDialogOpen, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, selectedIds: s.selectedIds, clearSelection: s.clearSelection })))
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo
  const { canUndo, canRedo } = useTemporalState()

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

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
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
            onDoubleClick={() => {
              setNameValue(project?.name || '')
              setEditing(true)
            }}
          >
            {project?.name || 'Untitled Office Plan'}
          </button>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* MAP / ROSTER view toggle — React Router owns the active state so we
          don't need UI-store bookkeeping. Hidden on routes without a slug
          (shouldn't happen, but keeps the component resilient). */}
      {slug && (
        <nav aria-label="Project views" className="flex items-center bg-gray-100 rounded-md p-0.5">
          <NavLink
            to={`/project/${slug}/map`}
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
            to={`/project/${slug}/roster`}
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

      <button
        onClick={() => setExportDialogOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
      >
        <Download size={14} />
        Export
      </button>
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
      <span className="flex items-center gap-1 text-xs text-gray-500" title="Saving to local storage">
        <UploadCloud size={14} className="animate-pulse" />
        Saving…
      </span>
    )
  }
  if (saveState === 'error') {
    return (
      <span
        className="flex items-center gap-1 text-xs text-red-600"
        title="Autosave failed — check browser storage quota"
      >
        <CloudOff size={14} />
        Save failed
      </span>
    )
  }
  const relative = formatRelative(lastSavedAt)
  if (!relative) return null
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500" title={`Autosaved at ${lastSavedAt}`}>
      <Cloud size={14} />
      Saved {relative}
    </span>
  )
}
