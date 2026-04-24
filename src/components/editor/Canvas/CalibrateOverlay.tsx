import { Layer, Line, Circle, Label, Tag, Text } from 'react-konva'
import { useCalibrateScaleStore } from '../../../stores/calibrateScaleStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { pointDistance } from '../../../lib/calibrateScale'
import { formatCanvasLength, LENGTH_UNIT_SUFFIX } from '../../../lib/units'

/**
 * Canvas overlay for the two-click calibrator.
 *
 * Visual states:
 *   - awaiting-first: nothing drawn. The status bar hint tells the user
 *     what to do; dropping a marker on every mousemove would be noisy.
 *   - awaiting-second: one committed dot plus a dashed rubberband from
 *     it to the cursor, with a live "N px (≈ M ft)" readout next to the
 *     cursor so the user can cross-check before the second click.
 *   - awaiting-distance: two committed dots + a solid line between them.
 *     The modal is focused; the canvas just shows what's locked in.
 *
 * We read the project scale/unit so the readout shows both canvas px
 * AND the real-world value at the CURRENT scale — architects find it
 * helpful to see whether the existing scale is even close before they
 * commit a new one.
 */
export function CalibrateOverlay() {
  const status = useCalibrateScaleStore((s) => s.status)
  const firstPoint = useCalibrateScaleStore((s) => s.firstPoint)
  const secondPoint = useCalibrateScaleStore((s) => s.secondPoint)
  const cursor = useCalibrateScaleStore((s) => s.cursor)
  const scale = useCanvasStore((s) => s.settings.scale)
  const scaleUnit = useCanvasStore((s) => s.settings.scaleUnit)

  if (status === 'idle') return null

  // Anchor of the live segment: either the committed first point (while
  // awaiting the second click) or nothing (other statuses handled below).
  const liveEndpoint =
    status === 'awaiting-second' && firstPoint && cursor ? cursor : null

  const showLiveLine = firstPoint && liveEndpoint
  const showCommittedLine = firstPoint && secondPoint

  // Distance label anchored near the cursor or the second point. Reads:
  //   "123.4 px"         — when project is in px pass-through mode
  //   "123.4 px · 12.3 ft" — once a real-world scale is in effect
  const labelText = (() => {
    const a = firstPoint
    const b = secondPoint ?? liveEndpoint
    if (!a || !b) return null
    const px = pointDistance(a, b)
    const pxLabel = `${px.toFixed(1)} px`
    if (scaleUnit === 'px') return pxLabel
    return `${pxLabel} · ${formatCanvasLength(px, scale, scaleUnit)}`
  })()

  const labelAnchor = secondPoint ?? liveEndpoint ?? null

  return (
    <Layer listening={false}>
      {/* Rubberband from the first committed point out to the cursor. */}
      {showLiveLine && (
        <Line
          points={[firstPoint.x, firstPoint.y, liveEndpoint.x, liveEndpoint.y]}
          stroke="#2563EB"
          strokeWidth={1.5}
          dash={[6, 4]}
        />
      )}

      {/* Solid line between the two committed points once both are placed. */}
      {showCommittedLine && (
        <Line
          points={[firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y]}
          stroke="#2563EB"
          strokeWidth={1.5}
        />
      )}

      {/* Committed endpoint markers. */}
      {firstPoint && (
        <Circle
          x={firstPoint.x}
          y={firstPoint.y}
          radius={4}
          fill="#ffffff"
          stroke="#2563EB"
          strokeWidth={1.5}
        />
      )}
      {secondPoint && (
        <Circle
          x={secondPoint.x}
          y={secondPoint.y}
          radius={4}
          fill="#ffffff"
          stroke="#2563EB"
          strokeWidth={1.5}
        />
      )}

      {/* Live distance readout. */}
      {labelText && labelAnchor && (
        <Label x={labelAnchor.x} y={labelAnchor.y} offsetX={-12} offsetY={-18}>
          <Tag
            fill="#1D4ED8"
            stroke="#1E3A8A"
            strokeWidth={0.5}
            cornerRadius={3}
          />
          <Text
            text={labelText}
            fontSize={11}
            padding={4}
            fill="#ffffff"
          />
        </Label>
      )}
    </Layer>
  )
}

// Re-export so tests and call sites don't need a second import.
export { LENGTH_UNIT_SUFFIX }
