import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid } from '../lib/geometry'
import { signedPerpOffset, clampBulge } from '../lib/wallEditing'

/** Min pointer travel (canvas units) before a press counts as a drag. */
const DRAG_THRESHOLD_PX = 4

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
   * together and `stateRef.current` would be stale).
   */
  const [state, setState] = useState<WallDrawingState>(INITIAL_STATE)
  const sessionRef = useRef<WallDrawingState>(INITIAL_STATE)

  const setSession = useCallback((next: WallDrawingState) => {
    sessionRef.current = next
    setState(next)
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
        setSession({ ...prev, currentPoint: snapped })
        return
      }
      // Compute live preview bulge if pressing and we have a prior vertex.
      if (pressRef.current && prev.points.length >= 2) {
        const lastX = prev.points[prev.points.length - 2]
        const lastY = prev.points[prev.points.length - 1]
        const dx = canvasX - pressRef.current.x
        const dy = canvasY - pressRef.current.y
        const travel2 = dx * dx + dy * dy
        if (travel2 >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
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
          setSession({
            ...prev,
            currentPoint: snapped,
            previewBulge: clampBulge(raw, chord),
          })
          return
        }
      }
      setSession({ ...prev, currentPoint: snapped, previewBulge: null })
    },
    [activeTool, snapPoint, setSession],
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
      const isDrag = dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX

      const prev = sessionRef.current
      if (!prev.isDrawing) {
        setSession({
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
      setSession({
        ...prev,
        points: [...prev.points, snapped.x, snapped.y],
        bulges: [...prev.bulges, committedBulge],
        currentPoint: snapped,
        previewBulge: null,
      })
    },
    [activeTool, snapPoint, setSession],
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall' || !sessionRef.current.isDrawing) return
    const { points, bulges } = sessionRef.current
    if (points.length >= 4) {
      const expectedBulges = points.length / 2 - 1
      // Defensive normalize: pad or trim so length matches exactly.
      const normalizedBulges: number[] = []
      for (let i = 0; i < expectedBulges; i++) {
        normalizedBulges.push(bulges[i] ?? 0)
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
    setSession(INITIAL_STATE)
    pressRef.current = null
    dragEndpointRef.current = null
  }, [activeTool, addElement, getMaxZIndex, setSession])

  const cancelDrawing = useCallback(() => {
    setSession(INITIAL_STATE)
    pressRef.current = null
    dragEndpointRef.current = null
  }, [setSession])

  return {
    wallDrawingState: state,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasDoubleClick,
    cancelDrawing,
  }
}
