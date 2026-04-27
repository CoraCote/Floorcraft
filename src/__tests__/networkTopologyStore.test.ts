/**
 * M6.1 — Network topology store actions.
 *
 * Locks down the small but load-bearing invariants the rest of the
 * page (and the persistence layer) relies on:
 *
 *   1. Hydration: setTopology / resetTopology install a topology in
 *      the expected shape.
 *   2. Node CRUD: addNode adds, updateNode merges, removeNode cascades
 *      to incident edges.
 *   3. Edge CRUD: addEdge guards against dangling references,
 *      updateEdge merges, removeEdge removes only the named edge.
 *   4. Position updates: setNodePosition only updates the position
 *      slice of the node (no other fields drift).
 *
 * The react-flow change-stream bridges (`applyNodeChanges` /
 * `applyEdgeChanges`) are exercised here too because they're the
 * paths that route drag and delete-key interactions into the store.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useNetworkTopologyStore } from '../stores/networkTopologyStore'
import { createEmptyTopology, type TopologyNode } from '../types/networkTopology'

const OFFICE = 'office-test'

function freshTopology() {
  useNetworkTopologyStore.setState({ topology: createEmptyTopology(OFFICE) })
}

function nodeFixture(id: string, x = 0, y = 0): TopologyNode {
  return {
    id,
    type: 'firewall',
    label: `Node ${id}`,
    position: { x, y },
    status: 'planned',
  }
}

describe('networkTopologyStore — hydration', () => {
  beforeEach(() => {
    useNetworkTopologyStore.setState({ topology: null })
  })

  it('setTopology replaces the current topology', () => {
    const t = createEmptyTopology(OFFICE)
    useNetworkTopologyStore.getState().setTopology(t)
    expect(useNetworkTopologyStore.getState().topology).toEqual(t)
  })

  it('resetTopology installs a fresh empty topology for the office', () => {
    useNetworkTopologyStore.getState().resetTopology(OFFICE)
    const t = useNetworkTopologyStore.getState().topology!
    expect(t.officeId).toBe(OFFICE)
    expect(t.nodes).toEqual({})
    expect(t.edges).toEqual({})
    expect(t.layoutLocked).toBe(false)
  })
})

describe('networkTopologyStore — node CRUD', () => {
  beforeEach(freshTopology)

  it('addNode inserts a node keyed by id', () => {
    useNetworkTopologyStore.getState().addNode(nodeFixture('n1'))
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']?.label).toBe('Node n1')
  })

  it('updateNode merges partial fields without dropping unspecified ones', () => {
    // Lock layout first so addNode does not auto-arrange (M6.2). The
    // M6.1 invariant under test is that updateNode preserves the
    // existing position; auto-layout would mask that.
    useNetworkTopologyStore.setState({
      topology: { ...useNetworkTopologyStore.getState().topology!, layoutLocked: true },
    })
    useNetworkTopologyStore.getState().addNode(nodeFixture('n1'))
    useNetworkTopologyStore.getState().updateNode('n1', { model: 'MX450', vendor: 'Cisco' })
    const n = useNetworkTopologyStore.getState().topology?.nodes['n1']
    expect(n?.model).toBe('MX450')
    expect(n?.vendor).toBe('Cisco')
    expect(n?.label).toBe('Node n1')
    expect(n?.position).toEqual({ x: 0, y: 0 })
  })

  it('removeNode drops the node and cascades to incident edges', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addNode(nodeFixture('c'))
    s.addEdge({ id: 'e-ab', source: 'a', target: 'b', type: 'sfp-10g' })
    s.addEdge({ id: 'e-bc', source: 'b', target: 'c', type: 'sfp-10g' })
    s.addEdge({ id: 'e-ac', source: 'a', target: 'c', type: 'sfp-10g' })

    s.removeNode('b')
    const t = useNetworkTopologyStore.getState().topology!
    expect(Object.keys(t.nodes).sort()).toEqual(['a', 'c'])
    // Both edges that touched 'b' are gone; e-ac (a → c) survives.
    expect(Object.keys(t.edges)).toEqual(['e-ac'])
  })

  it('setNodePosition only changes position', () => {
    useNetworkTopologyStore
      .getState()
      .addNode({ ...nodeFixture('n1', 10, 20), model: 'MX450' })
    useNetworkTopologyStore.getState().setNodePosition('n1', 100, 200)
    const n = useNetworkTopologyStore.getState().topology?.nodes['n1']
    expect(n?.position).toEqual({ x: 100, y: 200 })
    expect(n?.model).toBe('MX450')
  })
})

describe('networkTopologyStore — edge CRUD', () => {
  beforeEach(freshTopology)

  it('addEdge refuses dangling source/target references', () => {
    useNetworkTopologyStore.getState().addNode(nodeFixture('a'))
    useNetworkTopologyStore
      .getState()
      .addEdge({ id: 'e1', source: 'a', target: 'missing', type: 'sfp-10g' })
    expect(useNetworkTopologyStore.getState().topology?.edges).toEqual({})
  })

  it('addEdge inserts when both endpoints exist', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g', label: 'Port 1' })
    const e = useNetworkTopologyStore.getState().topology?.edges['e1']
    expect(e?.source).toBe('a')
    expect(e?.target).toBe('b')
    expect(e?.label).toBe('Port 1')
  })

  it('updateEdge merges partial fields', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g' })
    s.updateEdge('e1', { type: 'fiber-10g', label: '10G' })
    const e = useNetworkTopologyStore.getState().topology?.edges['e1']
    expect(e?.type).toBe('fiber-10g')
    expect(e?.label).toBe('10G')
  })

  it('removeEdge removes only the named edge', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g' })
    s.addEdge({ id: 'e2', source: 'b', target: 'a', type: 'poe' })
    s.removeEdge('e1')
    expect(Object.keys(useNetworkTopologyStore.getState().topology!.edges)).toEqual(['e2'])
  })
})

describe('networkTopologyStore — react-flow change bridges', () => {
  beforeEach(freshTopology)

  it('applyNodeChanges with type=position updates the node position', () => {
    useNetworkTopologyStore.getState().addNode(nodeFixture('n1', 0, 0))
    useNetworkTopologyStore.getState().applyNodeChanges([
      { type: 'position', id: 'n1', position: { x: 50, y: 75 } },
    ])
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']?.position).toEqual({
      x: 50,
      y: 75,
    })
  })

  it('applyNodeChanges with type=remove cascades to incident edges', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g' })
    s.applyNodeChanges([{ type: 'remove', id: 'a' }])
    expect(Object.keys(useNetworkTopologyStore.getState().topology!.nodes)).toEqual(['b'])
    expect(useNetworkTopologyStore.getState().topology!.edges).toEqual({})
  })

  it('applyNodeChanges ignores unrelated change types (select, dimensions)', () => {
    useNetworkTopologyStore.getState().addNode(nodeFixture('n1', 5, 5))
    const before = useNetworkTopologyStore.getState().topology
    useNetworkTopologyStore.getState().applyNodeChanges([
      { type: 'select', id: 'n1', selected: true },
    ])
    // Topology slice should not have been mutated by a select-only change.
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']).toEqual(
      before?.nodes['n1'],
    )
  })

  it('applyEdgeChanges with type=remove drops the edge', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g' })
    s.applyEdgeChanges([{ type: 'remove', id: 'e1' }])
    expect(useNetworkTopologyStore.getState().topology!.edges).toEqual({})
  })
})

describe('networkTopologyStore — persistence shape', () => {
  beforeEach(freshTopology)

  it('JSON-stringify round-trip preserves nodes + edges + layoutLocked', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode(nodeFixture('a'))
    s.addNode(nodeFixture('b'))
    s.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'sfp-10g', label: 'uplink' })
    const t = useNetworkTopologyStore.getState().topology!
    const round = JSON.parse(JSON.stringify(t))
    expect(round.nodes.a.label).toBe('Node a')
    expect(round.edges.e1.label).toBe('uplink')
    expect(round.layoutLocked).toBe(false)
  })
})

/**
 * M6.2 — auto-layout + drag-to-lock. Locks down the four interaction
 * properties from the milestone spec:
 *
 *   1. `applyAutoLayout` updates every node's position to its
 *      band-correct slot.
 *   2. Auto-layout clears `layoutLocked`.
 *   3. A position change in the react-flow change stream (drag) flips
 *      `layoutLocked` to true; further `addNode` calls leave existing
 *      positions intact.
 *   4. `addNode` on an unlocked topology auto-arranges; `addNode` on a
 *      locked topology preserves the requested position.
 */
