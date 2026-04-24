import { create } from 'zustand'
import type { LengthUnit } from '../lib/units'
import type { Point } from '../lib/calibrateScale'
import { deriveCalibration, pointDistance } from '../lib/calibrateScale'
import { useCanvasStore } from './canvasStore'

/**
 * Transient state for the two-click Set-scale calibrator.
 *
 * Lifecycle (`status` transitions):
 *
 *     idle
 *       └─ begin()          → awaiting-first
 *     awaiting-first
 *       └─ clickAt(...)     → awaiting-second  (records firstPoint)
 *     awaiting-second
 *       └─ clickAt(...)     → awaiting-distance (records secondPoint)
 *       └─ clickAt(SAME)    → stays in awaiting-second (zero-distance guard)
 *     awaiting-distance
 *       └─ commit(v, unit)  → idle (writes scale to canvasStore)
 *       └─ reset() / esc    → idle
 *
 * The session lives in its own store (rather than local React state like
 * the Measure tool does) so the tiny modal, the canvas overlay, and the
 * keyboard shortcut hook can all read/write the same session without
 * prop-drilling through the CanvasStage. It's also trivial to test from
 * the outside — no Konva stage required.
 */

export type CalibrateStatus =
  | 'idle'
  | 'awaiting-first'
  | 'awaiting-second'
  | 'awaiting-distance'

interface CalibrateScaleState {
  status: CalibrateStatus
  firstPoint: Point | null
  secondPoint: Point | null
  /** Live cursor in canvas space — used by the overlay to draw the rubberband. */
  cursor: Point | null

  /** Arm the tool. Caller should also set `canvasStore.activeTool = 'calibrate-scale'`. */
  begin: () => void

  /**
   * Record a click at the given canvas-space point. Advances the status
   * machine; a second click that coincides with the first is ignored so
   * a stray double-click can't lead to a divide-by-zero at commit time.
   */
  clickAt: (x: number, y: number) => void

  /** Live cursor tracking for the overlay's rubberband / distance readout. */
  setCursor: (x: number, y: number) => void
  clearCursor: () => void

  /**
   * Apply the calibration: writes `scale` and `scaleUnit` into the canvas
   * store's settings, then resets. Returns false if the session isn't
   * ready (no two points) or if the math rejects the input — the caller
   * should surface a validation message in that case. On success also
   * returns the project tool to `select` so the user lands in a safe
   * default state after finishing calibration.
   */
  commit: (realDistance: number, unit: LengthUnit) => boolean

  /** Abort the session and return to idle. Never touches project scale. */
  reset: () => void
}

export const useCalibrateScaleStore = create<CalibrateScaleState>((set, get) => ({
  status: 'idle',
  firstPoint: null,
  secondPoint: null,
  cursor: null,

  begin: () =>
    set({
      status: 'awaiting-first',
      firstPoint: null,
      secondPoint: null,
      cursor: null,
    }),

  clickAt: (x, y) => {
    const s = get()
    const p = { x, y }
    if (s.status === 'idle') {
      // Defensive: a stray click when not armed just arms + records.
      set({ status: 'awaiting-second', firstPoint: p, secondPoint: null })
      return
    }
    if (s.status === 'awaiting-first') {
      set({ status: 'awaiting-second', firstPoint: p, secondPoint: null })
      return
    }
    if (s.status === 'awaiting-second' && s.firstPoint) {
      // Zero-distance guard: if the second click lands on the first
      // point, stay in awaiting-second so the user can try again instead
      // of getting stuck in a modal that can never produce a valid
      // calibration. We use strict equality on the raw canvas coords
      // (they came from the same snap pipeline so a "same point" really
      // does mean x/y match to the bit), and the math layer double-checks
      // with a <=0 guard anyway.
      if (pointDistance(s.firstPoint, p) === 0) return
      set({ status: 'awaiting-distance', secondPoint: p })
      return
    }
    // awaiting-distance: clicks are ignored — the modal has focus.
  },

  setCursor: (x, y) => {
    const prev = get().cursor
    if (prev && prev.x === x && prev.y === y) return
    set({ cursor: { x, y } })
  },

  clearCursor: () => {
    if (get().cursor === null) return
    set({ cursor: null })
  },

  commit: (realDistance, unit) => {
    const { firstPoint, secondPoint } = get()
    if (!firstPoint || !secondPoint) return false
    const result = deriveCalibration(firstPoint, secondPoint, realDistance, unit)
    if (!result) return false
    useCanvasStore.getState().setSettings({
      scale: result.scale,
      scaleUnit: result.scaleUnit,
    })
    useCanvasStore.getState().setActiveTool('select')
    set({
      status: 'idle',
      firstPoint: null,
      secondPoint: null,
      cursor: null,
    })
    return true
  },

  reset: () =>
    set({
      status: 'idle',
      firstPoint: null,
      secondPoint: null,
      cursor: null,
    }),
}))
