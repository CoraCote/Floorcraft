import { create } from 'zustand'

/**
 * Tiny ambient store for the room-booking dialog. Modeled like
 * `calibrateScaleStore`: one boolean-ish status + the element id
 * currently being booked, driven by canvas click handlers and the
 * context menu. Lives in `src/lib/` so the dialog component module
 * only exports components (keeps `react-refresh/only-export-components`
 * happy).
 */
interface RoomBookingDialogState {
  elementId: string | null
  open: (elementId: string) => void
  close: () => void
}

export const useRoomBookingDialogStore = create<RoomBookingDialogState>((set) => ({
  elementId: null,
  open: (elementId) => set({ elementId }),
  close: () => set({ elementId: null }),
}))
