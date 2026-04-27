import { Group, Circle, Path } from 'react-konva'
import { useNetworkTopologyStore } from '../../../stores/networkTopologyStore'
import { findTopologyNodeForElement } from '../../../lib/networkTopologyLinkage'

/**
 * M6.6 — Konva-side "linked to topology" badge for IT-device floor
 * elements.
 *
 * Shows a small emerald disc with a stylised "network" glyph in the
 * top-right corner of an element when some topology node references it.
 * The glyph is hand-pathed (rather than rendered through @react-konva
 * + an SVG) because Konva's renderer doesn't accept SVG sources
 * directly, and inlining a Path stays in canvas-land — no DOM, no
 * extra layout.
 *
 * The badge is purely cosmetic: it has no click target (Konva's hit
 * region defaults to the rendered shapes; we set `listening={false}`
 * on the Group). Selection / properties navigation already happens
 * through clicking the underlying element. The badge just signals
 * "this device is on the network diagram" at canvas zoom levels that
 * keep the badge readable.
 *
 * Sizing:
 *   - The badge anchor is the top-right corner of the element bounds.
 *   - Diameter scales with the smaller of width/height but is clamped
 *     to a [6, 12] window so a tiny outlet doesn't get an oversized
 *     badge and a large display doesn't get a microscopic one.
 *   - The glyph radii scale off the badge radius so the shape rhythm
 *     stays consistent across zoom levels.
 */

interface Props {
  elementId: string
  elementWidth: number
  elementHeight: number
}

export function TopologyLinkBadge({ elementId, elementWidth, elementHeight }: Props) {
  const topology = useNetworkTopologyStore((s) => s.topology)
  const linkedNode = findTopologyNodeForElement(topology, elementId)
  if (!linkedNode) return null

  const minDim = Math.min(elementWidth, elementHeight)
  const r = Math.max(6, Math.min(12, minDim * 0.18))
  // Anchor the badge at the top-right corner. `Group` has its own
  // origin at the element center, so the corner offset is +w/2, -h/2.
  const cx = elementWidth / 2
  const cy = -elementHeight / 2

  return (
    <Group x={cx} y={cy} listening={false}>
      {/* White ring — sits behind the disc so the badge keeps a clean
          edge when the underlying element is the same hue. */}
      <Circle radius={r + 1.25} fill="#ffffff" opacity={0.95} />
      {/* Emerald disc. Color matches the topology node's MapPin badge
          (`bg-emerald-500`) so a user moving between the canvas + the
          topology page sees the same visual vocabulary. */}
      <Circle radius={r} fill="#10B981" />
      {/* Network glyph — three dots connected by lines. We approximate
          Lucide's `Network` icon shape with a small Path. The viewBox
          of Lucide is 24×24 and our badge fits in 2r — the scale
          factor makes the glyph occupy roughly 60% of the disc. */}
      <Path
        x={-r * 0.45}
        y={-r * 0.45}
        scaleX={(r * 0.9) / 24}
        scaleY={(r * 0.9) / 24}
        // Three boxes (one top-center, two bottom corners) connected
        // by short lines — recognisable as a "network" hierarchy at
        // small sizes. Using stroke-only keeps the white-on-emerald
        // contrast crisp at any zoom level.
        data="M9 2 H15 V8 H9 Z M2 16 H8 V22 H2 Z M16 16 H22 V22 H16 Z M12 8 V12 M5 16 V12 H19 V16"
        stroke="#ffffff"
        strokeWidth={2}
        fill="transparent"
        lineJoin="round"
        lineCap="round"
      />
    </Group>
  )
}
