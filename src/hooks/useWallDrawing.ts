import { useState, useCallback, useRef, useEffect } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid } from '../lib/geometry'
import { signedPerpOffset, clampBulge } from '../lib/wallEditing'
import { findNearestWallVertex } from '../lib/wallAttachment'
import { lockToCardinal, ENDPOINT_SNAP_PX } from '../lib/wallSnap'

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

  /**
   * Resolve a raw canvas-coord pointer into a snapped vertex coordinate.
   *
   * Snap precedence (first hit wins; later steps see the previously
   * snapped value):
   *   1. Cardinal lock — if Shift is held AND there is a previous vertex
   *      to anchor to (`shiftLock`), project the point onto the nearest
   *      0°/45°/90°/135° ray from that anchor. This runs first so the
   *      committed segment is exactly axis-aligned regardless of grid.
   *   2. Endpoint snap — search every other wall's vertices for one
   *      within `ENDPOINT_SNAP_PX / stageScale` canvas units. If found,
   *      return that vertex exactly so the new wall and the existing
   *      one share an endpoint. Excludes vertices that already exist on
   *      the in-progress wall (the indices in the current session) so
   *      the live preview can't snap to its own previous click.
   *   3. Grid snap — fall through to the existing grid-snap behaviour
   *      when grid is on.
   */
  const snapPoint = useCallback(
    (
      x: number,
      y: number,
      opts: {
        shiftLock?: { ax: number; ay: number } | null
        excludeOwnSessionVertices?: boolean
      } = {},
    ) => {
      let cx = x
      let cy = y

      if (opts.shiftLock) {
        const locked = lockToCardinal(opts.shiftLock.ax, opts.shiftLock.ay, cx, cy)
        cx = locked.x
        cy = locked.y
      }

      // Endpoint snap — runs against the live elements map so it stays
      // current with every commit. Stage scale converts the screen-pixel
      // radius to canvas units; at 1× they're equal.
      const stageScale = useCanvasStore.getState().stageScale || 1
      const radius = ENDPOINT_SNAP_PX / stageScale
      const elements = useElementsStore.getState().elements
      // Skip in-session vertices: while drawing, the elements map doesn't
      // yet contain the in-progress wall (it's only added on dblclick), so
      // there's nothing to exclude. The flag is reserved for future use
      // (e.g. dragging a vertex of an already-placed wall).
      void opts.excludeOwnSessionVertices
      const hit = findNearestWallVertex(elements, cx, cy, radius)
      if (hit) {
        return { x: hit.x, y: hit.y }
      }

      if (showGrid) {
        return { x: snapToGrid(cx, gridSize), y: snapToGrid(cy, gridSize) }
      }
      return { x: cx, y: cy }
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

  /** Anchor for cardinal (Shift) lock: the last committed vertex while
   *  drawing, or null if there is no prior vertex (the very first click). */
  const cardinalAnchor = useCallback((): { ax: number; ay: number } | null => {
    const prev = sessionRef.current
    if (!prev.isDrawing || prev.points.length < 2) return null
    return {
      ax: prev.points[prev.points.length - 2],
      ay: prev.points[prev.points.length - 1],
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
    (canvasX: number, canvasY: number, shiftKey = false) => {
      if (activeTool !== 'wall') return
      // Track live drag endpoint whenever a press is active.
      if (pressRef.current) {
        dragEndpointRef.current = { x: canvasX, y: canvasY }
      }
      // Shift-held during the rubber-band phase locks the preview to a
      // cardinal/diagonal direction so the user sees what they will commit.
      const lockAnchor = shiftKey ? cardinalAnchor() : null
      const snapped = snapPoint(canvasX, canvasY, { shiftLock: lockAnchor })
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
          const pressSnap = snapPoint(pressRef.current.x, pressRef.current.y, {
            shiftLock: lockAnchor,
          })
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
    [activeTool, snapPoint, scheduleSession, cardinalAnchor],
  )

  /**
   * Internal: finalise the in-flight wall and reset the session. Shared
   * between the explicit double-click finaliser and the auto-close path
   * (Fix 3 — clicking near the starting vertex commits the close vertex
   * and immediately finalises). Reads from `sessionRef` rather than
   * the React-state mirror so it can be called from inside the same
   * event-loop tick as a `commitSession` (the ref is updated
   * synchronously; the React-state mirror catches up asynchronously).
   */
  const finaliseDrawing = useCallback(() => {
    if (!sessionRef.current.isDrawing) return
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
      // Read the current preset at commit time (not at draw-session start)
      // so users can flip the preset mid-drawing and the committed wall
      // uses whatever is selected right now.
      const wallDrawStyle = useCanvasStore.getState().wallDrawStyle
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
        wallType: 'solid',
        ...(wallDrawStyle && wallDrawStyle !== 'solid' ? { dashStyle: wallDrawStyle } : {}),
      }
      addElement(wall)
    }
    resetSession()
  }, [addElement, getMaxZIndex, resetSession])

  const handleCanvasMouseUp = useCallback(
    (canvasX: number, canvasY: number, shiftKey = false) => {
      if (activeTool !== 'wall' || !pressRef.current) return
      const press = pressRef.current
      // Prefer the last mousemove position (a drag may end back at press
      // coords after the user pulls and releases). Fall back to release
      // coords if mousemove never fired.
      const endpoint = dragEndpointRef.current ?? { x: canvasX, y: canvasY }
      pressRef.current = null
      dragEndpointRef.current = null
      // Shift-held at commit projects the candidate vertex onto the
      // nearest 0°/45°/90°/135° ray from the previous committed vertex
      // before any other snap step runs.
      const lockAnchor = shiftKey ? cardinalAnchor() : null
      const snapped = snapPoint(press.x, press.y, { shiftLock: lockAnchor })
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

      // Auto-close: if the candidate vertex (after all the normal snap
      // steps above) is within `ENDPOINT_SNAP_PX / stageScale` canvas
      // units of the FIRST committed vertex of the polyline, AND we
      // already have at least three vertices (so closing makes a real
      // closed shape, not a degenerate two-segment line), commit the
      // closing vertex AT EXACTLY the start coords and auto-finalise
      // the wall. The `closeSnapTarget` shortcut here over-rides the
      // pre-snap `snapped` value so that small numerical drift in the
      // existing snap pipeline can't leave a 1px gap at the closure.
      //
      // We require `prev.points.length >= 6` (3+ committed vertices, i.e.
      // at least three corners of a polygon) to avoid auto-closing back
      // onto the start before the user has drawn enough segments for a
      // closed shape to make geometric sense. With exactly 2 committed
      // vertices (`points.length === 4`), closing would commit a wall
      // that walks out and immediately walks back — degenerate.
      let closeX: number | null = null
      let closeY: number | null = null
      if (prev.points.length >= 6) {
        const firstX = prev.points[0]
        const firstY = prev.points[1]
        const stageScale = useCanvasStore.getState().stageScale || 1
        const closeRadius = ENDPOINT_SNAP_PX / stageScale
        const dCloseX = snapped.x - firstX
        const dCloseY = snapped.y - firstY
        if (dCloseX * dCloseX + dCloseY * dCloseY <= closeRadius * closeRadius) {
          closeX = firstX
          closeY = firstY
        }
      }

      let committedBulge = 0
      const finalX = closeX !== null ? closeX : snapped.x
      const finalY = closeY !== null ? closeY : snapped.y
      if (isDrag) {
        const chord = Math.hypot(finalX - lastX, finalY - lastY)
        const raw = signedPerpOffset(
          lastX,
          lastY,
          finalX,
          finalY,
          endpoint.x,
          endpoint.y,
        )
        committedBulge = clampBulge(raw, chord)
      }
      commitSession({
        ...prev,
        points: [...prev.points, finalX, finalY],
        bulges: [...prev.bulges, committedBulge],
        currentPoint: { x: finalX, y: finalY },
        previewBulge: null,
      })

      // After commit: if this click closed the polyline, immediately
      // finalise the wall and reset — no double-click required. We
      // schedule the finalise via a microtask (Promise.resolve().then)
      // rather than calling `handleCanvasDoubleClick` synchronously so
      // any setState that just batched in `commitSession` flushes
      // first; the finalise reads `sessionRef.current` directly so
      // it sees the just-appended closing vertex regardless.
      if (closeX !== null && closeY !== null) {
        finaliseDrawing()
      }
    },
    [activeTool, snapPoint, commitSession, flushSession, cardinalAnchor, finaliseDrawing],
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall') return
    finaliseDrawing()
  }, [activeTool, finaliseDrawing])

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
