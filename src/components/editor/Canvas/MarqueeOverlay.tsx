import { Layer, Rect } from 'react-konva'

interface MarqueeOverlayProps {
  rect: { x: number; y: number; w: number; h: number } | null
}

/**
 * Renders the dashed drag-selection rectangle when the user is pressing
 * and dragging across empty canvas in select-tool mode. Lives in its own
 * <Layer> so we don't re-render the element layer on every mousemove
 * during a drag — the marquee changes ~60 times per second and the
 * element layer can be expensive to repaint for large floor plans.
 *
 * `rect` is expressed in canvas-space coords (not screen). The parent
 * <Stage> is already transformed so we render in native units.
 */
export function MarqueeOverlay({ rect }: MarqueeOverlayProps) {
  if (!rect) return null
  return (
    <Layer listening={false}>
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        stroke="#3B82F6"
        strokeWidth={1}
        // Slight translucent blue fill so the marquee reads as a selection
        // region at a glance without obscuring the elements it covers.
        fill="rgba(59, 130, 246, 0.08)"
        dash={[4, 4]}
      />
    </Layer>
  )
}
