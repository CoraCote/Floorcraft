import { Layer, Transformer } from 'react-konva'
import { useUIStore } from '../../../stores/uiStore'
import { useRef, useEffect } from 'react'
import type Konva from 'konva'

export function SelectionOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const trRef = useRef<Konva.Transformer>(null)
  const nodesRef = useRef<Konva.Node[]>([])

  useEffect(() => {
    const stage = trRef.current?.getStage()
    if (!stage || !trRef.current) return

    const nodes: Konva.Node[] = []
    for (const id of selectedIds) {
      const node = stage.findOne(`#element-${id}`)
      if (node) nodes.push(node)
    }

    nodesRef.current = nodes
    trRef.current.nodes(nodes)
    trRef.current.getLayer()?.batchDraw()
  }, [selectedIds])

  if (selectedIds.length === 0) return null

  return (
    <Layer>
      <Transformer
        ref={trRef}
        rotateEnabled={selectedIds.length === 1}
        enabledAnchors={
          selectedIds.length === 1
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
            : []
        }
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