describe('networkTopologyStore — M6.2 auto-layout', () => {
  beforeEach(freshTopology)

  it('applyAutoLayout updates every node position', () => {
    const s = useNetworkTopologyStore.getState()
    // Seed nodes by setting state directly to avoid addNode's
    // auto-arrange — we want to prove applyAutoLayout MOVES them.
    useNetworkTopologyStore.setState({
      topology: {
        ...useNetworkTopologyStore.getState().topology!,
        nodes: {
          isp1: { id: 'isp1', type: 'isp', label: 'ISP 1', position: { x: 0, y: 0 } },
          fw1: { id: 'fw1', type: 'firewall', label: 'FW 1', position: { x: 0, y: 0 } },
        },
      },
    })
    s.applyAutoLayout()
    const t = useNetworkTopologyStore.getState().topology!
    // ISP at band 0, firewall at band 2 → different Y values.
    expect(t.nodes.isp1.position.y).not.toBe(t.nodes.fw1.position.y)
    expect(t.nodes.fw1.position.y).toBeGreaterThan(t.nodes.isp1.position.y)
  })

  it('applyAutoLayout clears layoutLocked', () => {
    useNetworkTopologyStore.setState({
      topology: { ...useNetworkTopologyStore.getState().topology!, layoutLocked: true },
    })
    useNetworkTopologyStore.getState().applyAutoLayout()
    expect(useNetworkTopologyStore.getState().topology!.layoutLocked).toBe(false)
  })

  it('addNode on an unlocked topology auto-arranges (places into band)', () => {
    const s = useNetworkTopologyStore.getState()
    // Pass position {0,0} — addNode should override it via auto-layout.
    s.addNode({ id: 'fw1', type: 'firewall', label: 'FW 1', position: { x: 0, y: 0 } })
    const fw = useNetworkTopologyStore.getState().topology!.nodes.fw1
    // Firewall sits in band 2 → y > 0 with default topY=80 / BAND_HEIGHT=140.
    expect(fw.position.y).toBeGreaterThan(0)
  })

  it('addNode on a locked topology preserves the requested position', () => {
    useNetworkTopologyStore.setState({
      topology: { ...useNetworkTopologyStore.getState().topology!, layoutLocked: true },
    })
    useNetworkTopologyStore
      .getState()
      .addNode({ id: 'fw1', type: 'firewall', label: 'FW', position: { x: 42, y: 42 } })
    const fw = useNetworkTopologyStore.getState().topology!.nodes.fw1
    expect(fw.position).toEqual({ x: 42, y: 42 })
  })

  it('a position-change in applyNodeChanges flips layoutLocked', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode({ id: 'fw1', type: 'firewall', label: 'FW', position: { x: 0, y: 0 } })
    expect(useNetworkTopologyStore.getState().topology!.layoutLocked).toBe(false)
    s.applyNodeChanges([{ type: 'position', id: 'fw1', position: { x: 5, y: 5 } }])
    expect(useNetworkTopologyStore.getState().topology!.layoutLocked).toBe(true)
  })

  it('after a drag flips the lock, subsequent addNode does not reshuffle existing nodes', () => {
    const s = useNetworkTopologyStore.getState()
    // First add — auto-arrange places it.
    s.addNode({ id: 'fw1', type: 'firewall', label: 'FW', position: { x: 0, y: 0 } })
    // User drags it.
    s.applyNodeChanges([{ type: 'position', id: 'fw1', position: { x: 999, y: 999 } }])
    // Add another node.
    s.addNode({ id: 'isp1', type: 'isp', label: 'ISP', position: { x: 100, y: 100 } })
    const t = useNetworkTopologyStore.getState().topology!
    // The dragged firewall stays where the user put it.
    expect(t.nodes.fw1.position).toEqual({ x: 999, y: 999 })
    // The newly-added ISP keeps the position the caller passed in
    // (no auto-arrange since the layout is now locked).
    expect(t.nodes.isp1.position).toEqual({ x: 100, y: 100 })
  })

  it('setNodePosition flips layoutLocked', () => {
    const s = useNetworkTopologyStore.getState()
    s.addNode({ id: 'fw1', type: 'firewall', label: 'FW', position: { x: 0, y: 0 } })
    s.setNodePosition('fw1', 50, 50)
    expect(useNetworkTopologyStore.getState().topology!.layoutLocked).toBe(true)
  })
})
