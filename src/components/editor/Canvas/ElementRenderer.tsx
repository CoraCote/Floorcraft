import { Layer, Group } from 'react-konva'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { isTableElement } from '../../../types/elements'
import { TableRenderer } from './TableRenderer'
import { FurnitureRenderer } from './FurnitureRenderer'
import { useCallback } from 'react'
import type Konva from 'konva'
import { snapToGrid } from '../../../lib/geometry'

export function ElementRenderer() {
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const { setSelectedIds, toggleSelection, setContextMenu } = useUIStore()
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

  return (
    <Layer>
      {sorted.map((el) => {
        const draggable = activeTool === 'select' && !el.locked

        return (
          <Group
            key={el.id}
            draggable={draggable}
            onDragEnd={(e) => handleDragEnd(el.id, e)}
            onClick={(e) => handleClick(el.id, e)}
            onTap={(e) => handleClick(el.id, e)}
            onContextMenu={(e) => handleContextMenu(el.id, e)}
          >
            {isTableElement(el) ? (
              <TableRenderer element={el} />
            ) : (
              <FurnitureRenderer element={el} />
            )}
          </Group>
        )
      })}
    </Layer>
  )
}
