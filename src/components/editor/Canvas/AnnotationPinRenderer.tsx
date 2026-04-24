import { Group, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../../stores/canvasStore'

/**
 * Single speech-bubble pin rendered on the canvas. The pin visually floats
 * above whatever it's anchored to — position math lives in the parent
 * `AnnotationLayer` so this component stays dumb about the anchor shape.
 *
 * Pins draw at a *screen-constant* size: a 14-unit radius divided by the
 * current stage scale. At 2× zoom the world-space radius is 7 so the
 * final on-screen footprint is still 14 CSS pixels. Without this, pins
 * would shrink to dots at low zoom or balloon over the entire element at
 * high zoom.
 */
interface Props {
  id: string
  /** Canvas-space pin anchor (world units). */
  x: number
  y: number
  resolved: boolean
  onClick: (id: string, stageX: number, stageY: number) => void
}

export function AnnotationPinRenderer({ id, x, y, resolved, onClick }: Props) {
  const stageScale = useCanvasStore((s) => s.stageScale)
  // Keep on-screen size stable regardless of zoom. Divide by scale so
  // Konva's stage transform doesn't rescale the pin away.
  const r = 10 / stageScale
  const stroke = 1 / stageScale

  const fill = resolved ? '#E5E7EB' : '#FBBF24'
  const line = resolved ? '#9CA3AF' : '#92400E'

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    // Anchor coords passed in screen space so the popover can render
    // without re-doing the transform math.
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    const sx = pos ? pos.x : 0
    const sy = pos ? pos.y : 0
    onClick(id, sx, sy)
  }

  return (
    <Group x={x} y={y} onMouseDown={handleClick}>
      <Circle
        radius={r}
        fill={fill}
        stroke={line}
        strokeWidth={stroke}
        shadowColor="black"
        shadowBlur={2 / stageScale}
        shadowOpacity={0.2}
      />
      <Text
        // "!" glyph doubles as a visual cue ("here's a note"). We
        // intentionally don't render the body in the pin — that lives
        // in the popover, which can size to the content.
        text={resolved ? '✓' : '!'}
        fontSize={12 / stageScale}
        fontStyle="bold"
        fill={line}
        // Center the glyph inside the circle. Konva text origin is the
        // top-left of the run; subtract half the estimated glyph size.
        offsetX={3 / stageScale}
        offsetY={6 / stageScale}
      />
    </Group>
  )
}
