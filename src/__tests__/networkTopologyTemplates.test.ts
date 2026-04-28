import { describe, it, expect } from 'vitest'
import {
  buildTopologyFromTemplate,
  buildTopologyTemplate,
  getTopologyTemplate,
  listTopologyTemplates,
  type TopologyTemplateId,
} from '../lib/networkTopology/templates'
import {
  isTopologyEdgeType,
  isTopologyNodeType,
} from '../types/networkTopology'

describe('listTopologyTemplates', () => {
  it('exposes the three M6.5 starter templates with non-empty metadata', () => {
    const templates = listTopologyTemplates()
    expect(templates.map((t) => t.id)).toEqual([
      'single-site-smb',
      'hq-and-branch',
      'hub-and-spoke-3',
    ])
    for (const t of templates) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.tagline.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.nodeCount).toBeGreaterThan(0)
      expect(t.edgeCount).toBeGreaterThan(0)
    }
  })

  it('node + edge counts grow monotonically (smaller first)', () => {
    const [smb, hq, hub] = listTopologyTemplates()
    expect(smb.nodeCount).toBeLessThan(hq.nodeCount)
    expect(hq.nodeCount).toBeLessThan(hub.nodeCount)
  })
})

describe('getTopologyTemplate', () => {
  it('returns metadata for known ids', () => {
    expect(getTopologyTemplate('single-site-smb')?.name).toBe('Single-site SMB')
    expect(getTopologyTemplate('hq-and-branch')?.name).toBe('HQ + branch')
    expect(getTopologyTemplate('hub-and-spoke-3')?.name).toBe(
      'Hub-and-spoke (3 branches)',
    )
  })

  it('returns null for unknown ids', () => {
    expect(getTopologyTemplate('does-not-exist' as TopologyTemplateId)).toBeNull()
  })
})

const ALL_IDS: TopologyTemplateId[] = [
  'single-site-smb',
  'hq-and-branch',
  'hub-and-spoke-3',
]

describe('buildTopologyTemplate — structure', () => {
  it.each(ALL_IDS)('%s emits valid node + edge types', (id) => {
    const { nodes, edges } = buildTopologyTemplate(id)
    for (const n of nodes) {
      expect(isTopologyNodeType(n.type)).toBe(true)
    }
    for (const e of edges) {
      expect(isTopologyEdgeType(e.type)).toBe(true)
    }
  })

  it.each(ALL_IDS)('%s edges only reference nodes in the same build', (id) => {
    const { nodes, edges } = buildTopologyTemplate(id)
    const ids = new Set(nodes.map((n) => n.id))
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    }
  })

  it.each(ALL_IDS)('%s has unique node + edge ids', (id) => {
    const { nodes, edges } = buildTopologyTemplate(id)
    const nodeIds = new Set(nodes.map((n) => n.id))
    const edgeIds = new Set(edges.map((e) => e.id))
    expect(nodeIds.size).toBe(nodes.length)
    expect(edgeIds.size).toBe(edges.length)
  })

  it.each(ALL_IDS)('%s sets every node to status="planned"', (id) => {
    const { nodes } = buildTopologyTemplate(id)
    for (const n of nodes) {
      expect(n.status).toBe('planned')
    }
  })

  it.each(ALL_IDS)('%s places nodes at (0, 0) so auto-layout can resolve', (id) => {
    const { nodes } = buildTopologyTemplate(id)
    for (const n of nodes) {
      expect(n.position).toEqual({ x: 0, y: 0 })
    }
  })

  it.each(ALL_IDS)('%s tags Meraki devices with vendor="Cisco Meraki"', (id) => {
    const { nodes } = buildTopologyTemplate(id)
    // Every modelled device should be Meraki; un-modelled (ISP, generic
    // endpoint group) leave vendor null.
    for (const n of nodes) {
      if (n.model) expect(n.vendor).toBe('Cisco Meraki')
    }
  })
})

