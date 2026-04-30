import { create } from 'zustand'

/**
 * Zustand store coordinating the multi-page PDF picker dialog with the
 * `insertPdfUnderlay` flow. The flow is:
 *
 *   1. `insertPdfUnderlay` loads the PDF doc, sees `numPages > 1`, and
 *      calls `open(numPages)` which returns a Promise.
 *   2. The store sets `numPages` (and stashes `resolve`), causing the
 *      `PdfPagePickerDialog` mounted in `MapView` to render.
 *   3. The user picks a page (or cancels). The dialog calls `pick(page)`
 *      or `pick(null)`, which calls the stashed `resolve` and clears
 *      the store back to idle.
 *   4. `insertPdfUnderlay` resumes with the chosen page index (or
 *      bails on null cancel) and continues rasterization.
 *
 * Promise-on-store pattern is used here (rather than props/context)
 * because the picker is fired from a *helper function* invoked from a
 * drop handler, not a component — so there's no React tree to thread
 * a callback through. The store is the bridge.
 */
interface PdfPagePickerState {
  numPages: number | null
  /** Awaiter set by `open`, called by `pick` so the helper resumes. */
  resolveFn: ((page: number | null) => void) | null
  open: (numPages: number) => Promise<number | null>
  pick: (page: number | null) => void
}

export const usePdfPagePickerStore = create<PdfPagePickerState>((set, get) => ({
  numPages: null,
  resolveFn: null,
  open: (numPages) => {
    return new Promise<number | null>((resolve) => {
      set({ numPages, resolveFn: resolve })
    })
  },
  pick: (page) => {
    const { resolveFn } = get()
    resolveFn?.(page)
    set({ numPages: null, resolveFn: null })
  },
}))
