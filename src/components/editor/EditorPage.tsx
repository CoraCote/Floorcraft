import { TopBar } from './TopBar'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { ContextMenu } from './ContextMenu'
import { CSVImportDialog } from './RightSidebar/CSVImportDialog'
import { ExportDialog } from './ExportDialog'
import { NewProjectModal } from '../dashboard/NewProjectModal'
import { ShareModal } from './ShareModal'
import { Minimap } from './Minimap'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useSeatingStore } from '../../stores/seatingStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useAutoSave, loadAutoSave } from '../../hooks/useAutoSave'
import { useEffect } from 'react'

export function EditorPage() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  useKeyboardShortcuts()
  useAutoSave()

  useEffect(() => {
    if (!currentProject) {
      const saved = loadAutoSave()
      if (saved && saved.project) {
        useProjectStore.getState().setCurrentProject(saved.project)
        useElementsStore.getState().setElements(saved.elements || {})
        useSeatingStore.getState().setGuests(saved.guests || {})
        if (saved.settings) useCanvasStore.getState().setSettings(saved.settings)
      } else {
        createNewProject()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (presentationMode) {
    return (
      <div className="w-screen h-screen bg-white">
        <CanvasStage />
        <KeyboardShortcutsOverlay />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <ToolSelector />
          <div className="border-t border-gray-200" />
          <ElementLibrary />
        </div>
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <CanvasStage />
          <StatusBar />
          <Minimap />
        </div>
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
      <ContextMenu />
      <KeyboardShortcutsOverlay />
      <CSVImportDialog />
      <ExportDialog />
      <NewProjectModal />
      <ShareModal />
    </div>
  )
}