describe('buildTopologyTemplate — single-site SMB shape', () => {
  it('contains the canonical 8-layer stack', () => {
    const { nodes, edges } = buildTopologyTemplate('single-site-smb')
    const types = nodes.map((n) => n.type).sort()
    // 1 isp, 1 firewall, 1 cloud, 1 core, 2 edge, 3 ap, 1 endpoints
    expect(types).toEqual(
      [
        'access-point',
        'access-point',
        'access-point',
        'cloud',
        'core-switch',
        'edge-switch',
        'edge-switch',
        'endpoint-group',
        'firewall',
        'isp',
      ].sort(),
    )
    expect(nodes.length).toBe(10)
    expect(edges.length).toBe(9)
  })

  it('wires ISP → firewall via WAN', () => {
    const { nodes, edges } = buildTopologyTemplate('single-site-smb')
    const isp = nodes.find((n) => n.type === 'isp')!
    const fw = nodes.find((n) => n.type === 'firewall')!
    const wan = edges.find((e) => e.source === isp.id && e.target === fw.id)
    expect(wan?.type).toBe('wan')
  })

  it('wires firewall → cloud via cloud-mgmt', () => {
    const { nodes, edges } = buildTopologyTemplate('single-site-smb')
    const fw = nodes.find((n) => n.type === 'firewall')!
    const cloud = nodes.find((n) => n.type === 'cloud')!
    const mgmt = edges.find((e) => e.source === fw.id && e.target === cloud.id)
    expect(mgmt?.type).toBe('cloud-mgmt')
  })
})

describe('buildTopologyTemplate — hq-and-branch shape', () => {
  it('has two ISPs and two firewalls (one per site) but a single shared cloud', () => {
    const { nodes } = buildTopologyTemplate('hq-and-branch')
    expect(nodes.filter((n) => n.type === 'isp').length).toBe(2)
    expect(nodes.filter((n) => n.type === 'firewall').length).toBe(2)
    expect(nodes.filter((n) => n.type === 'cloud').length).toBe(1)
  })

  it('both firewalls report into the same cloud node', () => {
    const { nodes, edges } = buildTopologyTemplate('hq-and-branch')
    const cloud = nodes.find((n) => n.type === 'cloud')!
    const mgmtEdges = edges.filter(
      (e) => e.target === cloud.id && e.type === 'cloud-mgmt',
    )
    expect(mgmtEdges.length).toBe(2)
  })
})

describe('buildTopologyTemplate — hub-and-spoke-3 shape', () => {
  it('has 4 ISPs, 4 firewalls (1 hub + 3 branches), 1 core, 1 cloud', () => {
    const { nodes } = buildTopologyTemplate('hub-and-spoke-3')
    expect(nodes.filter((n) => n.type === 'isp').length).toBe(4)
    expect(nodes.filter((n) => n.type === 'firewall').length).toBe(4)
    expect(nodes.filter((n) => n.type === 'core-switch').length).toBe(1)
    expect(nodes.filter((n) => n.type === 'cloud').length).toBe(1)
  })

  it('every firewall has a cloud-mgmt edge into the cloud node', () => {
    const { nodes, edges } = buildTopologyTemplate('hub-and-spoke-3')
    const cloud = nodes.find((n) => n.type === 'cloud')!
    const firewalls = nodes.filter((n) => n.type === 'firewall')
    for (const fw of firewalls) {
      const mgmt = edges.find(
        (e) => e.source === fw.id && e.target === cloud.id && e.type === 'cloud-mgmt',
      )
      expect(mgmt).toBeDefined()
    }
  })
})

describe('buildTopologyTemplate — fresh ids per call', () => {
  it('two consecutive calls produce disjoint id sets', () => {
    const a = buildTopologyTemplate('single-site-smb')
    const b = buildTopologyTemplate('single-site-smb')
    const aIds = new Set(a.nodes.map((n) => n.id))
    for (const n of b.nodes) {
      expect(aIds.has(n.id)).toBe(false)
    }
  })
})

describe('buildTopologyFromTemplate', () => {
  it('produces a valid NetworkTopology backed by the same nodes + edges', () => {
    const t = buildTopologyFromTemplate('office-x', 'single-site-smb')
    expect(t.officeId).toBe('office-x')
    expect(Object.keys(t.nodes).length).toBe(10)
    expect(Object.keys(t.edges).length).toBe(9)
    expect(t.layoutLocked).toBe(false)
  })

  it('throws on unknown template id', () => {
    expect(() =>
      buildTopologyFromTemplate('o', 'nope' as TopologyTemplateId),
    ).toThrow(/Unknown topology template/i)
  })
})
