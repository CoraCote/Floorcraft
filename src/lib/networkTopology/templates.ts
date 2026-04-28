import { nanoid } from 'nanoid'
import type {
  NetworkTopology,
  TopologyEdge,
  TopologyEdgeType,
  TopologyNode,
  TopologyNodeType,
} from '../../types/networkTopology'
import { createEmptyTopology } from '../../types/networkTopology'

/**
 * M6.5 — Network topology templates.
 *
 * The blank-canvas problem on the topology page is real: a user clicks
 * "New topology" and stares at an empty grid. The eight node types and
 * six edge types are the right vocabulary, but knowing how an actual
 * Cisco Meraki stack hangs together is consultant knowledge — we want
 * to ship that knowledge as starter scaffolds.
 *
 * Each template builds a complete `{ nodes, edges }` payload with:
 *
 *   - Friendly labels (e.g. "Bellevue HQ Firewall", not "MX-1")
 *   - All `status: 'planned'` so the consumer knows nothing is live yet
 *   - Cisco Meraki vendor + a representative model on every device
 *   - Position `(0, 0)` placeholders — `applyAutoLayout()` resolves the
 *     final positions in the same dispatch tick as the apply.
 *
 * # Why pure builders (not fixture JSON)
 *
 * The templates need fresh `id` values on every apply (otherwise two
 * applies into the same topology would collide). A pure builder lets
 * us regenerate ids per call while keeping the structural shape under
 * version control. Tests can pin the structure (counts, types,
 * connectivity) without flaking on randomized ids.
 *
 * # How a template lands
 *
 * The dialog calls `applyTemplate(topology, template)` to get the new
 * `{ nodes, edges }` lists, then walks them through the store one
 * `addNode`/`addEdge` at a time so each one runs through the existing
 * validation. The dialog ALWAYS prompts before apply when the topology
 * is non-empty (template merges into the existing graph at the user's
 * request — we never silently wipe).
 */

export type TopologyTemplateId = 'single-site-smb' | 'hq-and-branch' | 'hub-and-spoke-3'

export interface TopologyTemplateSummary {
  id: TopologyTemplateId
  name: string
  description: string
  /** One-line tagline shown under the title in the dialog card. */
  tagline: string
  /** Counts surface in the card so users know what they're picking up. */
  nodeCount: number
  edgeCount: number
}

