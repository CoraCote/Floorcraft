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
import { HoverOutline } from './HoverOutline'
import { AlignmentGuides } from './AlignmentGuides'
import { WallDrawingOverlay } from './WallDrawingOverlay'
import { WallEditOverlay } from './WallEditOverlay'
import { AttachmentGhost } from './AttachmentGhost'
import { MarqueeOverlay } from './MarqueeOverlay'
import { DimensionLayer } from './DimensionLayer'
import { OrgChartOverlay } from '../../reports/OrgChartOverlay'
import { SeatMapColorMode } from '../../reports/SeatMapColorMode'
import { useWallDrawing } from '../../../hooks/useWallDrawing'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_WHEEL_SENSITIVITY } from '../../../lib/constants'
import { isAssignableElement } from '../../../types/elements'
import { elementsIntersectingRect } from '../../../lib/marquee'
import { useLayerVisibilityStore } from '../../../stores/layerVisibilityStore'
import { categoryForElement } from '../../../lib/layerCategory'
import { assignEmployee, swapEmployees } from '../../../lib/seatAssignment'
import { useSeatDragStore } from '../../../stores/seatDragStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { consumeQueueAtElement } from '../../../lib/multiSeatAssign'
import { useToastStore } from '../../../stores/toastStore'
import { findNearestStraightWallHit } from '../../../lib/wallAttachment'
import { nanoid } from 'nanoid'
import type { DoorElement, WindowElement, CanvasElement } from '../../../types/elements'
import { LIBRARY_DRAG_MIME, buildLibraryElement, type LibraryItem } from '../LeftSidebar/ElementLibrary'
import {
  buildRectShape,
  buildEllipse,
  buildLineShape,
  buildArrow,
  buildFreeText,
  isDragCommit,
} from '../../../lib/primitives/buildPrimitive'
import { ShapeDrawingOverlay, type ShapeDrawingPreview } from './primitives/ShapeDrawingOverlay'
import { FreeTextEditorOverlay } from './primitives/FreeTextEditorOverlay'
import { MeasureOverlay, type MeasureSession } from './MeasureOverlay'
import { CalibrateOverlay } from './CalibrateOverlay'
import { useCalibrateScaleStore } from '../../../stores/calibrateScaleStore'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { NeighborhoodEditOverlay } from './NeighborhoodEditOverlay'
import { NeighborhoodOverlay } from './NeighborhoodOverlay'
import { EquipmentOverlayLayer } from './EquipmentOverlayLayer'
import { useOverlaysStore } from '../../../stores/overlaysStore'
import { AnnotationLayer } from './AnnotationLayer'
import {
  AnnotationPopover,
  setLastPinAnchor,
} from './AnnotationPopover'
import { EmptyCanvasHint } from './EmptyCanvasHint'
import { useAnnotationsStore } from '../../../stores/annotationsStore'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { NEIGHBORHOOD_PALETTE } from '../../../types/neighborhood'
import { useRecentLibraryItems } from '../../../hooks/useRecentLibraryItems'
import { setActiveStage } from '../../../lib/stageRegistry'
import { useCursorStore } from '../../../stores/cursorStore'
import { useCan } from '../../../hooks/useCan'

const PRIMITIVE_TOOLS = new Set(['rect-shape', 'ellipse', 'line-shape', 'arrow', 'free-text'])

/** Max canvas-unit distance a click can be from a wall to still snap to it. */
const DOOR_WINDOW_SNAP_PX = 24

/**
 * Distance (in CSS pixels) the cursor must travel during a select-tool
 * press on empty canvas before we commit to "this is a pan" instead of
 * "this is a click that should deselect." Matches the typical browser
 * click-vs-drag tolerance so a slightly shaky click still deselects.
 */
