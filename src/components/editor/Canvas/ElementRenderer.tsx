import { Layer, Group } from 'react-konva'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useLayerVisibilityStore } from '../../../stores/layerVisibilityStore'
import { useCanvasFinderStore } from '../../../stores/canvasFinderStore'
import { categoryForElement } from '../../../lib/layerCategory'
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
  isSofaElement,
  isPlantElement,
  isPrinterElement,
  isWhiteboardElement,
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
import { SofaRenderer } from './SofaRenderer'
import { PlantRenderer } from './PlantRenderer'
import { PrinterRenderer } from './PrinterRenderer'
import { WhiteboardRenderer } from './WhiteboardRenderer'
import { useCallback, useState, type ReactNode } from 'react'
import type Konva from 'konva'
import { snapToGrid, getSnappedPosition } from '../../../lib/geometry'
import { elementBounds } from '../../../lib/elementBounds'
import { ALIGNMENT_THRESHOLD } from '../../../lib/constants'
import { isBookableRoom } from '../../../lib/roomBookings'
import { useRoomBookingDialogStore } from '../../../lib/roomBookingDialogStore'
import { useElementSpawnAnimation } from '../../../hooks/useElementSpawnAnimation'

export function ElementRenderer() {
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const {
    setSelectedIds,
    toggleSelection,
    setContextMenu,
    setHoveredId,
    setDragAlignmentGuides,
    clearDragAlignmentGuides,
  } = useUIStore(
    useShallow((s) => ({
      setSelectedIds: s.setSelectedIds,
      toggleSelection: s.toggleSelection,
      setContextMenu: s.setContextMenu,
      setHoveredId: s.setHoveredId,
      setDragAlignmentGuides: s.setDragAlignmentGuides,
      clearDragAlignmentGuides: s.clearDragAlignmentGuides,
    })),
  )
  const activeTool = useCanvasStore((s) => s.activeTool)
  const gridSize = useCanvasStore((s) => s.settings.gridSize)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  // Category-level visibility: if a category is hidden, EVERY element
  // mapped to it is filtered out before the render pass. Combines with
  // the existing per-element `visible` flag via AND — either "off" wins,
  // so there's no way for a hidden category to leak an element through.
  const categoryVisible = useLayerVisibilityStore((s) => s.visible)
  // Canvas finder integration: when the user opens Cmd+F and types a
  // query, we dim every element that isn't a match so the floor plan
  // visually narrows in on the result set. Implemented in the renderer
  // (rather than as a Konva overlay layer painting rectangles over each
  // non-match) because we already wrap every element in a Group whose
  // opacity is a free knob — adding ~3 lines here is cheaper than a
  // parallel "dim layer" that would need to mirror the same z-order +
  // points-vs-rect logic. The active match keeps full opacity to draw
  // the eye to the focus target.
  const finderMatches = useCanvasFinderStore((s) => s.matches)
  const finderMatchIds = finderMatches.length > 0
    ? new Set(finderMatches.map((m) => m.anchorId))
    : null

  const sorted = Object.values(elements)
    .filter((el) => el.visible)
    .filter((el) => categoryVisible[categoryForElement(el)])
    .sort((a, b) => a.zIndex - b.zIndex)

  // Snapshot the initial element ids once. The spawn-animation hook uses
  // this list to seed its "already animated" set so that on cold load
  // (project open, page refresh) every existing element renders at full
  // opacity from frame one — only newly added ids animate. `useState`
  // with a lazy initializer captures the snapshot exactly once and
  // never updates afterwards, which is what we want.
  const [initialIds] = useState(() => Object.keys(elements))

  // Snap the dragged element (center-origin) to alignment guides formed by
  // the edges and centers of OTHER elements on the floor. Walls, doors,
  // windows, and points-based primitives (lines/arrows) are skipped as
  // reference rects because their bounds are either handled by a separate
  // overlay (walls) or their positions are derived rather than owned.
  // Shift bypasses snap so users can place elements pixel-precise when
  // the alignment heuristics are in the way.
  const handleDragMove = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const el = elements[id]
      if (!el) return
      // Elements that own their own position (walls, lines, arrows) are
      // not center-origin, so the snap math below doesn't apply. They also
      // opt out via isAttached (doors/windows aren't draggable at all).
      if (
        isWallElement(el) ||
        isDoorElement(el) ||
        isWindowElement(el) ||
        isLineShapeElement(el) ||
        isArrowElement(el)
      ) {
        return
      }
      if (e.evt && (e.evt as DragEvent).shiftKey) {
        // Escape-hatch: Shift held → no snap, no guides.
        clearDragAlignmentGuides()
        return
      }
      const w = el.width ?? 0
      const h = el.height ?? 0
      if (w <= 0 || h <= 0) return

      // Konva Group's x/y is the element's center (matches ElementRenderer's
      // render offset). Convert to top-left for the snap helper, then back.
      const centerX = e.target.x()
      const centerY = e.target.y()
      const topLeft = { x: centerX - w / 2, y: centerY - h / 2 }

      // Other elements to snap against — every visible element that is not
      // the one being dragged, not a wall, and not attached.
      const others = []
      for (const other of Object.values(elements)) {
        if (other.id === id) continue
        if (!other.visible) continue
        if (
          isWallElement(other) ||
          isDoorElement(other) ||
          isWindowElement(other)
        ) {
          continue
        }
        const b = elementBounds(other)
        if (b) others.push(b)
      }

      const { snapped, guides } = getSnappedPosition(
        topLeft,
        others,
        { width: w, height: h },
        ALIGNMENT_THRESHOLD,
      )
      if (snapped.x !== topLeft.x) e.target.x(snapped.x + w / 2)
      if (snapped.y !== topLeft.y) e.target.y(snapped.y + h / 2)
      setDragAlignmentGuides(guides)
    },
    [elements, setDragAlignmentGuides, clearDragAlignmentGuides],
  )

  const handleDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      let x = e.target.x()
      let y = e.target.y()
      if (showGrid) {
        x = snapToGrid(x, gridSize)
        y = snapToGrid(y, gridSize)
      }
      updateElement(id, { x, y })
      clearDragAlignmentGuides()
    },
    [updateElement, gridSize, showGrid, clearDragAlignmentGuides]
  )

  const handleClick = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true
      if (activeTool === 'book') {
        const el = useElementsStore.getState().elements[id]
        if (el && isBookableRoom(el)) {
          useRoomBookingDialogStore.getState().open(id)
        }
        return
      }
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

  // Hover tracking — meaningful for select + pan (the two non-creating
  // tools). Other tools (wall, door, window, primitives) each have their
  // own preview affordance and would be noisier with an extra outline.
  // The pan tool reads `hoveredId` so the Wave 10B hover card surfaces
  // element details without disengaging pan.
  const handleMouseEnter = useCallback(
    (id: string) => {
      if (activeTool !== 'select' && activeTool !== 'pan') return
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
        // Finder dim: when matches are active and this element isn't one
        // of them, drop opacity to 0.25. The active match stays at 1; all
        // other matches stay at 1 too so the user can spot the cluster.
        // When `finderMatchIds` is null (finder closed or empty query)
        // the opacity falls through to undefined and Konva uses the
        // default (1), so nothing changes for the common case.
        const finderOpacity = finderMatchIds
          ? finderMatchIds.has(el.id)
            ? 1
            : 0.25
          : undefined

        const child: ReactNode = (() => {
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
          // Furniture catalog — see SofaRenderer et al. Each has a
          // distinct silhouette, so they can't share FurnitureRenderer
          // (which is a generic rounded rect fallback).
          if (isSofaElement(el))
            return <SofaRenderer element={el} />
          if (isPlantElement(el))
            return <PlantRenderer element={el} />
          if (isPrinterElement(el))
            return <PrinterRenderer element={el} />
          if (isWhiteboardElement(el))
            return <WhiteboardRenderer element={el} />
          return <FurnitureRenderer element={el} />
        })()

        return (
          <AnimatedElementGroup
            key={el.id}
            id={el.id}
            initialIds={initialIds}
            x={ownsPosition ? 0 : el.x}
            y={ownsPosition ? 0 : el.y}
            // For points-primitives / walls / attached elements the Group
            // sits at (0, 0) — scaling there would scale the whole
            // floor's coordinate space, so we suppress the scale animation
            // and only fade those in. For center-origin elements the
            // Group's position IS the element center, so scaling around
            // it is correct without any offset trick.
            applyScale={!ownsPosition}
            finderOpacity={finderOpacity}
            draggable={groupDraggable}
            onDragMove={(e) => handleDragMove(el.id, e)}
            onDragEnd={(e) => handleDragEnd(el.id, e)}
            onClick={(e) => handleClick(el.id, e)}
            onTap={(e) => handleClick(el.id, e)}
            onContextMenu={(e) => handleContextMenu(el.id, e)}
            onMouseEnter={() => handleMouseEnter(el.id)}
            onMouseLeave={() => handleMouseLeave(el.id)}
          >
            {child}
          </AnimatedElementGroup>
        )
      })}
    </Layer>
  )
}

