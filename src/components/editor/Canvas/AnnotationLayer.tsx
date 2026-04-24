import { useMemo } from 'react'
import { Layer } from 'react-konva'
import { useAnnotationsStore } from '../../../stores/annotationsStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { elementBounds } from '../../../lib/elementBounds'
import { AnnotationPinRenderer } from './AnnotationPinRenderer'

/**
 * Konva layer that renders one pin per OPEN annotation on the active
 * floor. Resolved annotations are hidden here (they remain visible in
 * the `AnnotationsPanel` list, under the "Resolved" collapsible).
 *
 * Element-anchored pins read the host element's current bounding box at
 * render time and draw at its top-right corner. That means the pin
 * follows the element as it moves without the store having to update on
 * every drag — the renderer is the authority on placement.
 *
 * Floor-position pins render at their raw `(x, y)` coords on the floor
 * they belong to; a pin whose `floorId` doesn't match the active floor
 * is filtered out (same pattern as `NeighborhoodLayer`).
 */
interface Props {
  /**
   * Called when a pin is clicked. Receives the annotation id and the
   * screen-space pointer coords at click time, so the popover can
   * render next to the pin without repeating the transform math.
   */
  onPinClick: (id: string, screenX: number, screenY: number) => void
}

export function AnnotationLayer({ onPinClick }: Props) {
  const annotations = useAnnotationsStore((s) => s.annotations)
  const elements = useElementsStore((s) => s.elements)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)

  /**
   * Resolve each annotation's anchor to world coords (or drop it when
   * the anchor can't be resolved on the active floor). We compute this
   * in a memo so the layer doesn't re-walk the map on every unrelated
   * Konva render (e.g. stage zoom tweaks the pin size but doesn't
   * change which pins exist).
   */
  const pins = useMemo(() => {
    const out: { id: string; x: number; y: number }[] = []
    for (const a of Object.values(annotations)) {
      // Resolved pins hide on canvas by default.
      if (a.resolvedAt) continue
      if (a.anchor.type === 'element') {
        const el = elements[a.anchor.elementId]
        if (!el) continue
        // Only surface element anchors on the floor that currently owns
        // the element. Elements live in `useElementsStore` which is
        // floor-swapped on `switchToFloor`, so presence in the map
        // already implies the element is on the active floor.
        const b = elementBounds(el)
        if (!b) continue
        // Top-right corner, nudged outward a hair so the pin doesn't
        // visually cover the element's corner handle.
        out.push({ id: a.id, x: b.x + b.width + 4, y: b.y - 4 })
      } else {
        if (a.anchor.floorId !== activeFloorId) continue
        out.push({ id: a.id, x: a.anchor.x, y: a.anchor.y })
      }
    }
    return out
  }, [annotations, elements, activeFloorId])

  if (pins.length === 0) return <Layer listening={true} />

  return (
    <Layer listening={true}>
      {pins.map((p) => {
        const a = annotations[p.id]
        return (
          <AnnotationPinRenderer
            key={p.id}
            id={p.id}
            x={p.x}
            y={p.y}
            resolved={Boolean(a.resolvedAt)}
            onClick={onPinClick}
          />
        )
      })}
    </Layer>
  )
}
