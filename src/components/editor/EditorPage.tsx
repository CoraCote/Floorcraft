import { TopBar } from './TopBar'
import { FloorSwitcher } from './FloorSwitcher'
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
import { EmployeeDirectory } from '../reports/EmployeeDirectory'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useInsightsStore } from '../../stores/insightsStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useAutoSave, loadAutoSave } from '../../hooks/useAutoSave'
import { useEffect } from 'react'

export function EditorPage() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const employeeDirectoryOpen = useUIStore((s) => s.employeeDirectoryOpen)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  useKeyboardShortcuts()
  useAutoSave()

  useEffect(() => {
    if (!currentProject) {
      const saved = loadAutoSave()
      let activeProjectId: string | null = null
      if (saved && saved.project) {
        useProjectStore.getState().setCurrentProject(saved.project)
        useElementsStore.getState().setElements(saved.elements || {})
        if (saved.settings) useCanvasStore.getState().setSettings(saved.settings)
        if (saved.employees) useEmployeeStore.getState().setEmployees(saved.employees)
        if (saved.departmentColors) {
          for (const [dept, color] of Object.entries(saved.departmentColors)) {
            useEmployeeStore.getState().setDepartmentColor(dept, color)
          }
        }
        if (saved.floors) useFloorStore.getState().setFloors(saved.floors)
        if (saved.activeFloorId) useFloorStore.getState().setActiveFloor(saved.activeFloorId)
        activeProjectId = saved.project.id ?? null
      } else {
        const project = createNewProject()
        if (project.floors?.length) {
          useFloorStore.getState().setFloors(project.floors)
          useFloorStore.getState().setActiveFloor(project.activeFloorId)
        }
        activeProjectId = project.id ?? null
      }
      // Scope insight dismissals to this project so they don't bleed across
      // projects that share the same browser localStorage.
      useInsightsStore.getState().setCurrentProjectId(activeProjectId)
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
      <FloorSwitcher />
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
      {employeeDirectoryOpen && <EmployeeDirectory />}
    </div>
  )
}
