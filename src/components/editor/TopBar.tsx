import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Share2, Download,
  Maximize2, PanelRightOpen, PanelRightClose
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function TopBar() {
  const project = useProjectStore((s) => s.currentProject)
  const updateName = useProjectStore((s) => s.updateProjectName)
  const { stageScale, zoomIn, zoomOut, resetZoom } = useCanvasStore()
  const { rightSidebarOpen, setRightSidebarOpen, setShareModalOpen, setExportDialogOpen, setPresentationMode } = useUIStore()
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo

  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

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
            {project?.name || 'Untitled Floor Plan'}
          </button>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex items-center gap-1">
        <button onClick={() => undo()} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button onClick={() => redo()} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex items-center gap-1">
        <button onClick={zoomOut} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetZoom}
          className="text-xs font-medium text-gray-600 hover:bg-gray-100 px-2 py-1 rounded min-w-[48px] text-center"
          title="Reset Zoom"
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button onClick={zoomIn} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom In">
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={() => setPresentationMode(true)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Presentation Mode (P)"
      >
        <Maximize2 size={16} />
      </button>

      <button
        onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title="Toggle Right Sidebar"
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
