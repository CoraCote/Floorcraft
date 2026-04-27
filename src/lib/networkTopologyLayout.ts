import type { TopologyNode, TopologyNodeType } from '../types/networkTopology'

/**
 * M6.2 — Layered layout for the Network Topology canvas.
 *
 * Floorcraft's topology page mirrors the "vertical bands" idiom of an
 * enterprise IT diagram (see the Aircall Bellevue Cisco Meraki PDF for
 * the canonical reference). The layout is a one-dimensional cascade —
 * Internet at the top, endpoints at the bottom, with each device family
 * occupying its own horizontal strip — that lets a reader follow
 * traffic by reading downward and lets the BOM (M6.3) group costs by
 * tier.
 *
 * # Why hand-rolled, not dagre/elkjs
 *
 * General-purpose graph layouts (dagre, elkjs, etc.) are excellent at
 * minimizing edge crossings on arbitrary DAGs but they pay for it in
 * bundle size (~80 KB minified each) and in surprising layout drift
 * when a single node is added. Our domain is constrained: there are
 * exactly seven bands, each band has a fixed Y, and within a band we
 * just need stable horizontal spacing. A hand-rolled placer is ~80
 * lines, deterministic, and adds zero dependencies — three properties
 * a general-purpose engine can't match for this surface.
 *
 * # Why bands, not a free graph
 *
 * IT consumers read a topology as a hierarchy: "where is the firewall
 * relative to the core?" is a more frequent question than "is this
 * graph planar?". A banded layout encodes the hierarchy in screen
 * space, so the diagram answers the hierarchy question without the
 * reader counting hops. Edges between bands are mostly vertical, which
 * `smoothstep` routing in `TopologyEdge` renders as right-angle paths —
 * the reader's eye follows them as a top-to-bottom flow.
 *
 * # Determinism
 *
 * Auto-layout fires on every "Auto-arrange" click and (in the unlocked
 * default) on every node-add. It MUST be deterministic so the user
 * doesn't see nodes reshuffle when the topology hasn't changed. We
 * sort within a band by `(label, id)` so ties on duplicate labels still
 * resolve deterministically, and the band assignment is a pure
 * function of `node.type`.
 */

/**
 * The 8 node types map to 7 horizontal bands. The firewall + cloud
 * pair share band 2 because the Aircall PDF shows the cloud
 * management plane as a sibling-of-firewall (a "side car" node) rather
 * than as its own tier. Putting them in the same band keeps the
 * vertical hierarchy at 7 strips — comfortable on a 13" laptop without
 * vertical scrolling.
 *
 * The list is the ONLY place where band order is encoded. Any future
 * reorder (e.g. swapping core-switch and edge-switch for a different
 * vendor reference) is a one-line change here.
 */
export const TOPOLOGY_LAYERS: ReadonlyArray<{
  band: number
  types: TopologyNodeType[]
}> = [
  { band: 0, types: ['isp'] },
  { band: 1, types: ['wan-switch'] },
  { band: 2, types: ['firewall', 'cloud'] }, // shared band — cloud sits left of firewalls
  { band: 3, types: ['core-switch'] },
  { band: 4, types: ['edge-switch'] },
  { band: 5, types: ['access-point'] },
  { band: 6, types: ['endpoint-group'] },
]

/**
 * Vertical distance between band centers, in canvas units. 140 keeps
 * the smoothstep edge between two bands long enough to render a clear
 * label pill without forcing the reader to track a long thin line.
 */
export const BAND_HEIGHT = 140

/**
 * Horizontal gap between sibling nodes in a band. 40 leaves enough
 * breathing room for a node card's drop shadow without spreading the
 * hierarchy so wide that two firewalls look unrelated.
 */
export const NODE_HORIZONTAL_GAP = 40

/**
 * Approximate width of a `TopologyNodeCard` from M6.1. We don't pull
 * the value out of the DOM because (a) we may run before mount and (b)
 * react-flow already snaps positions to a 12px grid, so a 220-unit
 * approximation is well within the visual tolerance.
 */
export const NODE_DEFAULT_WIDTH = 220

/**
 * Endpoints in the reference PDF cluster more tightly than the rest of
 * the diagram (it's a row of mixed laptop / phone / wired icons rather
 * than discrete switches). We tighten the gap for that band so the
 * cluster reads as one logical group.
 */
const ENDPOINT_BAND = 6
const ENDPOINT_GAP_FACTOR = 0.5

/**
 * Bucket nodes into bands. Returns a map keyed by band index plus a
 * separate list of off-canvas nodes — types we don't recognize. The
 * off-canvas bucket is defensive: the type system is closed
 * (`TopologyNodeType` is a finite union), but a hand-edited or
 * future-incompatible payload could carry a string the runtime
 * doesn't know about. Rather than crash or place at (0, 0) where the
 * node would overlap the ISP band, we render at band -1 (off-screen
 * to the top) so the QA path surfaces the orphan loudly.
 */
