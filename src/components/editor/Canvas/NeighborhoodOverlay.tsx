import { useMemo } from 'react'
import { Layer, Group, Rect, Text } from 'react-konva'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import {
  computeNeighborhoodMetrics,
  type NeighborhoodHealth,
} from '../../../lib/neighborhoodMetrics'
import { isAssignableElement } from '../../../types/elements'
import type { CanvasElement } from '../../../types/elements'

/**
 * Renders a small occupancy chip above each neighborhood on the active
 * floor. Each chip shows `{assigned}/{capacity}` and a 3-color pill
 * indicating whether the zone is healthy, approaching capacity, or
 * under/over-utilized.
 *
 * Pure presentation: the metric math happens in `neighborhoodMetrics.ts`
 * and the chip placement reads the neighborhood's bounding rect from its
 * own `x,y,width,height`. We still compute the seat-derived bounds so the
 * chip hugs the actual seat cluster inside the zone — important when the
 * neighborhood rectangle has been sized generously and the seats live in
 * one corner.
 *
 * `listening={false}` — the chip is a read-only annotation; interactive
 * neighborhood picking is owned by `NeighborhoodEditOverlay`.
 */
export function NeighborhoodOverlay() {
  const neighborhoodsMap = useNeighborhoodStore((s) => s.neighborhoods)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)

  // Filter to the active floor before computing metrics so a project with
  // many floors worth of neighborhoods doesn't pay the cost of the others.
  const neighborhoods = useMemo(
    () =>
      Object.values(neighborhoodsMap).filter(
        (n) => n.floorId === activeFloorId,
      ),
    [neighborhoodsMap, activeFloorId],
  )

  const metrics = useMemo(
    () => computeNeighborhoodMetrics(neighborhoods, elements, employees),
    [neighborhoods, elements, employees],
  )

  // For each metric, derive the bounding rect from the seat elements so the
  // chip sits above the seat cluster (not the zone's extra whitespace).
  // If the neighborhood has no seats inside, fall back to the neighborhood
  // rect itself.
  const chips = useMemo(() => {
    const byId = new Map(neighborhoods.map((n) => [n.id, n]))
    return metrics.map((m) => {
      const nb = byId.get(m.neighborhoodId)!
      const bounds = m.elementIds.length
        ? seatBounds(m.elementIds, elements)
        : null
      const top = bounds ? bounds.top : nb.y - nb.height / 2
      const left = bounds ? bounds.left : nb.x - nb.width / 2
      return { metric: m, top, left }
    })
  }, [metrics, neighborhoods, elements])

  if (chips.length === 0) return <Layer listening={false} />

  return (
    <Layer listening={false}>
      {chips.map(({ metric: m, top, left }) => (
        <OccupancyChip
          key={m.neighborhoodId}
          x={left}
          y={top - CHIP_OFFSET_Y}
          color={m.color}
          text={`${m.assignedSeats}/${m.totalSeats}`}
          health={m.health}
        />
      ))}
    </Layer>
  )
}

const CHIP_OFFSET_Y = 22
const CHIP_PAD_X = 8
const CHIP_PAD_Y = 4
const CHIP_FONT_SIZE = 12
const PILL_WIDTH = 10
const PILL_HEIGHT = 10
const PILL_GAP = 6

const HEALTH_FILL: Record<NeighborhoodHealth, string> = {
  healthy: '#10B981',
  warn: '#F59E0B',
  critical: '#EF4444',
  unknown: '#9CA3AF',
}

/**
 * One labeled chip. Built from a rounded-rect background, a circular
 * health pill, and a text label. Width is approximated from the text
 * length — a small constant-per-char is enough precision for a chip that
 * never exceeds ~10 characters (`"999/999"` is the worst realistic case).
 */
function OccupancyChip({
  x,
  y,
  color,
  text,
  health,
}: {
  x: number
  y: number
  color: string
  text: string
  health: NeighborhoodHealth
}) {
  const approxTextWidth = text.length * 7
  const width =
    CHIP_PAD_X + PILL_WIDTH + PILL_GAP + approxTextWidth + CHIP_PAD_X
  const height = CHIP_PAD_Y * 2 + Math.max(PILL_HEIGHT, CHIP_FONT_SIZE) + 2

  return (
    <Group x={x} y={y}>
      <Rect
        width={width}
        height={height}
        cornerRadius={height / 2}
        fill="#FFFFFF"
        stroke={color}
        strokeWidth={1}
        shadowColor="#000000"
        shadowBlur={2}
        shadowOpacity={0.08}
        shadowOffset={{ x: 0, y: 1 }}
      />
      <Rect
        x={CHIP_PAD_X}
        y={(height - PILL_HEIGHT) / 2}
        width={PILL_WIDTH}
        height={PILL_HEIGHT}
        cornerRadius={PILL_HEIGHT / 2}
        fill={HEALTH_FILL[health]}
      />
      <Text
        x={CHIP_PAD_X + PILL_WIDTH + PILL_GAP}
        y={(height - CHIP_FONT_SIZE) / 2}
        text={text}
        fontSize={CHIP_FONT_SIZE}
        fontStyle="bold"
        fill="#111827"
      />
    </Group>
  )
}

/**
 * Axis-aligned union of every element's AABB, matching the same
 * center-origin convention used everywhere else in the editor. Returns
 * null if no ids resolved to a known element.
 */
function seatBounds(
  ids: string[],
  elements: Record<string, CanvasElement>,
): { top: number; left: number } | null {
  let minX = Infinity
  let minY = Infinity
  let hit = false
  for (const id of ids) {
    const el = elements[id]
    if (!el) continue
    if (!isAssignableElement(el)) continue
    const halfW = el.width / 2
    const halfH = el.height / 2
    const elLeft = el.x - halfW
    const elTop = el.y - halfH
    if (elLeft < minX) minX = elLeft
    if (elTop < minY) minY = elTop
    hit = true
  }
  if (!hit) return null
  return { top: minY, left: minX }
}
