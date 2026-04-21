import { Stage } from 'react-konva'
import { useRef, useCallback, useState, useEffect } from 'react'
import type Konva from 'konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useShallow } from 'zustand/react/shallow'
import { GridLayer } from './GridLayer'
import { ElementRenderer } from './ElementRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { WallDrawingOverlay } from './WallDrawingOverlay'
import { WallEditOverlay } from './WallEditOverlay'
import { AttachmentGhost } from './AttachmentGhost'
import { OrgChartOverlay } from '../../reports/OrgChartOverlay'
import { SeatMapColorMode } from '../../reports/SeatMapColorMode'
import { useWallDrawing } from '../../../hooks/useWallDrawing'
import { ZOOM_MIN, ZOOM_MAX } from '../../../lib/constants'
import { isAssignableElement } from '../../../types/elements'
import { assignEmployee } from '../../../lib/seatAssignment'
import { findNearestStraightWallHit } from '../../../lib/wallAttachment'
import { nanoid } from 'nanoid'
import type { DoorElement, WindowElement } from '../../../types/elements'
import { LIBRARY_DRAG_MIME, buildLibraryElement, type LibraryItem } from '../LeftSidebar/ElementLibrary'

/** Max canvas-unit distance a click can be from a wall to still snap to it. */
const DOOR_WINDOW_SNAP_PX = 24

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { stageX, stageY, stageScale, setStagePosition, setStageScale, activeTool } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, setStagePosition: s.setStagePosition, setStageScale: s.setStageScale, activeTool: s.activeTool })))
  const { clearSelection, setContextMenu } = useUIStore(useShallow((s) => ({ clearSelection: s.clearSelection, setContextMenu: s.setContextMenu })))
  const orgChartOverlayEnabled = useUIStore((s) => s.orgChartOverlayEnabled)
  const seatMapColorMode = useUIStore((s) => s.seatMapColorMode)
  const {
    wallDrawingState,
    handleCanvasMouseDown: onWallMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp: onWallMouseUp,
    handleCanvasDoubleClick,
  } = useWallDrawing()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stageScale
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const scaleBy = 1.08
      const newScale = e.evt.deltaY < 0
        ? Math.min(ZOOM_MAX, oldScale * scaleBy)
        : Math.max(ZOOM_MIN, oldScale / scaleBy)

      const mousePointTo = {
        x: (pointer.x - stageX) / oldScale,
        y: (pointer.y - stageY) / oldScale,
      }

      setStageScale(newScale)
      setStagePosition(
        pointer.x - mousePointTo.x * newScale,
        pointer.y - mousePointTo.y * newScale
      )
    },
    [stageScale, stageX, stageY, setStageScale, setStagePosition]
  )

  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  // Cursor position in canvas-space coords, tracked for the door/window
  // ghost preview. Null when the cursor has left the canvas so the ghost
  // disappears cleanly (no stale phantom between sessions on the same tool).
  const [ghostCursor, setGhostCursor] = useState<{ x: number; y: number } | null>(null)
  // Mirrored hit state from <AttachmentGhost> so we can set the DOM cursor
  // to `not-allowed` when hovering off any wall without running the
  // expensive elements-walk in two places.
  const [ghostHasHit, setGhostHasHit] = useState(false)

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 2) {
        e.evt.preventDefault()
        setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, elementId: null })
        return
      }

      if (e.evt.button === 1 || activeTool === 'pan') {
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        return
      }

      if (activeTool === 'wall' && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        onWallMouseDown(canvasX, canvasY)
        return
      }

      if ((activeTool === 'door' || activeTool === 'window') && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        // Snap to the nearest straight wall segment. If no wall is close,
        // ignore the click — don't silently create an orphaned element.
        const elementsStore = useElementsStore.getState()
        const hit = findNearestStraightWallHit(
          elementsStore.elements,
          canvasX,
          canvasY,
          // Snap distance is measured in canvas units. Scale it by the
          // inverse of the current zoom so a click feels like ~24 screen
          // pixels regardless of how far the user has zoomed in/out.
          DOOR_WINDOW_SNAP_PX / stageScale,
        )
        if (!hit) return
        const nextZ = elementsStore.getMaxZIndex() + 1
        if (activeTool === 'door') {
          const door: DoorElement = {
            id: nanoid(),
            type: 'door',
            x: hit.point.x,
            y: hit.point.y,
            width: 36,
            height: Math.max(6, hit.wall.thickness),
            rotation: 0,
            locked: false,
            groupId: null,
            zIndex: nextZ,
            label: 'Door',
            visible: true,
            style: {
              fill: '#ffffff',
              stroke: '#111827',
              strokeWidth: 1,
              opacity: 1,
            },
            parentWallId: hit.wall.id,
            positionOnWall: hit.positionOnWall,
            swingDirection: 'left',
            openAngle: 90,
          }
          elementsStore.addElement(door)
          useUIStore.getState().setSelectedIds([door.id])
        } else {
          const win: WindowElement = {
            id: nanoid(),
            type: 'window',
            x: hit.point.x,
            y: hit.point.y,
            width: 48,
            height: Math.max(4, hit.wall.thickness),
            rotation: 0,
            locked: false,
            groupId: null,
            zIndex: nextZ,
            label: 'Window',
            visible: true,
            style: {
              fill: '#DBEAFE',
              stroke: '#1E3A8A',
              strokeWidth: 1,
              opacity: 1,
            },
            parentWallId: hit.wall.id,
            positionOnWall: hit.positionOnWall,
          }
          elementsStore.addElement(win)
          useUIStore.getState().setSelectedIds([win.id])
        }
        // Return to select tool after placement so the user isn't stuck
        // placing doors/windows on every subsequent click.
        useCanvasStore.getState().setActiveTool('select')
        return
      }

      if (e.target === e.target.getStage()) {
        clearSelection()
        setContextMenu(null)
      }
    },
    [activeTool, clearSelection, setContextMenu, stageX, stageY, stageScale, onWallMouseDown]
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        const dx = e.evt.clientX - lastPointer.current.x
        const dy = e.evt.clientY - lastPointer.current.y
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        setStagePosition(stageX + dx, stageY + dy)
      }

      if (activeTool === 'wall') {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        handleCanvasMouseMove(canvasX, canvasY)
      }

      // Track cursor for the door/window ghost preview. Only work out the
      // canvas coords when the ghost is actually active so we don't pay the
      // cost on every mousemove in select/pan mode.
      if (activeTool === 'door' || activeTool === 'window') {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        setGhostCursor({
          x: (pointer.x - stageX) / stageScale,
          y: (pointer.y - stageY) / stageScale,
        })
      } else if (ghostCursor) {
        setGhostCursor(null)
      }
    },
    [stageX, stageY, stageScale, activeTool, setStagePosition, handleCanvasMouseMove, ghostCursor]
  )

  // Clear the ghost when the cursor leaves the canvas so it doesn't linger.
  const handleMouseLeave = useCallback(() => {
    if (ghostCursor) setGhostCursor(null)
  }, [ghostCursor])

  // Clear the ghost when the tool switches away from door/window. Keeps
  // state in sync without waiting for the next mousemove.
  useEffect(() => {
    if (activeTool !== 'door' && activeTool !== 'window' && ghostCursor) {
      setGhostCursor(null)
    }
  }, [activeTool, ghostCursor])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    if (activeTool === 'wall') {
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const canvasX = (pointer.x - stageX) / stageScale
      const canvasY = (pointer.y - stageY) / stageScale
      onWallMouseUp(canvasX, canvasY)
    }
  }, [activeTool, stageX, stageY, stageScale, onWallMouseUp])

  // Base cursor per tool. For door/window we additionally flip to
  // `not-allowed` when the cursor is NOT over a wall in snap range — so the
  // user learns where they can click without silent no-ops. AttachmentGhost
  // owns the reactive hit test and pushes the result up via `onHitChange`;
  // this avoids duplicating the elements-map walk here on every render.
  let cursor: string = activeTool === 'pan' ? 'grab' : activeTool === 'wall' ? 'crosshair' : 'default'
  if ((activeTool === 'door' || activeTool === 'window') && ghostCursor) {
    cursor = ghostHasHit ? 'crosshair' : 'not-allowed'
  }

  // Accept employee drags from PeoplePanel and assign the dropped employee
  // to whatever assignable element is under the cursor.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/employee-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      return
    }
    if (e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
      e.preventDefault()
      // `copy` matches the effectAllowed we set on dragstart, and gives
      // the user a "+" cursor showing the drop is valid.
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return

    // Translate the drop's client coords into canvas (stage-local) coords
    // exactly like the wall-drawing handlers do — Konva tracks the stage
    // pointer but we still need to apply our stage transform.
    stage.setPointersPositions(e.nativeEvent)
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const pos = {
      x: (pointer.x - stageX) / stageScale,
      y: (pointer.y - stageY) / stageScale,
    }

    // Library drag: instantiate the element at the drop cursor.
    const libraryPayload = e.dataTransfer.getData(LIBRARY_DRAG_MIME)
    if (libraryPayload) {
      e.preventDefault()
      let item: LibraryItem
      try {
        item = JSON.parse(libraryPayload) as LibraryItem
      } catch {
        return
      }
      const elementsStore = useElementsStore.getState()
      const element = buildLibraryElement(item, pos.x, pos.y, elementsStore.getMaxZIndex() + 1)
      elementsStore.addElement(element)
      useUIStore.getState().setSelectedIds([element.id])
      return
    }

    // Employee-assignment drag: hit-test assignable elements.
    const empId = e.dataTransfer.getData('application/employee-id')
    if (!empId) return
    e.preventDefault()

    // (el.x, el.y) is CENTER; rotation ignored (acceptable simplification).
    // Skip locked and hidden elements — they can't accept a drop.
    const elements = useElementsStore.getState().elements
    let hitId: string | null = null
    let hitZ = -Infinity
    for (const el of Object.values(elements)) {
      if (!isAssignableElement(el)) continue
      if (el.locked) continue
      if (el.visible === false) continue
      const halfW = el.width / 2
      const halfH = el.height / 2
      if (
        pos.x >= el.x - halfW &&
        pos.x <= el.x + halfW &&
        pos.y >= el.y - halfH &&
        pos.y <= el.y + halfH
      ) {
        // Prefer topmost element on overlap. Use strict `>` so ties resolve
        // to the first iterated match (stable order).
        if (el.zIndex > hitZ) {
          hitZ = el.zIndex
          hitId = el.id
        }
      }
    }

    if (hitId) {
      assignEmployee(empId, hitId, useFloorStore.getState().activeFloorId)
    }
  }, [stageX, stageY, stageScale])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseLeave={handleMouseLeave}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={stageX}
        y={stageY}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleCanvasDoubleClick}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <GridLayer width={size.width} height={size.height} />
        <ElementRenderer />
        <SelectionOverlay />
        <WallEditOverlay />
        {orgChartOverlayEnabled && <OrgChartOverlay />}
        {seatMapColorMode && <SeatMapColorMode />}
        <AlignmentGuides guides={[]} />
        <WallDrawingOverlay {...wallDrawingState} />
        <AttachmentGhost
          tool={activeTool}
          cursor={ghostCursor}
          stageScale={stageScale}
          snapPx={DOOR_WINDOW_SNAP_PX}
          onHitChange={setGhostHasHit}
        />
      </Stage>
    </div>
  )
}
