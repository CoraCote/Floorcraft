import { TopBar } from './TopBar'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { ContextMenu } from './ContextMenu'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useEffect } from 'react'

export function EditorPage() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  useKeyboardShortcuts()

  useEffect(() => {
    if (!currentProject) {
      createNewProject()
    }
  }, [currentProject, createNewProject])

  if (presentationMode) {
    return (
      <div className="w-screen h-screen bg-white">
        <CanvasStage />
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
        </div>
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
      <ContextMenu />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