interface AnimatedElementGroupProps {
  id: string
  initialIds: string[]
  x: number
  y: number
  applyScale: boolean
  finderOpacity: number | undefined
  draggable: boolean
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onTap: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  children: ReactNode
}

/**
 * Per-element wrapper that runs the spawn animation hook. Lifted into
 * its own component because hooks can't be called inside the `.map`
 * iteration in `ElementRenderer`. The component is intentionally
 * pass-through — it only adds the {opacity, scale} multiply on top of
 * the existing Group props so that nothing else changes about the
 * render tree.
 */
function AnimatedElementGroup({
  id,
  initialIds,
  x,
  y,
  applyScale,
  finderOpacity,
  draggable,
  onDragMove,
  onDragEnd,
  onClick,
  onTap,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  children,
}: AnimatedElementGroupProps) {
  const spawn = useElementSpawnAnimation(id, { initialIds })
  // Combine the spawn-fade with the finder dim. When the finder is
  // active and this element isn't a match, the finder opacity (0.25)
  // wins for the steady state; while the spawn animation is in flight
  // we multiply so it still ramps up but to the dimmed level rather
  // than full.
  const baseOpacity = finderOpacity ?? 1
  const combinedOpacity = baseOpacity * spawn.opacity
  const scaleX = applyScale ? spawn.scaleX : 1
  const scaleY = applyScale ? spawn.scaleY : 1
  return (
    <Group
      id={`element-${id}`}
      x={x}
      y={y}
      opacity={combinedOpacity}
      scaleX={scaleX}
      scaleY={scaleY}
      draggable={draggable}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTap={onTap}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </Group>
  )
}
