import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'
import { snapToGrid } from '../lib/geometry'

interface WallDrawingState {
  isDrawing: boolean
  points: number[]
  currentPoint: { x: number; y: number } | null
}

export function useWallDrawing() {
  const [state, setState] = useState<WallDrawingState>({
    isDrawing: false,
    points: [],
    currentPoint: null,
  })

  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stateRef = useRef(state)
  stateRef.current = state

  const snapPoint = useCallback(
    (x: number, y: number) => {
      if (showGrid) {
        return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) }
      }
      return { x, y }
    },
    [gridSize, showGrid]
  )

  const handleCanvasClick = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall') return

      const snapped = snapPoint(canvasX, canvasY)

      setState((prev) => {
        if (!prev.isDrawing) {
          return {
            isDrawing: true,
            points: [snapped.x, snapped.y],
            currentPoint: snapped,
          }
        } else {
          return {
            ...prev,
            points: [...prev.points, snapped.x, snapped.y],
          }
        }
      })
    },
    [activeTool, snapPoint]
  )

  const handleCanvasMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (activeTool !== 'wall' || !stateRef.current.isDrawing) return
      const snapped = snapPoint(canvasX, canvasY)
      setState((prev) => ({ ...prev, currentPoint: snapped }))
    },
    [activeTool, snapPoint]
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (activeTool !== 'wall' || !stateRef.current.isDrawing) return

    const { points } = stateRef.current
    if (points.length >= 4) {
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
        thickness: 6,
        connectedWallIds: [],
      }
      addElement(wall)
    }

    setState({ isDrawing: false, points: [], currentPoint: null })
  }, [activeTool, addElement, getMaxZIndex])

  const cancelDrawing = useCallback(() => {
    setState({ isDrawing: false, points: [], currentPoint: null })
  }, [])

  return {
    wallDrawingState: state,
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasDoubleClick,
    cancelDrawing,
  }
}
