/**
 * M6.1 — Network Topology types.
 *
 * Floorcraft's Network Topology page (`/t/:teamSlug/o/:officeSlug/network`)
 * is a NEW surface, sibling to the floor plan. Where the floor plan
 * answers "how is the office laid out physically?", the topology page
 * answers "how is the network laid out logically?": ISP → WAN switch →
 * firewall → core → distribution → access → endpoints, with typed
 * connections that drive a Bill Of Materials in M6.3 and a PDF
 * deliverable in M6.4.
 *
 * The shape lives in its own file because:
 *
 *   1. The floor-plan canvas (`elementsStore`, `elements.ts`) is a
 *      Konva-driven 2D layout. The topology canvas is a react-flow graph.
 *      They share concepts ("nodes", "edges") but the runtime libraries
 *      and the persistence shape are independent — coupling them would
 *      drag react-flow into every floor-plan code path.
 *   2. M6.6 will introduce a *bidirectional* link between a topology
 *      node (e.g. an access point) and a floor-plan element of type
 *      `access-point`. That link is a single optional id reference
 *      (`floorElementId`) rather than a structural merge, so the two
 *      models stay independent and the link is a thin "soft join".
 *
 * # Persistence
 *
 * The `NetworkTopology` value rides as a top-level `networkTopology` key
 * on the office payload, alongside `floors` / `employees` /
 * `neighborhoods` / `annotations`. Legacy payloads predate the feature
 * and simply omit the key — the load path back-fills an empty topology
 * (see `migrateNetworkTopology` in `loadFromLegacyPayload.ts`).
 */

/**
 * Logical layers in a Cisco Meraki / enterprise IT topology, ordered
 * roughly top-to-bottom in the canonical layout:
 *
 *   isp           — ISP / WAN circuit endpoint (top of the diagram)
 *   wan-switch    — WAN switch (e.g. MS130-8X)
 *   firewall      — Firewall (e.g. MX450)
 *   cloud         — Cloud management plane (Meraki Cloud, Azure AD…)
 *   core-switch   — Core switch (e.g. MS150-24MP-4X)
 *   edge-switch   — Edge / distribution switch (e.g. MS130-24X)
 *   access-point  — Wi-Fi AP (e.g. CW9176I)
 *   endpoint-group — Aggregate endpoint cluster (laptops, phones, etc.)
 *
 * The list is closed: M6.5 (templates) will pre-populate node sets out
 * of these eight types, so adding a new type is a deliberate change
 * rather than a free-form extension.
 */
export type TopologyNodeType =
  | 'isp'
  | 'wan-switch'
  | 'firewall'
  | 'cloud'
  | 'core-switch'
  | 'edge-switch'
  | 'access-point'
  | 'endpoint-group'

/**
 * Typed connections between topology nodes. Each maps to a stroke color
 * + line style in `TopologyEdge.tsx` and a legend entry in the BOM. The
 * names mirror the Cisco/Meraki vendor terminology so an IT consumer
 * can read the diagram without translation.
 *
 *   wan              — ISP/WAN circuit (cyan)
 *   sfp-10g          — 10G SFP+ uplink (blue)
 *   fiber-10g        — 10G fiber backbone (green)
 *   sfp-distribution — 10G SFP+ core to edge (purple)
 *   poe              — PoE + data to APs (light blue)
 *   cloud-mgmt       — Cloud management (dashed teal)
 */
export type TopologyEdgeType =
  | 'wan'
  | 'sfp-10g'
  | 'fiber-10g'
  | 'sfp-distribution'
  | 'poe'
  | 'cloud-mgmt'

/**
 * Operational state of a topology node. Mirrors the M1
 * `deviceStatus` enum on floor-plan IT elements so a node linked
 * to a physical device (M6.6) inherits the same vocabulary —
 * "live" means the gear is racked and serving traffic; "broken"
 * means it's failing/down; "decommissioned" is end-of-life.
 */
export type TopologyNodeStatus =
  | 'planned'
  | 'installed'
  | 'live'
  | 'decommissioned'
  | 'broken'

