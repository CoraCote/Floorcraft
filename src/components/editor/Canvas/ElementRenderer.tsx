import { Layer, Group } from 'react-konva'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import {
  isTableElement,
  isWallElement,
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isConferenceRoomElement,
  isCommonAreaElement,
  isDecorElement,
  isDoorElement,
  isWindowElement,
  isRectShapeElement,
  isEllipseElement,
  isLineShapeElement,
  isArrowElement,
  isFreeTextElement,
  isCustomSvgElement,
  type ConferenceRoomElement,
  type PhoneBoothElement,
  type CommonAreaElement,
} from '../../../types/elements'
import { getShapeRenderer } from './shapes'
import { TableRenderer } from './TableRenderer'
import { FurnitureRenderer } from './FurnitureRenderer'
import { WallRenderer } from './WallRenderer'
import { DoorRenderer } from './DoorRenderer'
import { WindowRenderer } from './WindowRenderer'
import { DeskRenderer } from './DeskRenderer'
import { RoomRenderer } from './RoomRenderer'
import { RectShapeRenderer } from './primitives/RectShapeRenderer'
import { EllipseRenderer } from './primitives/EllipseRenderer'
import { LineShapeRenderer } from './primitives/LineShapeRenderer'
import { ArrowRenderer } from './primitives/ArrowRenderer'
import { FreeTextRenderer } from './primitives/FreeTextRenderer'
import { CustomSvgRenderer } from './primitives/CustomSvgRenderer'
import { useCallback } from 'react'
import type Konva from 'konva'
import { snapToGrid } from '../../../lib/geometry'

export function ElementRenderer() {
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const { setSelectedIds, toggleSelection, setContextMenu, setHoveredId } = useUIStore(useShallow((s) => ({ setSelectedIds: s.setSelectedIds, toggleSelection: s.toggleSelection, setContextMenu: s.setContextMenu, setHoveredId: s.setHoveredId })))
  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)

  const sorted = Object.values(elements)
    .filter((el) => el.visible)
    .sort((a, b) => a.zIndex - b.zIndex)

  const handleDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      let x = e.target.x()
      let y = e.target.y()
      if (showGrid) {
        x = snapToGrid(x, gridSize)
        y = snapToGrid(y, gridSize)
      }
      updateElement(id, { x, y })
    },
    [updateElement, gridSize, showGrid]
  )

  const handleClick = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true
      if (activeTool !== 'select') return
      if ('shiftKey' in e.evt && e.evt.shiftKey) {
        toggleSelection(id)
      } else {
        setSelectedIds([id])
      }
    },
    [activeTool, setSelectedIds, toggleSelection]
  )

  const handleContextMenu = useCallback(
    (id: string, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault()
      e.cancelBubble = true
      setSelectedIds([id])
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, elementId: id })
    },
    [setSelectedIds, setContextMenu]
  )

  // Hover tracking — only meaningful for the select tool, so we gate on
  // it here rather than in the overlay. Other tools (wall, door, window,
  // primitives) each have their own preview affordance and would be
  // noisier with an extra outline.
  const handleMouseEnter = useCallback(
    (id: string) => {
      if (activeTool !== 'select') return
      setHoveredId(id)
    },
    [activeTool, setHoveredId],
  )
  const handleMouseLeave = useCallback(
    (id: string) => {
      // Only clear if the leaving element is still the hovered one —
      // otherwise a fast pointer traversal that fires enter(B) before
      // leave(A) could stomp on B's hover state.
      const current = useUIStore.getState().hoveredId
      if (current === id) setHoveredId(null)
    },
    [setHoveredId],
  )

  return (
    <Layer>
      {sorted.map((el) => {
        const draggable = activeTool === 'select' && !el.locked

        // Walls position themselves via `points`, not via x/y. Doors and
        // windows resolve their own world position from the parent wall's
        // geometry (see Door/WindowRenderer), so the wrapping Group must
        // not re-offset them either — we anchor those at (0, 0) too.
        const isWall = isWallElement(el)
        const isAttached = isDoorElement(el) || isWindowElement(el)
        // Lines and arrows also position themselves via `points` in world
        // space, so their wrapping Group sits at (0, 0) like walls.
        const isPointsPrimitive = isLineShapeElement(el) || isArrowElement(el)
        const ownsPosition = isWall || isAttached || isPointsPrimitive
        // Doors/windows derive their position from the parent wall; dragging
        // the element directly would desync `positionOnWall` from the real
        // coords, so we disable drag on attached elements. Repositioning is
        // done in the properties panel (positionOnWall slider).
        const groupDraggable = draggable && !isAttached
        return (
          <Group
            key={el.id}
            id={`element-${el.id}`}
            x={ownsPosition ? 0 : el.x}
            y={ownsPosition ? 0 : el.y}
            draggable={groupDraggable}
            onDragEnd={(e) => handleDragEnd(el.id, e)}
            onClick={(e) => handleClick(el.id, e)}
            onTap={(e) => handleClick(el.id, e)}
            onContextMenu={(e) => handleContextMenu(el.id, e)}
            onMouseEnter={() => handleMouseEnter(el.id)}
            onMouseLeave={() => handleMouseLeave(el.id)}
          >
            {(() => {
              const VariantRenderer = getShapeRenderer(el)
              if (VariantRenderer) return <VariantRenderer element={el} />

              if (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el))
                return <DeskRenderer element={el} />
              if (isConferenceRoomElement(el) || isCommonAreaElement(el) || el.type === 'phone-booth')
                return <RoomRenderer element={el as ConferenceRoomElement | PhoneBoothElement | CommonAreaElement} />
              if (isTableElement(el))
                return <TableRenderer element={el} />
              if (isWallElement(el))
                return <WallRenderer element={el} />
              if (isDoorElement(el))
                return <DoorRenderer element={el} />
              if (isWindowElement(el))
                return <WindowRenderer element={el} />
              if (isRectShapeElement(el))
                return <RectShapeRenderer element={el} />
              if (isEllipseElement(el))
                return <EllipseRenderer element={el} />
              if (isLineShapeElement(el))
                return <LineShapeRenderer element={el} />
              if (isArrowElement(el))
                return <ArrowRenderer element={el} />
              if (isFreeTextElement(el))
                return <FreeTextRenderer element={el} />
              if (isCustomSvgElement(el))
                return <CustomSvgRenderer element={el} />
              if (isDecorElement(el))
                return <FurnitureRenderer element={el} />
              return <FurnitureRenderer element={el} />
            })()}
          </Group>
        )
      })}
    </Layer>
  )
}