const PAN_CLICK_THRESHOLD_PX = 4

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { stageX, stageY, stageScale, setStagePosition, activeTool } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, setStagePosition: s.setStagePosition, activeTool: s.activeTool })))
  const { clearSelection, setContextMenu } = useUIStore(useShallow((s) => ({ clearSelection: s.clearSelection, setContextMenu: s.setContextMenu })))
  const canEdit = useCan('editMap')
  // Annotations are explicitly `editMap || editRoster` — HR editors should
  // be able to leave notes on the map even though they can't move elements.
  // Read both permissions unconditionally so the hook call order is stable
  // (`useCan('a') || useCan('b')` would short-circuit the second call).
  const canEditRosterForAnnotations = useCan('editRoster')
  const canAnnotate = canEdit || canEditRosterForAnnotations
  // Marquee (drag-rectangle) selection — only active when the select tool is
  // active, the user presses on empty stage space, and they start dragging.
  // `marqueeStartRef` holds the canvas-space anchor + whether shift was held
  // at press; `marquee` is the live rect that drives the overlay render.
  const marqueeStartRef = useRef<{ x: number; y: number; shift: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const orgChartOverlayEnabled = useUIStore((s) => s.orgChartOverlayEnabled)
  // Gate the neighborhood occupancy overlay on the layer toggle so users can
  // hide the chips without losing the underlying neighborhoods themselves.
  const showNeighborhoodOverlay = useLayerVisibilityStore(
    (s) => s.visible.neighborhoods,
  )
  const showEquipmentOverlay = useOverlaysStore((s) => s.equipment)
  const seatMapColorMode = useUIStore((s) => s.seatMapColorMode)
  const dragAlignmentGuides = useUIStore((s) => s.dragAlignmentGuides)
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
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        setSize({ width: w, height: h })
        // Publish to the store so non-canvas consumers (minimap viewport
        // rectangle, zoom-anchoring) can reason about the drawable area
        // without measuring the DOM themselves.
        useCanvasStore.getState().setStageSize(w, h)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Publish the live stage to the module-level registry so non-canvas code
  // (export dialog, PDF/PNG buttons) can read it without prop-drilling.
  // Register on mount, unregister on unmount.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    setActiveStage(stage)
    return () => {
      setActiveStage(null)
    }
  }, [])

  // Phase 3: Esc cancels an in-flight multi-seat assignment. Guarded so
  // we don't steal Escape from dialogs or other features when there's no
  // queue active — `assignmentQueue.length > 0` is the active-mode signal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (useUIStore.getState().assignmentQueue.length > 0) {
        useUIStore.getState().clearAssignmentQueue()
        useToastStore.getState().push({ tone: 'info', title: 'Assignment cancelled' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Wheel handler: accumulates deltas into a ref and flushes once per
  // animation frame. This serves two purposes:
  //
  //   1. Trackpad gestures fire at ~60–120 Hz with tiny delta values
  //      (~1–4 per event). A per-event React commit would thrash
  //      Konva's renderer and feel laggy. Coalescing into one commit
  //      per frame keeps it buttery.
  //
  //   2. A discrete mouse-wheel click is ~100+ delta. Using the same
  //      fixed multiplier for both produced either a jerky wheel or a
  //      non-responsive trackpad. We normalise by event magnitude
  //      via `Math.exp(-delta * ZOOM_WHEEL_SENSITIVITY)` so one big
  //      tick and a stream of tiny trackpad moves both apply
  //      proportional scaling.
  //
  // The handler also discriminates pan vs. zoom per-gesture:
  //
  //   - `ctrlKey` === true  → macOS trackpad pinch-to-zoom (the browser
  //                           synthesises a wheel event with ctrlKey set)
  //   - `shiftKey` || `deltaX !== 0` → pan (explicit shift-scroll, or a
  //                           two-finger horizontal trackpad swipe)
  //   - otherwise           → zoom on a plain vertical mouse wheel
  //
  // Anchoring uses the LATEST pointer position seen in the batch — the
  // pointer usually doesn't move much between queued events, and this
  // avoids drift relative to the world point under the cursor.
  const wheelAccumRef = useRef<{
    deltaX: number
    deltaY: number
    pointerX: number
    pointerY: number
    ctrlKey: boolean
    shiftKey: boolean
    sawHorizontal: boolean
    pending: boolean
  }>({
    deltaX: 0, deltaY: 0, pointerX: 0, pointerY: 0,
    ctrlKey: false, shiftKey: false, sawHorizontal: false, pending: false,
  })

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const acc = wheelAccumRef.current
      acc.deltaX += e.evt.deltaX
      acc.deltaY += e.evt.deltaY
      acc.pointerX = pointer.x
      acc.pointerY = pointer.y
      // ctrl/shift can toggle mid-gesture but what matters at flush time
      // is whether they're CURRENTLY held — store the latest state.
      acc.ctrlKey = e.evt.ctrlKey
      acc.shiftKey = e.evt.shiftKey
      // Remember if ANY queued event produced a horizontal component.
      // A single vertical event inside an otherwise horizontal gesture
      // shouldn't flip the batch to zoom.
      if (e.evt.deltaX !== 0) acc.sawHorizontal = true
      if (acc.pending) return
      acc.pending = true

      requestAnimationFrame(() => {
        const a = wheelAccumRef.current
        const deltaX = a.deltaX
        const deltaY = a.deltaY
        const pointerX = a.pointerX
        const pointerY = a.pointerY
        const ctrlKey = a.ctrlKey
        const shiftKey = a.shiftKey
        const sawHorizontal = a.sawHorizontal
        wheelAccumRef.current = {
          deltaX: 0, deltaY: 0, pointerX: 0, pointerY: 0,
          ctrlKey: false, shiftKey: false, sawHorizontal: false, pending: false,
        }

        const cs = useCanvasStore.getState()

        // Pan branch. `ctrlKey` (macOS pinch) is explicitly excluded — it
        // always zooms. Shift-scroll and horizontal trackpad swipes pan.
        // Delta is in screen pixels, subtracted so a rightward/downward
        // trackpad swipe "scrolls" the viewport toward that direction —
        // i.e. content appears to move left/up, which is the same
        // convention as native scrolling.
        if (!ctrlKey && (shiftKey || sawHorizontal)) {
          // When the user holds shift with a plain mouse wheel, browsers
          // typically still report on deltaY only. Route deltaY into the
          // horizontal axis so shift+wheel reads as "pan horizontally".
          const panX = shiftKey && !sawHorizontal ? deltaY : deltaX
          const panY = shiftKey && !sawHorizontal ? 0 : deltaY
          useCanvasStore.setState({
            stageX: cs.stageX - panX,
            stageY: cs.stageY - panY,
          })
          return
        }

        // Zoom branch. Read from the store fresh — queued events could
        // otherwise use a stale scale captured when the callback's
        // closure was formed.
        const oldScale = cs.stageScale
        const factor = Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY)
        const newScale = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, oldScale * factor),
        )
        if (newScale === oldScale) return

        const worldX = (pointerX - cs.stageX) / oldScale
        const worldY = (pointerY - cs.stageY) / oldScale

        // Single store update for scale + position keeps the two in sync —
        // if we set them separately, a re-render could land between them
        // and produce a one-frame visual jump.
        useCanvasStore.setState({
          stageScale: newScale,
          stageX: pointerX - worldX * newScale,
          stageY: pointerY - worldY * newScale,
        })
      })
    },
    [],
  )

  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  // Press-origin + movement tracking for the Miro-style "click empty canvas
  // and drag to pan" behaviour on the select tool. When a select-tool press
  // on empty stage doesn't move past `PAN_CLICK_THRESHOLD_PX`, we treat the
  // mouseup as a plain background click and clear the selection (the same
  // outcome as the previous marquee-zero-area path). When it does move, we
  // pan and skip the deselect.
  const panOriginRef = useRef<{ x: number; y: number; fromSelect: boolean } | null>(null)
  const panMovedRef = useRef(false)
  // Render-time signal that we're actively panning, used only to flip the
  // cursor to `grabbing`. The ref above is the source of truth for the
  // hot path (mousemove); this state changes once at press and once at
  // release so it doesn't thrash renders.
  const [panActive, setPanActive] = useState(false)

  // Cursor position in canvas-space coords, tracked for the door/window
  // ghost preview. Null when the cursor has left the canvas so the ghost
  // disappears cleanly (no stale phantom between sessions on the same tool).
  const [ghostCursor, setGhostCursor] = useState<{ x: number; y: number } | null>(null)
  // Mirrored hit state from <AttachmentGhost> so we can set the DOM cursor
  // to `not-allowed` when hovering off any wall without running the
  // expensive elements-walk in two places.
  const [ghostHasHit, setGhostHasHit] = useState(false)

  // Primitive drawing: a ref for the press-anchor (authoritative) and a
  // React preview state for the dashed overlay. Following the same
  // ref + state pattern as wall drawing so state batching can't drop a
  // mousemove between press and release.
  const shapeDragRef = useRef<{ startX: number; startY: number } | null>(null)
  const [shapePreview, setShapePreview] = useState<ShapeDrawingPreview | null>(null)

  // Neighborhood drag-create: same ref + state pattern as primitives.
  // Kept separate from `shapeDragRef` so a mixed-tool fast switch can't
  // confuse the cleanup logic — each tool owns its own drag lifecycle.
  const neighborhoodDragRef = useRef<{ startX: number; startY: number } | null>(null)
  const [neighborhoodPreview, setNeighborhoodPreview] = useState<
    { startX: number; startY: number; endX: number; endY: number } | null
  >(null)

  // Measure-tool session. Committed vertices live here as a flat array;
  // the active cursor position lives in React state (so the overlay
  // re-renders as the pointer moves). Cleared on Escape, tool switch, or
  // double-click/Enter. Project scale/unit also read here so the overlay
  // can compose its labels from one call site.
  const [measureSession, setMeasureSession] = useState<MeasureSession>({
    points: [],
    cursor: null,
    finalised: false,
  })
  const projectScale = useCanvasStore((s) => s.settings.scale)
  const projectScaleUnit = useCanvasStore((s) => s.settings.scaleUnit)

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
        panOriginRef.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
          fromSelect: false,
        }
        panMovedRef.current = false
        setPanActive(true)
        return
      }

      // Miro/Google-Maps-style click-and-drag pan from the select tool.
      // Pressing the primary button on empty canvas with no Shift modifier
      // pans the view — the most common navigation request from new users.
      // Shift+drag is reserved for the original marquee-select (handled
      // below). Anything that lands on an existing element drops through
      // to the normal element-drag / click-to-select path further down.
      if (
        activeTool === 'select' &&
        e.evt.button === 0 &&
        !e.evt.shiftKey &&
        e.target === e.target.getStage()
      ) {
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        panOriginRef.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
          fromSelect: true,
        }
        panMovedRef.current = false
        setPanActive(true)
        // Suppress any open context menu just like the previous marquee
        // branch did — pressing on the stage always dismisses it.
        setContextMenu(null)
        return
      }

      // Phase 3: multi-seat assign — consume queue on click when active.
      {
        const queue = useUIStore.getState().assignmentQueue
        if (queue.length > 0 && e.evt.button === 0) {
          const target = e.target
          // Konva: the clicked node may be a child shape inside the element
          // group. Resolve to the enclosing element id via the ancestor group.
          const ancestorGroup = target.findAncestor('Group', true)
          const groupId = ancestorGroup?.id() || target.id()
          if (groupId) {
            const floorId = useFloorStore.getState().activeFloorId
            if (floorId) {
              const overflow = consumeQueueAtElement(groupId, floorId)
              if (overflow >= 0) {
                // Toast off actual remaining queue (not the return value) so
                // desk clicks that leave items in the queue still prompt the
                // user to keep clicking rather than falsely declaring done.
                const remaining = useUIStore.getState().assignmentQueue.length
                if (remaining > 0) {
                  useToastStore.getState().push({
                    tone: 'warning',
                    title: `${remaining} ${remaining === 1 ? 'employee' : 'employees'} not yet assigned`,
                    body: 'Click another workstation or desk, or press Esc to cancel.',
                  })
                } else {
                  useToastStore.getState().push({
                    tone: 'success',
                    title: 'All selected employees assigned',
                  })
                }
                return
              }
            }
          }
        }
      }

      // Defense-in-depth: viewers shouldn't be able to create anything even
      // if a creation tool somehow became the active tool (e.g., by URL
      // state, a stale session, or future code that forgets to gate).
      // ToolSelector already filters creation tools out of the picker for
      // viewers, but we don't rely on that here.
      const creationTool =
        activeTool === 'wall' ||
        activeTool === 'door' ||
        activeTool === 'window' ||
        PRIMITIVE_TOOLS.has(activeTool)
      if (creationTool && !canEdit) {
        if (e.target === e.target.getStage()) {
          clearSelection()
          setContextMenu(null)
        }
        return
      }

      // Measure tool: each left-click commits a new vertex. A session
      // with a single vertex shows the "live length" out to the cursor;
      // double-click (handled separately) finalises. The tool sits
      // OUTSIDE the `creationTool` guard above because measuring is a
      // read-only operation — viewers get to use it too.
      if (activeTool === 'measure' && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        setMeasureSession((prev) => {
          // Clicking AFTER a finalised session starts fresh — the user
          // is effectively saying "new measurement" by clicking again.
          if (prev.finalised) {
            return {
              points: [canvasX, canvasY],
              cursor: { x: canvasX, y: canvasY },
              finalised: false,
            }
          }
          return {
            points: [...prev.points, canvasX, canvasY],
            cursor: { x: canvasX, y: canvasY },
            finalised: false,
          }
        })
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

      // Calibrate-scale tool: each left-click records a point. Second
      // click opens the distance modal (rendered at the project-shell
      // level). Tool sits outside the `creationTool` viewer-guard above
      // — like `measure`, this is effectively read-only from the
      // element-store's perspective (it only writes to canvasSettings).
      if (activeTool === 'calibrate-scale' && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        const cs = useCalibrateScaleStore.getState()
        // Auto-arm so a fresh click on the tool's first use still works
        // without relying on a separate "begin()" call site.
        if (cs.status === 'idle') cs.begin()
        cs.clickAt(canvasX, canvasY)
        return
      }

      // Drawing primitives: click-drag to place. Free-text is special —
      // it only needs a click; we immediately drop a small text element
      // and open the inline editor.
      if (PRIMITIVE_TOOLS.has(activeTool) && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale

        if (activeTool === 'free-text') {
          const elementsStore = useElementsStore.getState()
          const element = buildFreeText(canvasX, canvasY, elementsStore.getMaxZIndex() + 1)
          elementsStore.addElement(element as unknown as CanvasElement)
          useUIStore.getState().setSelectedIds([element.id])
          useUIStore.getState().setEditingLabelId(element.id)
          useCanvasStore.getState().setActiveTool('select')
          return
        }

        shapeDragRef.current = { startX: canvasX, startY: canvasY }
        setShapePreview({ tool: activeTool, startX: canvasX, startY: canvasY, endX: canvasX, endY: canvasY })
        return
      }

      // Neighborhood tool: click on empty canvas starts a drag-create.
      // Clicks that land on an existing neighborhood handle are absorbed
      // by the edit overlay; this branch is only reached when the press
      // target is the stage itself, mirroring the marquee branch below.
      if (
        activeTool === 'neighborhood' &&
        e.evt.button === 0 &&
        e.target === e.target.getStage()
      ) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        neighborhoodDragRef.current = { startX: canvasX, startY: canvasY }
        setNeighborhoodPreview({
          startX: canvasX,
          startY: canvasY,
          endX: canvasX,
          endY: canvasY,
        })
        // Drop any existing selection so the new neighborhood (or
        // empty-space click) gets a clean slate.
        clearSelection()
        return
      }

      // Annotation pin tool. Left-click anywhere drops a create-popover:
      // on an element → element-anchored; on empty canvas → floor-position
      // anchored. The popover is a DOM overlay (AnnotationPopover); we
      // just stash the anchor + screen-space coords and let it mount.
      //
      // Gate on editMap || editRoster at the click site — ToolSelector
      // still shows the tool to viewers technically, but defensive
      // gating here prevents any silent-write path if a lower-role user
      // forced the tool active via state fiddling.
      if (activeTool === 'pin' && e.evt.button === 0 && canAnnotate) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale

        // Resolve element under cursor via the same ancestor-group walk
        // the assignment-click path uses. `target === getStage()` means
        // empty canvas; anything else is inside an element's group.
        const target = e.target
        const ancestorGroup = target.findAncestor('Group', true)
        const elementId =
          target === target.getStage() ? null : ancestorGroup?.id() || null

        const floorId = useFloorStore.getState().activeFloorId
        // Element anchor when we hit one, else floor-position anchor.
        const anchor: import('../../../types/annotations').AnnotationAnchor =
          elementId
            ? { type: 'element', elementId }
            : { type: 'floor-position', floorId, x: canvasX, y: canvasY }
        useAnnotationsStore.getState().setDraft({
          anchor,
          screenX: pointer.x,
          screenY: pointer.y,
        })
        // Return to select after opening the popover so the user isn't
        // stuck in pin-mode if they dismiss without saving.
        useCanvasStore.getState().setActiveTool('select')
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

      // Marquee drag-select: Shift + primary-button on empty stage in the
      // select tool. The unshifted equivalent now triggers click-and-drag
      // pan (handled at the top of this callback) — Miro/Linear-style.
      // Marquee always augments the current selection here because the
      // user explicitly held Shift; preserving that semantics matches the
      // previous "shift = additive" behaviour for power users who relied
      // on it.
      if (
        activeTool === 'select' &&
        e.evt.button === 0 &&
        e.evt.shiftKey &&
        e.target === e.target.getStage()
      ) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        marqueeStartRef.current = {
          x: canvasX,
          y: canvasY,
          shift: true,
        }
        setContextMenu(null)
        return
      }

      if (e.target === e.target.getStage()) {
        clearSelection()
        setContextMenu(null)
      }
    },
    [activeTool, canEdit, canAnnotate, clearSelection, setContextMenu, stageX, stageY, stageScale, onWallMouseDown]
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        const dx = e.evt.clientX - lastPointer.current.x
        const dy = e.evt.clientY - lastPointer.current.y
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        setStagePosition(stageX + dx, stageY + dy)
        // Track whether the press has travelled past the click threshold
        // so mouseup can distinguish "click → deselect" from "drag → pan"
        // when we entered pan from the select tool.
        if (panOriginRef.current && !panMovedRef.current) {
          const totalDx = e.evt.clientX - panOriginRef.current.x
          const totalDy = e.evt.clientY - panOriginRef.current.y
          if (Math.hypot(totalDx, totalDy) >= PAN_CLICK_THRESHOLD_PX) {
            panMovedRef.current = true
          }
        }
      }

      // Publish cursor position in world (pre-transform) coordinates so
      // the status bar — and anyone else interested — can show an
      // accurate X/Y readout. `cursorStore.setCursor` rounds and
      // short-circuits when the rounded coords haven't changed, so we
      // don't spam re-renders when the pointer is effectively still.
      {
        const stage = stageRef.current
        if (stage) {
          const pointer = stage.getPointerPosition()
          if (pointer) {
            useCursorStore.getState().setCursor(
              (pointer.x - stageX) / stageScale,
              (pointer.y - stageY) / stageScale,
            )
          }
        }
      }

      // Marquee drag: compute normalized rect from press point to current
      // pointer. Normalization (always-positive w/h) makes AABB overlap
      // checks downstream trivial and the <Rect> overlay render correct
      // regardless of drag direction.
      if (marqueeStartRef.current) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        const start = marqueeStartRef.current
        const x = Math.min(start.x, canvasX)
        const y = Math.min(start.y, canvasY)
        const w = Math.abs(canvasX - start.x)
        const h = Math.abs(canvasY - start.y)
        setMarquee({ x, y, w, h })
        return
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

      // Calibrate-scale live tracking: feed the cursor into the store so
      // the overlay's rubberband + live distance readout follows the
      // pointer. Only track while the tool is actually active; the
      // overlay already bails on status === 'idle'.
      if (activeTool === 'calibrate-scale') {
        const stage = stageRef.current
        if (stage) {
          const pointer = stage.getPointerPosition()
          if (pointer) {
            useCalibrateScaleStore.getState().setCursor(
              (pointer.x - stageX) / stageScale,
              (pointer.y - stageY) / stageScale,
            )
          }
        }
      }

      // Measure-tool live tracking. Only commit the cursor position
      // after the first vertex exists — before that there's nothing to
      // measure TO, so the overlay stays hidden.
      if (activeTool === 'measure') {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        setMeasureSession((prev) =>
          prev.points.length === 0 || prev.finalised
            ? prev
            : { ...prev, cursor: { x: canvasX, y: canvasY } },
        )
      }

      // Primitive drag: update preview rectangle / line every move while
      // pressed. No anchor ref means the user isn't dragging (press
      // happened on a non-canvas element or outside the stage) — bail.
      if (PRIMITIVE_TOOLS.has(activeTool) && shapeDragRef.current) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        const start = shapeDragRef.current
        setShapePreview({
          tool: activeTool,
          startX: start.startX,
          startY: start.startY,
          endX: canvasX,
          endY: canvasY,
        })
      }

      // Neighborhood drag-create: keep the dashed preview rect in sync
      // with the pointer. Same normalise-on-render approach as the
      // marquee overlay — we store raw start/end and compute
      // min/abs at render time.
      if (activeTool === 'neighborhood' && neighborhoodDragRef.current) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        const start = neighborhoodDragRef.current
        setNeighborhoodPreview({
          startX: start.startX,
          startY: start.startY,
          endX: canvasX,
          endY: canvasY,
        })
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
    // If the user dragged out of the canvas mid-pan, reset our pan state so
    // the next mouseup outside the canvas doesn't leave the cursor stuck on
    // `grabbing`. The pointer is no longer over the stage anyway, so any
    // continued movement would be lost.
    if (isPanning.current) {
      isPanning.current = false
      panOriginRef.current = null
      panMovedRef.current = false
      setPanActive(false)
    }
    // Hide the cursor readout when the pointer isn't over the canvas —
    // otherwise the status bar shows stale coordinates that don't
    // correspond to where the user is actually pointing.
    useCursorStore.getState().clearCursor()
    // And drop any hover outline for the same reason — if the pointer
    // leaves the canvas while still "inside" an element (e.g. during a
    // fast swipe to the sidebar), the onMouseLeave on that element may
    // not fire, leaving the dashed outline stuck.
    useUIStore.getState().setHoveredId(null)
    // Also cancel any in-flight marquee — dragging out of the canvas and
    // releasing elsewhere would otherwise leave the overlay stuck on.
    if (marqueeStartRef.current) {
      marqueeStartRef.current = null
      setMarquee(null)
    }
    // Same treatment for primitive drag — if the user drags out and up,
    // we never hear the mouseup, so cancel preview here.
    if (shapeDragRef.current) {
      shapeDragRef.current = null
      setShapePreview(null)
    }
    // Neighborhood drag — same pattern: if they leave the canvas mid-drag,
    // drop the preview so it doesn't ghost-render.
    if (neighborhoodDragRef.current) {
      neighborhoodDragRef.current = null
      setNeighborhoodPreview(null)
    }
    // Measure-tool: keep committed vertices visible, but drop the cursor
    // trail since its last-known value would be stale the moment the
    // pointer re-enters somewhere else.
    setMeasureSession((prev) => (prev.cursor ? { ...prev, cursor: null } : prev))
    // Calibrate tool: same reasoning — committed endpoints stay, but
    // the live rubberband anchor is stale the moment the pointer leaves.
    useCalibrateScaleStore.getState().clearCursor()
  }, [ghostCursor])

  // Global Escape handling for the marquee: cancel the drag and leave the
  // selection untouched. The global keyboard shortcut listener owns Escape
  // for the rest of the editor, but cancelling a drag-in-progress is local
  // state so we handle it here directly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (marqueeStartRef.current) {
        marqueeStartRef.current = null
        setMarquee(null)
      }
      if (shapeDragRef.current) {
        shapeDragRef.current = null
        setShapePreview(null)
      }
      if (neighborhoodDragRef.current) {
        neighborhoodDragRef.current = null
        setNeighborhoodPreview(null)
      }
      setMeasureSession((prev) =>
        prev.points.length > 0 || prev.cursor || prev.finalised
          ? { points: [], cursor: null, finalised: false }
          : prev,
      )
      // Calibrate tool: Escape always aborts the session regardless of
      // which status it's in. Safe to call unconditionally — reset is a
      // no-op when already idle.
      if (useCalibrateScaleStore.getState().status !== 'idle') {
        useCalibrateScaleStore.getState().reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tool-switch cleanup for the calibrate session. Leaving the tool
  // cancels any in-flight calibration so a forgotten session doesn't
  // pop its modal later when the user has moved on. `reset()` no-ops
  // if already idle.
  useEffect(() => {
    if (activeTool !== 'calibrate-scale') {
      if (useCalibrateScaleStore.getState().status !== 'idle') {
        useCalibrateScaleStore.getState().reset()
      }
    } else {
      // Arm the tool on first activation so the first click records the
      // first point (rather than the "auto-arm on click" fallback).
      if (useCalibrateScaleStore.getState().status === 'idle') {
        useCalibrateScaleStore.getState().begin()
      }
    }
  }, [activeTool])

  // Tool-switch cleanup for the measure session — leaving the tool should
  // dismiss any lingering overlay. (Points alone survive an accidental
  // mouseleave, but switching tools is an explicit "I'm done" signal.)
  // The functional setter is a no-op when the session is already empty so
  // this doesn't cascade-render — same shape as the ghost-cursor cleanup
  // below.
  useEffect(() => {
    if (activeTool !== 'measure') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeasureSession((prev) =>
        prev.points.length > 0 || prev.cursor || prev.finalised
          ? { points: [], cursor: null, finalised: false }
          : prev,
      )
    }
  }, [activeTool])

  // Clear the ghost when the tool switches away from door/window. Keeps
  // state in sync without waiting for the next mousemove. The functional
  // setter is a no-op when the ghost is already null, so this doesn't
  // cascade-render.
  useEffect(() => {
    if (activeTool !== 'door' && activeTool !== 'window') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGhostCursor((g) => (g ? null : g))
    }
  }, [activeTool])

  // Double-click router: the wall tool uses dblclick to commit the in-flight
  // polyline, and the measure tool uses it to finalise the ruler. Without
  // this router the store-level `onDblClick={handleCanvasDoubleClick}` would
  // fire only the wall handler, leaving the measure tool unable to finish.
  const handleStageDoubleClick = useCallback(() => {
    if (activeTool === 'wall') {
      handleCanvasDoubleClick()
      return
    }
    if (activeTool === 'measure') {
      setMeasureSession((prev) =>
        prev.points.length > 0
          ? { points: prev.points, cursor: null, finalised: true }
          : prev,
      )
    }
  }, [activeTool, handleCanvasDoubleClick])

  const handleMouseUp = useCallback(() => {
    const wasPanning = isPanning.current
    const panOrigin = panOriginRef.current
    const panMoved = panMovedRef.current
    isPanning.current = false
    panOriginRef.current = null
    panMovedRef.current = false
    if (wasPanning) setPanActive(false)

    // Select-tool click-without-drag on empty canvas → deselect (matches
    // the prior marquee-zero-area behaviour). When the press travelled past
    // the threshold we treat it as a pan and skip the deselect so the user
    // doesn't lose their selection just for nudging the view.
    if (wasPanning && panOrigin?.fromSelect && !panMoved) {
      clearSelection()
      setContextMenu(null)
      return
    }

    // Commit the marquee: hit-test every element's AABB against the final
    // rect and set / append the selection. A zero-area marquee (click without
    // dragging) is treated as a plain background click — the initial mouse
    // down already cleared selection, so we just reset and bail.
    if (marqueeStartRef.current) {
      const rect = marquee
      const shift = marqueeStartRef.current.shift
      marqueeStartRef.current = null
      setMarquee(null)
      if (!rect || rect.w < 1 || rect.h < 1) return

      const elements = useElementsStore.getState().elements
      // Honour the category-visibility toggles here too so a hidden
      // category can't be swept-selected by a marquee drag. Filter before
      // passing into the geometric intersection test so marquee code stays
      // pure/geometric and the visibility rule lives in one place (the
      // same rule ElementRenderer applies).
      const categoryVisible = useLayerVisibilityStore.getState().visible
      const visibleElements: typeof elements = {}
      for (const [id, el] of Object.entries(elements)) {
        if (categoryVisible[categoryForElement(el)]) visibleElements[id] = el
      }
      const hits = elementsIntersectingRect(visibleElements, rect)

      const uiStore = useUIStore.getState()
      if (shift) {
        // Union with existing selection, preserving order and deduping.
        const current = uiStore.selectedIds
        const set = new Set(current)
        for (const id of hits) set.add(id)
        uiStore.setSelectedIds(Array.from(set))
      } else {
        uiStore.setSelectedIds(hits)
      }
      return
    }

    if (activeTool === 'wall') {
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const canvasX = (pointer.x - stageX) / stageScale
      const canvasY = (pointer.y - stageY) / stageScale
      onWallMouseUp(canvasX, canvasY)
    }

    // Neighborhood drag commit. Threshold of 8 canvas units so a
    // stray click doesn't silently paint a tiny zone. Less strict
    // than primitives because neighborhoods are explicitly meant to
    // cover multiple seats — a 0-4px rect would almost always be
    // accidental.
    if (
      activeTool === 'neighborhood' &&
      neighborhoodDragRef.current &&
      neighborhoodPreview
    ) {
      const p = neighborhoodPreview
      neighborhoodDragRef.current = null
      setNeighborhoodPreview(null)
      const w = Math.abs(p.endX - p.startX)
      const h = Math.abs(p.endY - p.startY)
      if (w >= 8 && h >= 8) {
        const nbStore = useNeighborhoodStore.getState()
        const floorId = useFloorStore.getState().activeFloorId
        const existingCount = Object.values(nbStore.neighborhoods).filter(
          (n) => n.floorId === floorId,
        ).length
        const paletteIdx = existingCount % NEIGHBORHOOD_PALETTE.length
        const id = nanoid()
        nbStore.addNeighborhood({
          id,
          name: `Neighborhood ${existingCount + 1}`,
          color: NEIGHBORHOOD_PALETTE[paletteIdx],
          x: (p.startX + p.endX) / 2,
          y: (p.startY + p.endY) / 2,
          width: w,
          height: h,
          floorId,
          department: null,
          team: null,
          notes: null,
        })
        useUIStore.getState().setSelectedIds([id])
        useCanvasStore.getState().setActiveTool('select')
      }
      return
    }

    // Primitive commit: if the drag travelled past the threshold, build
    // the element; otherwise cancel silently (so clicks-by-accident on
    // an already-active tool don't spawn a zero-sized artifact).
    if (PRIMITIVE_TOOLS.has(activeTool) && shapeDragRef.current && shapePreview) {
      const drag = {
        startX: shapePreview.startX,
        startY: shapePreview.startY,
        endX: shapePreview.endX,
        endY: shapePreview.endY,
      }
      shapeDragRef.current = null
      setShapePreview(null)
      if (!isDragCommit(drag)) return
      const elementsStore = useElementsStore.getState()
      const z = elementsStore.getMaxZIndex() + 1
      let element: CanvasElement | null = null
      if (activeTool === 'rect-shape')  element = buildRectShape(drag, z) as unknown as CanvasElement
      if (activeTool === 'ellipse')     element = buildEllipse(drag, z) as unknown as CanvasElement
      if (activeTool === 'line-shape')  element = buildLineShape(drag, z) as unknown as CanvasElement
      if (activeTool === 'arrow')       element = buildArrow(drag, z) as unknown as CanvasElement
      if (!element) return
      elementsStore.addElement(element)
      useUIStore.getState().setSelectedIds([element.id])
      useCanvasStore.getState().setActiveTool('select')
    }
  }, [activeTool, stageX, stageY, stageScale, onWallMouseUp, marquee, shapePreview, neighborhoodPreview, clearSelection, setContextMenu])

  // Base cursor per tool. For door/window we additionally flip to
  // `not-allowed` when the cursor is NOT over a wall in snap range — so the
  // user learns where they can click without silent no-ops. AttachmentGhost
  // owns the reactive hit test and pushes the result up via `onHitChange`;
  // this avoids duplicating the elements-map walk here on every render.
  let cursor: string = activeTool === 'pan' ? 'grab' : activeTool === 'wall' ? 'crosshair' : 'default'
  if ((activeTool === 'door' || activeTool === 'window') && ghostCursor) {
    cursor = ghostHasHit ? 'crosshair' : 'not-allowed'
  }
  if (PRIMITIVE_TOOLS.has(activeTool)) cursor = 'crosshair'
  if (activeTool === 'measure') cursor = 'crosshair'
  if (activeTool === 'calibrate-scale') cursor = 'crosshair'
  if (activeTool === 'neighborhood') cursor = 'crosshair'
  if (activeTool === 'pin') cursor = 'crosshair'
  // Active pan (any source: pan tool, middle-click, or select-tool drag)
  // wins over the per-tool cursor so users get the unambiguous "I'm
  // grabbing the canvas" affordance during the gesture.
  if (panActive) cursor = 'grabbing'

  // Accept employee drags from PeoplePanel and assign the dropped employee
  // to whatever assignable element is under the cursor.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Viewers can't receive either kind of drop; show the default "no-drop"
    // cursor by not calling preventDefault. Matches ElementLibrary, which
    // also hides tiles entirely for viewers.
    if (!canEdit) return
    if (e.dataTransfer.types.includes('application/employee-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      // Track the seat under the cursor so DeskRenderer can paint the
      // "currently hovered drop target" outline. Hit-test in canvas space
      // the same way handleDrop does, then publish the element id.
      const stage = stageRef.current
      if (stage) {
        stage.setPointersPositions(e.nativeEvent)
        const pointer = stage.getPointerPosition()
        if (pointer) {
          const cx = (pointer.x - stageX) / stageScale
          const cy = (pointer.y - stageY) / stageScale
          const elements = useElementsStore.getState().elements
          let hitId: string | null = null
          let hitZ = -Infinity
          for (const el of Object.values(elements)) {
            if (!isAssignableElement(el)) continue
            if (el.locked) continue
            if (el.visible === false) continue
            const hw = el.width / 2
            const hh = el.height / 2
            if (cx >= el.x - hw && cx <= el.x + hw && cy >= el.y - hh && cy <= el.y + hh) {
              if (el.zIndex > hitZ) {
                hitZ = el.zIndex
                hitId = el.id
              }
            }
          }
          const prev = useSeatDragStore.getState().hoveredSeatId
          if (prev !== hitId) useSeatDragStore.getState().setHoveredSeat(hitId)
        }
      }
      return
    }
    if (e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
      e.preventDefault()
      // `copy` matches the effectAllowed we set on dragstart, and gives
      // the user a "+" cursor showing the drop is valid.
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [canEdit, stageX, stageY, stageScale])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return
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
      const element = buildLibraryElement(
        item,
        pos.x,
        pos.y,
        elementsStore.getMaxZIndex() + 1,
        elementsStore.elements,
      )
      elementsStore.addElement(element)
      useUIStore.getState().setSelectedIds([element.id])
      useRecentLibraryItems.getState().addRecent(item)
      return
    }

    // Employee-assignment drag: hit-test assignable elements.
    const empId = e.dataTransfer.getData('application/employee-id')
    if (!empId) return
    e.preventDefault()

    // (el.x, el.y) is CENTER; rotation ignored (acceptable simplification).
    // Skip locked and hidden elements — they can't accept a drop. A hidden
    // category is treated the same as a hidden element: you can't drop
    // onto something you can't see.
    const elements = useElementsStore.getState().elements
    const categoryVisible = useLayerVisibilityStore.getState().visible
    let hitId: string | null = null
    let hitZ = -Infinity
    for (const el of Object.values(elements)) {
      if (!isAssignableElement(el)) continue
      if (el.locked) continue
      if (el.visible === false) continue
      if (!categoryVisible[categoryForElement(el)]) continue
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
      // Swap-on-drop: when the dragged employee is already seated AND the
      // drop target is a single-desk already occupied by someone else,
      // swap the two rather than evicting the incumbent. A single-seat
      // desk is the only case where swap semantics are unambiguous —
      // workstations/private-offices have multi-capacity slots, so a
      // drop there still goes through plain assignEmployee (which adds
      // the new body without displacing existing ones).
      const employees = useEmployeeStore.getState().employees
      const dragged = employees[empId]
      const elements = useElementsStore.getState().elements
      const target = elements[hitId]
      const isSingleDesk =
        target && (target.type === 'desk' || target.type === 'hot-desk')
      const targetOccupant =
        isSingleDesk && 'assignedEmployeeId' in target
          ? target.assignedEmployeeId
          : null
      if (
        isSingleDesk &&
        dragged?.seatId &&
        targetOccupant &&
        targetOccupant !== empId
      ) {
        const swapped = swapEmployees(empId, targetOccupant)
        if (swapped) {
          // Reset drag state so the outlines clear immediately — otherwise
          // React waits for onDragEnd which browsers sometimes skip after
          // a successful drop.
          useSeatDragStore.getState().reset()
          return
        }
      }
      assignEmployee(empId, hitId, useFloorStore.getState().activeFloorId)
    }
    useSeatDragStore.getState().reset()
  }, [stageX, stageY, stageScale, canEdit])

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ cursor }}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        // Clear hover-outline state when the drag leaves the canvas —
        // browsers fire `dragleave` per child too, so only reset when
        // the relatedTarget is outside this container.
        const related = e.relatedTarget as Node | null
        if (!related || !e.currentTarget.contains(related)) {
          useSeatDragStore.getState().setHoveredSeat(null)
        }
      }}
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
        onDblClick={handleStageDoubleClick}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <GridLayer width={size.width} height={size.height} />
        {/* NeighborhoodLayer sits between the grid and the element layer so
            seats, walls, and furniture paint on top of the translucent tint. */}
        <NeighborhoodLayer />
        <ElementRenderer />
        <DimensionLayer />
        <HoverOutline />
        <SelectionOverlay />
        <WallEditOverlay />
        {orgChartOverlayEnabled && <OrgChartOverlay />}
        {seatMapColorMode && <SeatMapColorMode />}
        <AlignmentGuides guides={dragAlignmentGuides} />
        <WallDrawingOverlay {...wallDrawingState} />
        <AttachmentGhost
          tool={activeTool}
          cursor={ghostCursor}
          stageScale={stageScale}
          snapPx={DOOR_WINDOW_SNAP_PX}
          onHitChange={setGhostHasHit}
        />
        <MarqueeOverlay rect={marquee} />
        <ShapeDrawingOverlay preview={shapePreview} />
        <MeasureOverlay
          session={measureSession}
          scale={projectScale}
          scaleUnit={projectScaleUnit}
        />
        <CalibrateOverlay />
        <NeighborhoodEditOverlay preview={neighborhoodPreview} />
        {/* Occupancy chips render last so they float above the canvas
            content — the layer is `listening={false}` so they stay
            purely decorative. */}
        {showNeighborhoodOverlay && <NeighborhoodOverlay />}
        {/* Equipment-needs overlay: translucent tint per assigned desk
            showing whether the seated employee's equipmentNeeds are met.
            Gated on overlaysStore.equipment (default off). */}
        {showEquipmentOverlay && <EquipmentOverlayLayer />}
        {/* Annotation pins render on their own layer above the element
            layer so a pin never disappears behind a wall or furniture. */}
        <AnnotationLayer
          onPinClick={(id, sx, sy) => {
            setLastPinAnchor({ x: sx, y: sy })
            useAnnotationsStore.getState().setActiveAnnotationId(id)
          }}
        />
      </Stage>
      <FreeTextEditorOverlay containerRef={containerRef} />
      <AnnotationPopover containerRef={containerRef} />
      <EmptyCanvasHint />
    </div>
  )
}