export interface TopologyTemplateBuild {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

interface NodeSpec {
  /** Stable token used for cross-references inside a single build. */
  key: string
  type: TopologyNodeType
  label: string
  model?: string
  vendor?: string
}

interface EdgeSpec {
  fromKey: string
  toKey: string
  type: TopologyEdgeType
  label?: string
}

// ---------------------------------------------------------------------------
// Template definitions (declarative — `buildTemplate` instantiates ids)
// ---------------------------------------------------------------------------

/**
 * Single-site SMB office. Mirrors Aircall's Bellevue reference
 * topology at a smaller scale: one ISP, one firewall, one core, two
 * edges, three APs, one endpoint group, plus a cloud-management
 * plane wired to the firewall.
 */
const SINGLE_SITE_SMB: { nodes: NodeSpec[]; edges: EdgeSpec[] } = {
  nodes: [
    { key: 'isp', type: 'isp', label: 'ISP / WAN circuit' },
    { key: 'fw', type: 'firewall', label: 'Office Firewall', model: 'MX450', vendor: 'Cisco Meraki' },
    { key: 'cloud', type: 'cloud', label: 'Cloud Management', vendor: 'Cisco Meraki' },
    { key: 'core', type: 'core-switch', label: 'Core Switch', model: 'MS150-24MP-4X', vendor: 'Cisco Meraki' },
    { key: 'edge-1', type: 'edge-switch', label: 'Edge Switch 1', model: 'MS130-24X', vendor: 'Cisco Meraki' },
    { key: 'edge-2', type: 'edge-switch', label: 'Edge Switch 2', model: 'MS130-24X', vendor: 'Cisco Meraki' },
    { key: 'ap-1', type: 'access-point', label: 'AP — Engineering', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'ap-2', type: 'access-point', label: 'AP — Sales', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'ap-3', type: 'access-point', label: 'AP — Lobby', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'endpoints', type: 'endpoint-group', label: 'Office Endpoints' },
  ],
  edges: [
    { fromKey: 'isp', toKey: 'fw', type: 'wan', label: 'WAN' },
    { fromKey: 'fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'fw', toKey: 'core', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'core', toKey: 'edge-1', type: 'sfp-distribution', label: '10G SFP+' },
    { fromKey: 'core', toKey: 'edge-2', type: 'sfp-distribution', label: '10G SFP+' },
    { fromKey: 'edge-1', toKey: 'ap-1', type: 'poe', label: 'PoE+' },
    { fromKey: 'edge-1', toKey: 'ap-2', type: 'poe', label: 'PoE+' },
    { fromKey: 'edge-2', toKey: 'ap-3', type: 'poe', label: 'PoE+' },
    { fromKey: 'edge-1', toKey: 'endpoints', type: 'poe', label: 'Workstations' },
  ],
}

/**
 * HQ + single branch. The branch is a downsized stack: one MX as
 * firewall, one edge switch, two APs, one endpoint group. Both sites
 * report into a shared cloud-management plane.
 */
const HQ_AND_BRANCH: { nodes: NodeSpec[]; edges: EdgeSpec[] } = {
  nodes: [
    // Cloud is the shared mgmt plane — sits at the top.
    { key: 'cloud', type: 'cloud', label: 'Cloud Management', vendor: 'Cisco Meraki' },
    // HQ
    { key: 'hq-isp', type: 'isp', label: 'HQ ISP' },
    { key: 'hq-fw', type: 'firewall', label: 'HQ Firewall', model: 'MX450', vendor: 'Cisco Meraki' },
    { key: 'hq-core', type: 'core-switch', label: 'HQ Core', model: 'MS150-24MP-4X', vendor: 'Cisco Meraki' },
    { key: 'hq-edge-1', type: 'edge-switch', label: 'HQ Edge 1', model: 'MS130-24X', vendor: 'Cisco Meraki' },
    { key: 'hq-edge-2', type: 'edge-switch', label: 'HQ Edge 2', model: 'MS130-24X', vendor: 'Cisco Meraki' },
    { key: 'hq-ap-1', type: 'access-point', label: 'HQ AP — Engineering', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'hq-ap-2', type: 'access-point', label: 'HQ AP — Sales', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'hq-ap-3', type: 'access-point', label: 'HQ AP — Lobby', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'hq-endpoints', type: 'endpoint-group', label: 'HQ Endpoints' },
    // Branch
    { key: 'br-isp', type: 'isp', label: 'Branch ISP' },
    { key: 'br-fw', type: 'firewall', label: 'Branch Firewall', model: 'MX85', vendor: 'Cisco Meraki' },
    { key: 'br-edge', type: 'edge-switch', label: 'Branch Edge', model: 'MS130-8X', vendor: 'Cisco Meraki' },
    { key: 'br-ap-1', type: 'access-point', label: 'Branch AP — Floor', model: 'MR46', vendor: 'Cisco Meraki' },
    { key: 'br-ap-2', type: 'access-point', label: 'Branch AP — Lobby', model: 'MR46', vendor: 'Cisco Meraki' },
    { key: 'br-endpoints', type: 'endpoint-group', label: 'Branch Endpoints' },
  ],
  edges: [
    // HQ stack
    { fromKey: 'hq-isp', toKey: 'hq-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'hq-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'hq-fw', toKey: 'hq-core', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'hq-core', toKey: 'hq-edge-1', type: 'sfp-distribution', label: '10G SFP+' },
    { fromKey: 'hq-core', toKey: 'hq-edge-2', type: 'sfp-distribution', label: '10G SFP+' },
    { fromKey: 'hq-edge-1', toKey: 'hq-ap-1', type: 'poe', label: 'PoE+' },
    { fromKey: 'hq-edge-1', toKey: 'hq-ap-2', type: 'poe', label: 'PoE+' },
    { fromKey: 'hq-edge-2', toKey: 'hq-ap-3', type: 'poe', label: 'PoE+' },
    { fromKey: 'hq-edge-1', toKey: 'hq-endpoints', type: 'poe', label: 'Workstations' },
    // Branch stack
    { fromKey: 'br-isp', toKey: 'br-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'br-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'br-fw', toKey: 'br-edge', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'br-edge', toKey: 'br-ap-1', type: 'poe', label: 'PoE+' },
    { fromKey: 'br-edge', toKey: 'br-ap-2', type: 'poe', label: 'PoE+' },
    { fromKey: 'br-edge', toKey: 'br-endpoints', type: 'poe', label: 'Workstations' },
  ],
}

/**
 * Hub-and-spoke with three branches. The hub is a full HQ stack; each
 * branch is a minimal two-device site (firewall + edge + AP +
 * endpoints) reporting into the shared cloud plane. Useful as a
 * starter for multi-site IT planning where each branch will be
 * fleshed out individually.
 */
const HUB_AND_SPOKE_3: { nodes: NodeSpec[]; edges: EdgeSpec[] } = {
  nodes: [
    { key: 'cloud', type: 'cloud', label: 'Cloud Management', vendor: 'Cisco Meraki' },
    // Hub
    { key: 'hub-isp', type: 'isp', label: 'Hub ISP' },
    { key: 'hub-fw', type: 'firewall', label: 'Hub Firewall', model: 'MX450', vendor: 'Cisco Meraki' },
    { key: 'hub-core', type: 'core-switch', label: 'Hub Core', model: 'MS150-24MP-4X', vendor: 'Cisco Meraki' },
    { key: 'hub-edge', type: 'edge-switch', label: 'Hub Edge', model: 'MS130-24X', vendor: 'Cisco Meraki' },
    { key: 'hub-ap-1', type: 'access-point', label: 'Hub AP — Engineering', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'hub-ap-2', type: 'access-point', label: 'Hub AP — Sales', model: 'CW9176I', vendor: 'Cisco Meraki' },
    { key: 'hub-endpoints', type: 'endpoint-group', label: 'Hub Endpoints' },
    // Branch A
    { key: 'a-isp', type: 'isp', label: 'Branch A ISP' },
    { key: 'a-fw', type: 'firewall', label: 'Branch A Firewall', model: 'MX85', vendor: 'Cisco Meraki' },
    { key: 'a-edge', type: 'edge-switch', label: 'Branch A Edge', model: 'MS130-8X', vendor: 'Cisco Meraki' },
    { key: 'a-ap', type: 'access-point', label: 'Branch A AP', model: 'MR46', vendor: 'Cisco Meraki' },
    { key: 'a-endpoints', type: 'endpoint-group', label: 'Branch A Endpoints' },
    // Branch B
    { key: 'b-isp', type: 'isp', label: 'Branch B ISP' },
    { key: 'b-fw', type: 'firewall', label: 'Branch B Firewall', model: 'MX85', vendor: 'Cisco Meraki' },
    { key: 'b-edge', type: 'edge-switch', label: 'Branch B Edge', model: 'MS130-8X', vendor: 'Cisco Meraki' },
    { key: 'b-ap', type: 'access-point', label: 'Branch B AP', model: 'MR46', vendor: 'Cisco Meraki' },
    { key: 'b-endpoints', type: 'endpoint-group', label: 'Branch B Endpoints' },
    // Branch C
    { key: 'c-isp', type: 'isp', label: 'Branch C ISP' },
    { key: 'c-fw', type: 'firewall', label: 'Branch C Firewall', model: 'MX85', vendor: 'Cisco Meraki' },
    { key: 'c-edge', type: 'edge-switch', label: 'Branch C Edge', model: 'MS130-8X', vendor: 'Cisco Meraki' },
    { key: 'c-ap', type: 'access-point', label: 'Branch C AP', model: 'MR46', vendor: 'Cisco Meraki' },
    { key: 'c-endpoints', type: 'endpoint-group', label: 'Branch C Endpoints' },
  ],
  edges: [
    // Hub
    { fromKey: 'hub-isp', toKey: 'hub-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'hub-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'hub-fw', toKey: 'hub-core', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'hub-core', toKey: 'hub-edge', type: 'sfp-distribution', label: '10G SFP+' },
    { fromKey: 'hub-edge', toKey: 'hub-ap-1', type: 'poe', label: 'PoE+' },
    { fromKey: 'hub-edge', toKey: 'hub-ap-2', type: 'poe', label: 'PoE+' },
    { fromKey: 'hub-edge', toKey: 'hub-endpoints', type: 'poe', label: 'Workstations' },
    // Branch A
    { fromKey: 'a-isp', toKey: 'a-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'a-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'a-fw', toKey: 'a-edge', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'a-edge', toKey: 'a-ap', type: 'poe', label: 'PoE+' },
    { fromKey: 'a-edge', toKey: 'a-endpoints', type: 'poe', label: 'Workstations' },
    // Branch B
    { fromKey: 'b-isp', toKey: 'b-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'b-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'b-fw', toKey: 'b-edge', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'b-edge', toKey: 'b-ap', type: 'poe', label: 'PoE+' },
    { fromKey: 'b-edge', toKey: 'b-endpoints', type: 'poe', label: 'Workstations' },
    // Branch C
    { fromKey: 'c-isp', toKey: 'c-fw', type: 'wan', label: 'WAN' },
    { fromKey: 'c-fw', toKey: 'cloud', type: 'cloud-mgmt', label: 'Mgmt' },
    { fromKey: 'c-fw', toKey: 'c-edge', type: 'sfp-10g', label: '10G SFP+' },
    { fromKey: 'c-edge', toKey: 'c-ap', type: 'poe', label: 'PoE+' },
    { fromKey: 'c-edge', toKey: 'c-endpoints', type: 'poe', label: 'Workstations' },
  ],
}

interface InternalTemplate {
  id: TopologyTemplateId
  name: string
  tagline: string
  description: string
  spec: { nodes: NodeSpec[]; edges: EdgeSpec[] }
}

const TEMPLATES: InternalTemplate[] = [
  {
    id: 'single-site-smb',
    name: 'Single-site SMB',
    tagline: 'One office, ~30–80 seats',
    description:
      'A typical small/mid office: ISP → MX firewall → core switch → two edge switches → three APs and an endpoint group, all managed via the Meraki cloud.',
    spec: SINGLE_SITE_SMB,
  },
  {
    id: 'hq-and-branch',
    name: 'HQ + branch',
    tagline: 'One HQ + one branch site',
    description:
      'HQ runs a full Meraki stack (firewall, core, two edges, three APs). The branch is a downsized firewall + edge + two APs. Both sites report to the same Meraki cloud plane.',
    spec: HQ_AND_BRANCH,
  },
  {
    id: 'hub-and-spoke-3',
    name: 'Hub-and-spoke (3 branches)',
    tagline: 'Hub + 3 spoke sites',
    description:
      'Multi-site starter — full hub stack plus three minimal branch stacks (firewall + edge + AP each). Ideal as a scaffold to flesh each branch out individually.',
    spec: HUB_AND_SPOKE_3,
  },
]

/**
 * List of templates surfaced in the dialog (id + counts + tagline).
 * The full `nodes`/`edges` only materialise when the user picks one
 * and `buildTemplate` runs.
 */
export function listTopologyTemplates(): TopologyTemplateSummary[] {
  return TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    nodeCount: t.spec.nodes.length,
    edgeCount: t.spec.edges.length,
  }))
}

