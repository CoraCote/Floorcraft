import { create } from 'zustand'
import type { ImportIssue } from '../lib/employeeCsv'

export interface CSVImportSummary {
  importedCount: number
  skipped: ImportIssue[]
  warnings: ImportIssue[]
}

interface UIState {
  // Selection
  selectedIds: string[]
  hoveredId: string | null
  flashingElementId: string | null
  setFlashingElementId: (id: string | null) => void

  // Panels
  rightSidebarOpen: boolean
  rightSidebarTab: 'properties' | 'people' | 'reports' | 'insights'

  // Modals
  shareModalOpen: boolean
  exportDialogOpen: boolean
  templatePickerOpen: boolean
  shortcutsOverlayOpen: boolean
  csvImportOpen: boolean
  csvImportSummary: CSVImportSummary | null

  // Presentation
  presentationMode: boolean

  // Context menu
  contextMenu: { x: number; y: number; elementId: string | null } | null

  // Inline editing
  editingLabelId: string | null

  /**
   * Event-bus counter incremented when global Escape should cancel any
   * in-flight canvas drawing session (walls, future shapes). Subscribers
   * (hooks like useWallDrawing) watch this counter in a useEffect and
   * reset their session when it changes. Using a counter instead of a
   * boolean means every bump triggers the subscriber even if they
   * already handled a previous cancel.
   */
  drawingCancelTick: number

  /**
   * Reference count of open modal-like overlays (drawers, dialogs) that own
   * the Escape key and focus. Subscribers like `useKeyboardShortcuts` check
   * `> 0` before reacting to global shortcuts so pressing Escape inside a
   * drawer doesn't leak out and clear selection or reset the tool.
   *
   * Callers must pair every `registerModalOpen()` with a matching
   * `registerModalClose()` in the same lifecycle (useEffect cleanup).
   */
  modalOpenCount: number

  // Multi-seat assignment queue — ordered list of employee ids awaiting a
  // click on the map to pop into a seat. Cleared on completion or Esc.
  assignmentQueue: string[] // employee ids in order
  setAssignmentQueue: (ids: string[]) => void
  clearAssignmentQueue: () => void

  // Reports & overlays
  activeReport: string | null
  orgChartOverlayEnabled: boolean
  seatMapColorMode: 'department' | 'team' | 'employment-type' | 'office-days' | null
  movePlannerActive: boolean
  employeeDirectoryOpen: boolean

  // Actions
  setSelectedIds: (ids: string[]) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  setHoveredId: (id: string | null) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarTab: (tab: UIState['rightSidebarTab']) => void
  setShareModalOpen: (open: boolean) => void
  setExportDialogOpen: (open: boolean) => void
  setTemplatePickerOpen: (open: boolean) => void
  setShortcutsOverlayOpen: (open: boolean) => void
  setCsvImportOpen: (open: boolean) => void
  setCsvImportSummary: (summary: CSVImportSummary | null) => void
  setPresentationMode: (mode: boolean) => void
  setContextMenu: (menu: UIState['contextMenu']) => void
  setEditingLabelId: (id: string | null) => void
  setActiveReport: (report: string | null) => void
  setOrgChartOverlayEnabled: (enabled: boolean) => void
  setSeatMapColorMode: (mode: UIState['seatMapColorMode']) => void
  setMovePlannerActive: (active: boolean) => void
  setEmployeeDirectoryOpen: (open: boolean) => void
  /** Bump `drawingCancelTick` to ask any active drawing session to cancel. */
  requestCancelDrawing: () => void
  /** Increment `modalOpenCount`. Call from drawer/dialog mount effect. */
  registerModalOpen: () => void
  /** Decrement `modalOpenCount`. Call from drawer/dialog unmount cleanup. */
  registerModalClose: () => void
}

// Stash the store instance on globalThis so it survives Vitest's
// `vi.resetModules()` between dynamic imports in the same test file.
// Without this, each re-import creates a brand-new zustand store and
// state set from the outer test scope is invisible to the freshly
// imported component. Module identity is not enough; globalThis is
// the only identity that persists across resets.
type UIStore = ReturnType<typeof createUIStore>

function createUIStore() {
  return create<UIState>((set) => ({
  selectedIds: [],
  hoveredId: null,
  flashingElementId: null,
  setFlashingElementId: (id) => set({ flashingElementId: id }),
  rightSidebarOpen: true,
  rightSidebarTab: 'properties',
  shareModalOpen: false,
  exportDialogOpen: false,
  templatePickerOpen: false,
  shortcutsOverlayOpen: false,
  csvImportOpen: false,
  csvImportSummary: null,
  presentationMode: false,
  contextMenu: null,
  editingLabelId: null,
  activeReport: null,
  orgChartOverlayEnabled: false,
  seatMapColorMode: null,
  movePlannerActive: false,
  employeeDirectoryOpen: false,
  drawingCancelTick: 0,
  modalOpenCount: 0,
  assignmentQueue: [],
  setAssignmentQueue: (ids) => set({ assignmentQueue: ids }),
  clearAssignmentQueue: () => set({ assignmentQueue: [] }),

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) => set((s) => ({ selectedIds: [...s.selectedIds, id] })),
  removeFromSelection: (id) =>
    set((s) => ({ selectedIds: s.selectedIds.filter((i) => i !== id) })),
  toggleSelection: (id) =>
    set((s) =>
      s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((i) => i !== id) }
        : { selectedIds: [...s.selectedIds, id] }
    ),
  clearSelection: () => set({ selectedIds: [] }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab, rightSidebarOpen: true }),
  setShareModalOpen: (open) => set({ shareModalOpen: open }),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
  setTemplatePickerOpen: (open) => set({ templatePickerOpen: open }),
  setShortcutsOverlayOpen: (open) => set({ shortcutsOverlayOpen: open }),
  setCsvImportOpen: (open) => set({ csvImportOpen: open }),
  setCsvImportSummary: (summary) => set({ csvImportSummary: summary }),
  setPresentationMode: (mode) => set({ presentationMode: mode }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setEditingLabelId: (id) => set({ editingLabelId: id }),
  setActiveReport: (report) => set({ activeReport: report }),
  setOrgChartOverlayEnabled: (enabled) => set({ orgChartOverlayEnabled: enabled }),
  setSeatMapColorMode: (mode) => set({ seatMapColorMode: mode }),
  setMovePlannerActive: (active) => set({ movePlannerActive: active }),
  setEmployeeDirectoryOpen: (open) => set({ employeeDirectoryOpen: open }),
  requestCancelDrawing: () =>
    set((s) => ({ drawingCancelTick: s.drawingCancelTick + 1 })),
  registerModalOpen: () =>
    set((s) => ({ modalOpenCount: s.modalOpenCount + 1 })),
  registerModalClose: () =>
    // Clamp at 0 so a stray unmount (e.g. StrictMode double-invoke) can't
    // drive the counter negative and silently disable global shortcuts.
    set((s) => ({ modalOpenCount: Math.max(0, s.modalOpenCount - 1) })),
  }))
}

const __UI_STORE_KEY = Symbol.for('floocraft.ui-store')
const __g = globalThis as unknown as { [k: symbol]: unknown }
export const useUIStore: UIStore =
  (__g[__UI_STORE_KEY] as UIStore | undefined) ??
  (__g[__UI_STORE_KEY] = createUIStore()) as UIStore