const NODE_TYPES: readonly TopologyNodeType[] = [
  'isp',
  'wan-switch',
  'firewall',
  'cloud',
  'core-switch',
  'edge-switch',
  'access-point',
  'endpoint-group',
] as const

const EDGE_TYPES: readonly TopologyEdgeType[] = [
  'wan',
  'sfp-10g',
  'fiber-10g',
  'sfp-distribution',
  'poe',
  'cloud-mgmt',
] as const

const NODE_STATUSES: readonly TopologyNodeStatus[] = [
  'planned',
  'installed',
  'live',
  'decommissioned',
  'broken',
] as const

/**
 * Type guard for `TopologyNodeType`. Used by the migration to drop
 * any unknown string seen on a hand-edited / future-incompatible
 * payload, rather than letting an invalid value propagate to the
 * react-flow renderer (which would render a default "unknown" node
 * and surface as a silent corruption).
 */
export function isTopologyNodeType(s: unknown): s is TopologyNodeType {
  return typeof s === 'string' && (NODE_TYPES as readonly string[]).includes(s)
}

/** Type guard for `TopologyEdgeType`. Same rationale as the node guard. */
export function isTopologyEdgeType(s: unknown): s is TopologyEdgeType {
  return typeof s === 'string' && (EDGE_TYPES as readonly string[]).includes(s)
}

/** Type guard for `TopologyNodeStatus`. */
export function isTopologyNodeStatus(s: unknown): s is TopologyNodeStatus {
  return typeof s === 'string' && (NODE_STATUSES as readonly string[]).includes(s)
}

export const TOPOLOGY_NODE_TYPES = NODE_TYPES
export const TOPOLOGY_EDGE_TYPES = EDGE_TYPES
export const TOPOLOGY_NODE_STATUSES = NODE_STATUSES

export interface TopologyNode {
  id: string
  type: TopologyNodeType
  label: string
  /** Optional vendor metadata that drives the BOM in M6.3. */
  model?: string | null
  sku?: string | null
  vendor?: string | null
  serialNumber?: string | null
  /**
   * When set, this node represents a physical device on a floor plan
   * (linked by element id from M1's IT layer). M6.6 wires the
   * bidirectional sync; M6.1 just stores the reference so a topology
   * node's "Linked to AP-12" field round-trips through save/load.
   */
  floorElementId?: string | null
  /** Operational state — same enum as M1's deviceStatus. */
  status?: TopologyNodeStatus | null
  /** Free-form notes — surfaced on hover / in the properties form. */
  notes?: string | null
  /** react-flow position (canvas-space). */
  position: { x: number; y: number }
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  type: TopologyEdgeType
  /**
   * Free-form label that renders along the edge — e.g. "10G SFP+",
   * "Port 24", or anything contextual.
   */
  label?: string | null
}

export interface NetworkTopology {
  /**
   * Stable id for the topology. We keep it as a free-form string
   * (rather than tying it to `officeId`) so a future "compare two
   * topologies" or "draft topology" feature has somewhere to hang.
   */
  id: string
  officeId: string
  nodes: Record<string, TopologyNode>
  edges: Record<string, TopologyEdge>
  /**
   * Optional snapshot of the layout the user has explicitly arranged
   * (M6.2 will use this to enable auto-layout overrides). When
   * `false`, an auto-layout pass is allowed to overwrite positions;
   * when `true`, the user has manually positioned nodes and the
   * auto-layout is locked out.
   */
  layoutLocked: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Create an empty topology for a given office. Used by the load path
 * when a payload omits the `networkTopology` key (legacy / brand-new
 * office) and by tests as a fixture builder.
 */
export function createEmptyTopology(officeId: string): NetworkTopology {
  const now = new Date().toISOString()
  return {
    id: `topology-${officeId}`,
    officeId,
    nodes: {},
    edges: {},
    layoutLocked: false,
    createdAt: now,
    updatedAt: now,
  }
}
