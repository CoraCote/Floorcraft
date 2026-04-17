import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { TopBar } from './TopBar'
import { ContextMenu } from './ContextMenu'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { CSVImportDialog } from './RightSidebar/CSVImportDialog'
import { ExportDialog } from './ExportDialog'
import { NewProjectModal } from '../dashboard/NewProjectModal'
import { ShareModal } from './ShareModal'
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

/**
 * Shared shell for all project views (/project/:slug/*). Owns:
 *  - the top navigation bar (with MAP/ROSTER pills)
 *  - one-time project bootstrap from autosave (so a cold load on the
 *    roster route still works the same as on the map route)
 *  - global modals
 *  - session-level hooks: keyboard shortcuts, autosave
 *
 * Individual views (MapView, RosterPage) render inside the `<Outlet />`
 * and bring only their own layout concerns.
 */
export function ProjectShell() {
  const employeeDirectoryOpen = useUIStore((s) => s.employeeDirectoryOpen)
  const currentProject = useProjectStore((s) => s.currentProject)
  const createNewProject = useProjectStore((s) => s.createNewProject)

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
        if (saved.activeFloorId)
          useFloorStore.getState().setActiveFloor(saved.activeFloorId)
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50">
      <TopBar />
      <Outlet />
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
