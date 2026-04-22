import { Layer, Transformer } from 'react-konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useRef, useEffect, useMemo, useCallback } from 'react'
import type Konva from 'konva'
import {
  isWallElement,
  isDoorElement,
  isWindowElement,
} from '../../../types/elements'

export function SelectionOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const trRef = useRef<Konva.Transformer>(null)
  const nodesRef = useRef<Konva.Node[]>([])

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
    </Layer>
  )
}