/**
 * Look up a template by id. Returns null if the id is unknown — the
 * dialog renders against `listTopologyTemplates()` so this only fires
 * when a caller hand-writes an id (e.g. a deep-link in the future).
 */
export function getTopologyTemplate(id: TopologyTemplateId): TopologyTemplateSummary | null {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) return null
  return {
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    nodeCount: t.spec.nodes.length,
    edgeCount: t.spec.edges.length,
  }
}

/**
 * Build a fresh `{ nodes, edges }` payload for the named template.
 * Every call returns brand-new ids so applying the same template
 * twice into the same topology produces two disjoint sub-graphs
 * rather than colliding ids. Positions are placeholder `(0, 0)` —
 * the apply path runs `applyAutoLayout()` after insertion.
 */
export function buildTopologyTemplate(id: TopologyTemplateId): TopologyTemplateBuild {
  const template = TEMPLATES.find((t) => t.id === id)
  if (!template) {
    throw new Error(`Unknown topology template id: ${id}`)
  }
  const idByKey = new Map<string, string>()
  const nodes: TopologyNode[] = template.spec.nodes.map((spec) => {
    const nodeId = `node-${nanoid(8)}`
    idByKey.set(spec.key, nodeId)
    const node: TopologyNode = {
      id: nodeId,
      type: spec.type,
      label: spec.label,
      vendor: spec.vendor ?? null,
      model: spec.model ?? null,
      sku: null,
      serialNumber: null,
      floorElementId: null,
      status: 'planned',
      notes: null,
      position: { x: 0, y: 0 },
    }
    return node
  })
  const edges: TopologyEdge[] = template.spec.edges.map((spec) => {
    const source = idByKey.get(spec.fromKey)
    const target = idByKey.get(spec.toKey)
    if (!source || !target) {
      throw new Error(
        `Template "${id}" has dangling edge ${spec.fromKey} → ${spec.toKey}`,
      )
    }
    return {
      id: `edge-${nanoid(8)}`,
      source,
      target,
      type: spec.type,
      label: spec.label ?? null,
    }
  })
  return { nodes, edges }
}

/**
 * Convenience for tests that want a `NetworkTopology` directly. Not
 * called from the dialog (the dialog walks nodes/edges through the
 * store one at a time so each one runs validation + autosave).
 */
export function buildTopologyFromTemplate(
  officeId: string,
  id: TopologyTemplateId,
): NetworkTopology {
  const t = createEmptyTopology(officeId)
  const { nodes, edges } = buildTopologyTemplate(id)
  for (const n of nodes) t.nodes[n.id] = n
  for (const e of edges) t.edges[e.id] = e
  return t
}
