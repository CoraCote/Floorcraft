import { Layer, Transformer, Label, Tag, Text } from 'react-konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import type Konva from 'konva'
import {
  isWallElement,
  isDoorElement,
  isWindowElement,
} from '../../../types/elements'

/**
 * Cardinal-angle snaps for the Transformer's rotate handle. Konva snaps
 * whenever the current angle is within `rotationSnapTolerance` degrees of
 * one of these values, giving the user easy access to the common axis-
 * aligned orientations without preventing fine-grained rotation.
 */
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]
const ROTATION_SNAP_TOLERANCE = 5

export function SelectionOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const trRef = useRef<Konva.Transformer>(null)
  const nodesRef = useRef<Konva.Node[]>([])
  // Live-transform HUD state. `rotation` is populated during a rotate gesture
  // (null otherwise, which hides the angle badge). `badgePos` is the stage-
  // space coordinate where the label should render — we place it near the
  // Transformer's top-right anchor so it floats above the element without
  // covering the rotate handle.
  const [rotation, setRotation] = useState<number | null>(null)
  const [badgePos, setBadgePos] = useState<{ x: number; y: number } | null>(
    null,
  )

  // Transformer handles scale/rotate — those don't make sense for walls
  // (which have their own vertex + midpoint overlay) or for doors/windows
  // (which derive position from their parent wall and don't own their
  // coordinates). Filter those out before attaching the Transformer.
  const transformableIds = useMemo(
    () =>
      selectedIds.filter((id) => {
        const el = elements[id]
        if (!el) return false
        if (isWallElement(el)) return false
        if (isDoorElement(el) || isWindowElement(el)) return false
        return true
      }),
    [selectedIds, elements],
  )

  useEffect(() => {
    const stage = trRef.current?.getStage()
    if (!stage || !trRef.current) return

    const nodes: Konva.Node[] = []
    for (const id of transformableIds) {
      const node = stage.findOne(`#element-${id}`)
      if (node) nodes.push(node)
    }

    nodesRef.current = nodes
    trRef.current.nodes(nodes)
    trRef.current.getLayer()?.batchDraw()
  }, [transformableIds])

  // Update the angle HUD on every pointer tick while the Transformer is
  // actively rotating. For a single selection we read the node's own
  // rotation; for multi-select we read the Transformer's rotation (the
  // collective rotation around the group's center). Badge position tracks
  // the Transformer's bounding box in stage coords so it stays anchored
  // as the user rotates.
  const handleTransform = useCallback(() => {
    const tr = trRef.current
    if (!tr) return
    const activeAnchor = tr.getActiveAnchor?.()
    // Only show the angle badge during a rotate gesture, not during a
    // resize drag — distance-based scale isn't what the HUD is for.
    if (activeAnchor !== 'rotater') return
    const angle =
      nodesRef.current.length === 1
        ? nodesRef.current[0].rotation()
        : tr.rotation()
    // Normalize to (-180, 180] then display as 0..360 for readability.
    let normalized = angle % 360
    if (normalized < 0) normalized += 360
    setRotation(normalized)
    // getClientRect returns the transformer's AABB in stage-space coords,
    // which is exactly what the Label needs to anchor to the top-right of
    // the selection without following any parent group transform.
    const box = tr.getClientRect()
    setBadgePos({ x: box.x + box.width + 12, y: box.y })
  }, [])

  const handleTransformStart = useCallback(() => {
    // No-op placeholder: we wait until the first `transform` event to set
    // the badge so we don't flash a stale value at drag start.
    setRotation(null)
    setBadgePos(null)
  }, [])

  // For multi-select, Konva updates each node's x/y AND rotation when the
  // Transformer rotates — this correctly rotates the group around its
  // collective center. On transformEnd we push those values back to the
  // store. (For single-select drag/scale there is already an ElementRenderer
  // onDragEnd handler, but it doesn't cover multi-node rotate.)
  const handleTransformEnd = useCallback(() => {
    for (const node of nodesRef.current) {
      const id = node.id().replace(/^element-/, '')
      if (!id) continue
      const el = elements[id]
      if (!el) continue
      if (isWallElement(el) || isDoorElement(el) || isWindowElement(el)) continue
      // Bake transformer scale into width/height so subsequent drags use the
      // new size rather than accumulating scale. Reset scale on the node.
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      const width = el.width * scaleX
      const height = el.height * scaleY
      node.scaleX(1)
      node.scaleY(1)
      updateElement(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
        height,
      })
    }
    setRotation(null)
    setBadgePos(null)
  }, [elements, updateElement])

  if (transformableIds.length === 0) return null

  return (
    <Layer>
      <Transformer
        ref={trRef}
        rotateEnabled={transformableIds.length >= 1}
        enabledAnchors={
          transformableIds.length === 1
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
            : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        }
        rotationSnaps={ROTATION_SNAPS}
        rotationSnapTolerance={ROTATION_SNAP_TOLERANCE}
        onTransformStart={handleTransformStart}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        borderStroke="#3B82F6"
        borderStrokeWidth={1.5}
        anchorFill="#ffffff"
        anchorStroke="#3B82F6"
        anchorSize={8}
        anchorCornerRadius={2}
        rotateAnchorOffset={20}
        padding={4}
      />
      {rotation !== null && badgePos && (
        <Label x={badgePos.x} y={badgePos.y} listening={false}>
          <Tag
            fill="#1F2937"
            cornerRadius={4}
            pointerDirection="left"
            pointerWidth={6}
            pointerHeight={6}
          />
          <Text
            text={`${Math.round(rotation)}°`}
            fontFamily="system-ui, sans-serif"
            fontSize={12}
            padding={6}
            fill="#ffffff"
          />
        </Label>
      )}
    </Layer>
  )
}
