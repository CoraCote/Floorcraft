import { create } from 'zustand'

interface UIState {
  // Selection
  selectedIds: string[]
  hoveredId: string | null

  // Panels
  rightSidebarOpen: boolean
  rightSidebarTab: 'properties' | 'guests' | 'table' | 'comments' | 'versions'

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
}))