function bucketByBand(
  nodes: readonly TopologyNode[],
): { byBand: Map<number, TopologyNode[]>; offCanvas: TopologyNode[] } {
  const typeToBand = new Map<TopologyNodeType, number>()
  for (const layer of TOPOLOGY_LAYERS) {
    for (const t of layer.types) typeToBand.set(t, layer.band)
  }

  const byBand = new Map<number, TopologyNode[]>()
  const offCanvas: TopologyNode[] = []

  for (const node of nodes) {
    const band = typeToBand.get(node.type)
    if (band == null) {
      offCanvas.push(node)
      continue
    }
    const existing = byBand.get(band)
    if (existing) existing.push(node)
    else byBand.set(band, [node])
  }

  return { byBand, offCanvas }
}

/**
 * Sort a band's nodes for placement. Sort is by label, then id,
 * stable. The `(label, id)` tiebreak guarantees a duplicate-labelled
 * pair (e.g. two unnamed firewalls) doesn't reshuffle visually as the
 * user edits one of them.
 *
 * Special case: in the firewall+cloud shared band, cloud nodes sort
 * BEFORE firewall nodes regardless of label, so the typical
 * arrangement renders as `Cloud — Firewall A — Firewall B`. The
 * reference PDF uses this order; reading left-to-right matches the
 * cloud-management arrow flowing INTO the firewalls.
 */
function sortBandNodes(nodes: TopologyNode[]): TopologyNode[] {
  return [...nodes].sort((a, b) => {
    // Cloud nodes sort to the left of firewalls within the shared band.
    const aCloud = a.type === 'cloud' ? 0 : 1
    const bCloud = b.type === 'cloud' ? 0 : 1
    if (aCloud !== bCloud) return aCloud - bCloud

    const labelCmp = a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
    if (labelCmp !== 0) return labelCmp
    return a.id.localeCompare(b.id)
  })
}

/**
 * Compute the layered layout for the given nodes.
 *
 * Returns a position map keyed by node id that the caller applies as a
 * single batch state update. The pure-function shape (no side effects,
 * no I/O, no zustand reach-arounds) keeps the algorithm trivially
 * unit-testable and lets the store action treat layout as a transform
 * over its current state — see `applyAutoLayout` in
 * `networkTopologyStore.ts`.
 *
 * The `centerX` / `topY` defaults are chosen to land a typical
 * 4-band-wide topology comfortably inside the M6.1 canvas card with
 * room for the floating Properties panel on the right. Callers can
 * override either to fit a wider canvas (M6.4 PDF export will pass a
 * larger `centerX`).
 */
export function layeredLayout(
  nodes: Record<string, TopologyNode>,
  options?: {
    /** X coord of the topology center. Defaults to 600. */
    centerX?: number
    /** Y coord of the topology top (band 0 center). Defaults to 80. */
    topY?: number
  },
): Record<string, { x: number; y: number }> {
  const centerX = options?.centerX ?? 600
  const topY = options?.topY ?? 80

  const result: Record<string, { x: number; y: number }> = {}
  const allNodes = Object.values(nodes)
  if (allNodes.length === 0) return result

  const { byBand, offCanvas } = bucketByBand(allNodes)

  for (const [band, bandNodes] of byBand) {
    const sorted = sortBandNodes(bandNodes)
    const n = sorted.length
    const gap =
      band === ENDPOINT_BAND ? NODE_HORIZONTAL_GAP * ENDPOINT_GAP_FACTOR : NODE_HORIZONTAL_GAP

    // bandWidth = n * NODE_DEFAULT_WIDTH + (n - 1) * gap
    // Place node centers — `(NODE_DEFAULT_WIDTH + gap)` is the center-to-center
    // step. The leftmost node center sits at centerX - (bandWidth / 2 - NODE_DEFAULT_WIDTH / 2)
    // so the band as a whole is symmetric around centerX.
    const step = NODE_DEFAULT_WIDTH + gap
    const totalSpan = n === 1 ? 0 : (n - 1) * step
    const firstCenterX = centerX - totalSpan / 2
    const y = topY + band * BAND_HEIGHT

    for (let i = 0; i < n; i += 1) {
      const node = sorted[i]
      result[node.id] = {
        x: firstCenterX + i * step,
        y,
      }
    }
  }

  // Off-canvas: park at band -1 (above the ISP row) at increasing X,
  // so multiple orphans don't collide. Negative Y makes them visually
  // distinct in QA without breaking react-flow's positive-coord
  // assumptions for everything else.
  if (offCanvas.length > 0) {
    const y = topY + -1 * BAND_HEIGHT
    for (let i = 0; i < offCanvas.length; i += 1) {
      result[offCanvas[i].id] = {
        x: centerX + i * (NODE_DEFAULT_WIDTH + NODE_HORIZONTAL_GAP),
        y,
      }
    }
  }

  return result
}
