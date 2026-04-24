/**
 * Colored department chip for the roster table. Background uses the
 * department's hex color at ~15% opacity; foreground uses the same color
 * at full saturation (slightly darkened to stay legible on light tints).
 * Unassigned departments render a neutral gray chip with an em-dash.
 */

/**
 * Parse a `#rrggbb` / `#rgb` hex string to an `rgb()` triple. Returns null
 * for malformed input so the caller can fall back to a neutral swatch.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const trimmed = hex.trim().replace(/^#/, '')
  if (trimmed.length === 3) {
    const r = parseInt(trimmed[0] + trimmed[0], 16)
    const g = parseInt(trimmed[1] + trimmed[1], 16)
    const b = parseInt(trimmed[2] + trimmed[2], 16)
    if ([r, g, b].some(Number.isNaN)) return null
    return { r, g, b }
  }
  if (trimmed.length === 6) {
    const r = parseInt(trimmed.slice(0, 2), 16)
    const g = parseInt(trimmed.slice(2, 4), 16)
    const b = parseInt(trimmed.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return null
    return { r, g, b }
  }
  return null
}

/**
 * Darken an rgb triple by a linear factor so foreground text stays legible
 * on a 15%-tinted backdrop of the same hue. 0.6 matches the "text-emerald-700
 * on emerald-50" contrast ratio we use on the status pill.
 */
function darken({ r, g, b }: { r: number; g: number; b: number }, factor = 0.55) {
  return {
    r: Math.round(r * factor),
    g: Math.round(g * factor),
    b: Math.round(b * factor),
  }
}

export function DepartmentChip({
  department,
  color,
}: {
  department: string | null
  color: string | null
}) {
  if (!department) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2.5 py-0.5 text-xs font-medium">
        —
      </span>
    )
  }
  const rgb = color ? hexToRgb(color) : null
  if (!rgb) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-medium">
        {department}
      </span>
    )
  }
  const fg = darken(rgb, 0.55)
  const bgStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`
  const fgStyle = `rgb(${fg.r}, ${fg.g}, ${fg.b})`
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bgStyle, color: fgStyle }}
    >
      {department}
    </span>
  )
}
