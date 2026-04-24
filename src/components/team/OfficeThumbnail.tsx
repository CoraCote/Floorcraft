/**
 * OfficeThumbnail — a tiny SVG preview of a floor plan shown at the top
 * of each office card on the team home page. Reads element bounding
 * boxes and renders one colored rect per element scaled into the
 * available viewBox. Purely visual — the real editor is one click away.
 *
 * We accept elements directly rather than re-using the full
 * `CanvasElement` type so the component works for any slimmed-down
 * thumbnail fixture (tests, storybook, etc.) without pulling in the
 * whole element discriminated union.
 */

export interface ThumbnailElement {
  x: number
  y: number
  width: number
  height: number
  type: string
}

interface Props {
  elements: ThumbnailElement[]
  /** Rendered width. Pass `'100%'` to stretch to the parent. */
  width?: number | string
  /** Rendered height. Pass `'100%'` to stretch to the parent. */
  height?: number | string
}

/**
 * Color per element category. Mirrors the `layerCategory` grouping in
 * spirit (structural / seating / rooms / other) but hard-coded here so
 * the thumbnail doesn't pull in the full `CanvasElement` type surface.
 */
function fillForType(type: string): string {
  switch (type) {
    // Seating
    case 'desk':
    case 'hot-desk':
    case 'workstation':
      return '#93C5FD' // blue-300
    // Walls / structural
    case 'wall':
    case 'door':
    case 'window':
      return '#6B7280' // gray-500
    // Rooms / neighborhoods
    case 'conference-room':
    case 'phone-booth':
    case 'common-area':
    case 'private-office':
    case 'room':
    case 'neighborhood':
    case 'zone':
      return '#FCD34D' // amber-300
    default:
      return '#D1D5DB' // gray-300
  }
}

export function OfficeThumbnail({ elements, width = 240, height = 120 }: Props) {
  if (!elements || elements.length === 0) {
    const vbW = typeof width === 'number' ? width : 240
    const vbH = typeof height === 'number' ? height : 120
    return (
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800"
        width={width}
        height={height}
        role="img"
        aria-label="Empty office"
      >
        <text
          x={vbW / 2}
          y={vbH / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="#9CA3AF"
        >
          Empty
        </text>
      </svg>
    )
  }

  // Compute a bounding box over element extents (x/y appear to be
  // top-left in the editor schema; we add width/height to get bottom-
  // right). Small padding so strokes don't clip the viewBox edge.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const w = el.width || 0
    const h = el.height || 0
    if (el.x < minX) minX = el.x
    if (el.y < minY) minY = el.y
    if (el.x + w > maxX) maxX = el.x + w
    if (el.y + h > maxY) maxY = el.y + h
  }
  // Fallback — every element was degenerate.
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0
    minY = 0
    maxX = 400
    maxY = 300
  }
  const pad = 8
  const vbX = minX - pad
  const vbY = minY - pad
  const vbW = Math.max(1, maxX - minX + pad * 2)
  const vbH = Math.max(1, maxY - minY + pad * 2)

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className="rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800"
      width={width}
      height={height}
      role="img"
      aria-label="Floor plan preview"
    >
      {elements.map((el, i) => (
        <rect
          key={i}
          x={el.x}
          y={el.y}
          width={Math.max(1, el.width)}
          height={Math.max(1, el.height)}
          fill={fillForType(el.type)}
          stroke="#9CA3AF"
          strokeOpacity={0.35}
          strokeWidth={Math.max(vbW, vbH) / 400}
        />
      ))}
    </svg>
  )
}
