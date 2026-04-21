import { useState, useCallback, useRef, useEffect } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid } from '../lib/geometry'
import { signedPerpOffset, clampBulge } from '../lib/wallEditing'

/** Min pointer travel (canvas units) before a press counts as a drag. */
const DRAG_THRESHOLD_PX = 4
const DRAG_THRESHOLD_SQ = DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX

interface WallDrawingState {
  isDrawing: boolean
  points: number[]
  bulges: number[]
  currentPoint: { x: number; y: number } | null
  /** Live bulge for the pending final segment while dragging. null if no drag. */
  previewBulge: number | null
}

const INITIAL_STATE: WallDrawingState = {
  isDrawing: false,
  points: [],
  bulges: [],
  currentPoint: null,
  previewBulge: null,
}

export function useWallDrawing() {
  /**
   * React state mirrors `sessionRef` so overlays re-render. The ref is the
   * authoritative source so the hook stays correct even when multiple
   * handlers fire inside a single `act()` block (state updates batch
   * together and a state read would be stale).
   *
   * Preview moves (one per mouse event, potentially 100 Hz) are
   * coalesced via requestAnimationFrame into a single React commit per
   * frame. Commits (mouseup/dblclick/cancel) flush synchronously so no
   * vertex is lost.
   */
  const [state, setState] = useState<WallDrawingState>(INITIAL_STATE)
  const sessionRef = useRef<WallDrawingState>(INITIAL_STATE)
  const rafRef = useRef<number | null>(null)

  /** Flush any pending rAF-scheduled React state to match sessionRef. */
  const flushSession = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setState(sessionRef.current)
  }, [])

  /** Commit path: update ref and React state synchronously. */
  const commitSession = useCallback(
    (next: WallDrawingState) => {
      sessionRef.current = next
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setState(next)
    },
    [],
  )

  /** Preview path: update ref sync, coalesce React state to next rAF. */
  const scheduleSession = useCallback((next: WallDrawingState) => {
    sessionRef.current = next
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setState(sessionRef.current)
    })
  }, [])

  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)

  /** Press location (raw canvas coords, pre-snap). Null when not pressing. */
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  /** Most recent pointer during the current press. Used by mouseUp to
   *  recover drag direction even if release fires back at the press coords
   *  (e.g. user pulls to pre-view, then releases at the anchor). */
  const dragEndpointRef = useRef<{ x: number; y: number } | null>(null)

  const snapPoint = useCallback(
    (x: number, y: number) => {
      if (showGrid) {
        return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) }
      }
      return { x, y }
    },
    [gridSize, showGrid],
  )

  const resetSession = useCallback(() => {
    pressRef.current = null
    dragEndpointRef.current = null
    commitSession(INITIAL_STATE)
  }, [commitSession])

  // Tool change kills any in-flight drawing session. This prevents a
  // stale `pressRef` from surviving into a different tool and committing
  // a phantom vertex on the next click. Also resets draft state so
  // switching back to the wall tool starts fresh.
  //
  // We subscribe to the store directly instead of reading `activeTool` as
  // a selector and depending on it in the effect body: a selector would
  // force this effect to call `resetSession` (setState) synchronously in
  // render, which breaks React's "no setState in effect body" guidance and
  // is flagged by our lint config. Subscribing is the intended pattern for
  // "react to changes in an external store."
  useEffect(() => {
    let prev = useCanvasStore.getState().activeTool
    return useCanvasStore.subscribe((state) => {
      if (state.activeTool !== prev) {
        prev = state.activeTool
        resetSession()
      }
    })
  }, [resetSession])

  // Global cancel bus: Escape (handled in useKeyboardShortcuts) bumps
  // `drawingCancelTick` to kill any in-flight drawing session without
  // coupling the keyboard hook directly to this one. Same subscribe-to-
  // store pattern as the tool-change effect above.
  useEffect(() => {
    let prev = useUIStore.getState().drawingCancelTick
    return useUIStore.subscribe((state) => {
      if (state.drawingCancelTick !== prev) {
        prev = state.drawingCancelTick
        resetSession()
      }
    })
  }, [resetSession])

  // Off-canvas mouseup: Konva's Stage-level onMouseUp only fires for
  // releases inside the stage container. If the user presses inside
  // canvas, drags out (onto a sidebar, toolbar, or past the window
  // edge), and releases there, we never hear about it and `pressRef`
  // stays set forever. Watching window-level mouseup clears the press
  // state on off-canvas release. We only arm the listener while the
  // wall tool is active to avoid spurious work.
  useEffect(() => {
    if (activeTool !== 'wall') return
    const onWindowUp = () => {
      if (!pressRef.current) return
      // Treat off-canvas release as cancel of the pending drag (no vertex
      // commit, clear preview). The Stage onMouseUp, if it fires inside
      // the canvas, sees pressRef null and early-returns — so there's no
      // double-commit.
      pressRef.current = null
      dragEndpointRef.current = null
      commitSession({ ...sessionRef.current, previewBulge: null })
    }
    window.addEventListener('mouseup', onWindowUp)
    return () => window.removeEventListener('mouseup', onWindowUp)
  }, [activeTool, commitSession])

  // Unmount cleanup: cancel any scheduled rAF so we don't leak a
  // microtask that resolves after the component is gone.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleCanvasMouseDown = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return
      pressRef.current = { x: canvasX, y: canvasY }
      dragEndpointRef.current = { x: canvasX, y: canvasY }
    },
    [activeTool],
  )

  const handleCanvasMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return
      // Track live drag endpoint whenever a press is active.
      if (pressRef.current) {
        dragEndpointRef.current = { x: canvasX, y: canvasY }
      }
      const snapped = snapPoint(canvasX, canvasY)
      const prev = sessionRef.current
      if (!prev.isDrawing) {
        scheduleSession({ ...prev, currentPoint: snapped })
        return
      }
      // Compute live preview bulge if pressing and we have a prior vertex.
      if (pressRef.current && prev.points.length >= 2) {
        const lastX = prev.points[prev.points.length - 2]
        const lastY = prev.points[prev.points.length - 1]
        const dx = canvasX - pressRef.current.x
        const dy = canvasY - pressRef.current.y
        const travel2 = dx * dx + dy * dy
        if (travel2 >= DRAG_THRESHOLD_SQ) {
          const pressSnap = snapPoint(pressRef.current.x, pressRef.current.y)
          const chord = Math.hypot(pressSnap.x - lastX, pressSnap.y - lastY)
          const raw = signedPerpOffset(
            lastX,
            lastY,
            pressSnap.x,
            pressSnap.y,
            canvasX,
            canvasY,
          )
          scheduleSession({
            ...prev,
            currentPoint: snapped,
            previewBulge: clampBulge(raw, chord),
          })
          return
        }
      }
      scheduleSession({ ...prev, currentPoint: snapped, previewBulge: null })
    },
    [activeTool, snapPoint, scheduleSession],
  )

  const handleCanvasMouseUp = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall' || !pressRef.current) return
      const press = pressRef.current
      // Prefer the last mousemove position (a drag may end back at press
      // coords after the user pulls and releases). Fall back to release
      // coords if mousemove never fired.
      const endpoint = dragEndpointRef.current ?? { x: canvasX, y: canvasY }
      pressRef.current = null
      dragEndpointRef.current = null
      const snapped = snapPoint(press.x, press.y)
      const dx = endpoint.x - press.x
      const dy = endpoint.y - press.y
      const isDrag = dx * dx + dy * dy >= DRAG_THRESHOLD_SQ

      // Any pending scheduled preview is obsolete — this commit supersedes
      // it. Flush synchronously so the committed state is immediately
      // visible to the next event.
      flushSession()
      const prev = sessionRef.current
      if (!prev.isDrawing) {
        commitSession({
          isDrawing: true,
          points: [snapped.x, snapped.y],
          bulges: [],
          currentPoint: snapped,
          previewBulge: null,
        })
        return
      }

      const lastX = prev.points[prev.points.length - 2]
      const lastY = prev.points[prev.points.length - 1]
      let committedBulge = 0
      if (isDrag) {
        const chord = Math.hypot(snapped.x - lastX, snapped.y - lastY)
        const raw = signedPerpOffset(
          lastX,
          lastY,
          snapped.x,
          snapped.y,
          endpoint.x,
          endpoint.y,
        )
        committedBulge = clampBulge(raw, chord)
      }
      commitSession({
        ...prev,
        points: [...prev.points, snapped.x, snapped.y],
        bulges: [...prev.bulges, committedBulge],
        currentPoint: snapped,
        previewBulge: null,
      })
    },
    [activeTool, snapPoint, commitSession, flushSession],
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall' || !sessionRef.current.isDrawing) return
    const { points, bulges } = sessionRef.current
    if (points.length >= 4) {
      const expectedBulges = points.length / 2 - 1
      // In dev builds, surface any mismatch so accounting bugs don't
      // silently get papered over by the normalization below.
      if (
        import.meta.env?.DEV &&
        bulges.length !== expectedBulges &&
        typeof console !== 'undefined'
      ) {
        console.warn('useWallDrawing: bulges/points length mismatch at commit', {
          pointsLen: points.length,
          expectedBulges,
          bulges,
        })
      }
      // Defensive normalize: pad or trim so length matches exactly,
      // filtering any NaN that could have leaked through arithmetic.
      const normalizedBulges: number[] = []
      for (let i = 0; i < expectedBulges; i++) {
        const b = bulges[i]
        normalizedBulges.push(Number.isFinite(b) ? b : 0)
      }
      const wall: WallElement = {
        id: nanoid(),
        type: 'wall',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: 'Wall',
        visible: true,
        style: { fill: '#1F2937', stroke: '#111827', strokeWidth: 6, opacity: 1 },
        points,
        bulges: normalizedBulges,
        thickness: 6,
        connectedWallIds: [],
      }
      addElement(wall)
    }
    resetSession()
  }, [activeTool, addElement, getMaxZIndex, resetSession])

  return {
    wallDrawingState: state,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasDoubleClick,
    cancelDrawing: resetSession,
    resetSession,
  }
}
