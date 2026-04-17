import { create } from 'zustand'

interface UIState {
  // Selection
  selectedIds: string[]
  hoveredId: string | null

  // Panels
  rightSidebarOpen: boolean
  rightSidebarTab: 'properties' | 'people' | 'reports' | 'insights'

  // Modals
  shareModalOpen: boolean
  exportDialogOpen: boolean
  templatePickerOpen: boolean
  shortcutsOverlayOpen: boolean
  csvImportOpen: boolean

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
}

export const useUIStore = create<UIState>((set) => ({
  selectedIds: [],
  hoveredId: null,
  rightSidebarOpen: true,
  rightSidebarTab: 'properties',
  shareModalOpen: false,
  exportDialogOpen: false,
  templatePickerOpen: false,
  shortcutsOverlayOpen: false,
  csvImportOpen: false,
  presentationMode: false,
  contextMenu: null,
  editingLabelId: null,
  activeReport: null,
  orgChartOverlayEnabled: false,
  seatMapColorMode: null,
  movePlannerActive: false,
  employeeDirectoryOpen: false,
  drawingCancelTick: 0,

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
}))
