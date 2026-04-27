/**
 * M6.6 — bidirectional floor-plan ↔ topology linkage.
 *
 * Lock down the linkage rules at the data-layer boundary:
 *
 *   1. Linking sets `floorElementId` on the topology node; unlinking
 *      clears it.
 *   2. A topology node CAN'T link to an element already linked by
 *      another topology node — surface a rejection (return false).
 *   3. `findTopologyNodeForElement` returns the right node for a given
 *      element id, or null when nothing references it.
 *   4. Auto-link by serial: 3 floor APs with serials, 1 topology node
 *      with a matching serial → only the matching one is found.
 *   5. Compatible types only: an `access-point` topology node won't be
 *      linkable to a `display` floor element (the picker filters those
 *      out).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useNetworkTopologyStore } from '../stores/networkTopologyStore'
import {
  createEmptyTopology,
  type TopologyNode,
} from '../types/networkTopology'
import {
  findTopologyNodeForElement,
  findUnlinkedFloorElements,
  findElementsBySerial,
  topologyNodeTypeForElement,
} from '../lib/networkTopologyLinkage'
import type { Floor } from '../types/floor'
import type { AccessPointElement, DisplayElement } from '../types/elements'

const OFFICE = 'office-test'

function freshTopology() {
  useNetworkTopologyStore.setState({ topology: createEmptyTopology(OFFICE) })
}

function nodeFixture(
  id: string,
  partial: Partial<TopologyNode> = {},
): TopologyNode {
  return {
    id,
    type: 'access-point',
    label: `AP ${id}`,
    position: { x: 0, y: 0 },
    status: 'planned',
    ...partial,
  }
}

function apElement(
  id: string,
  serial?: string | null,
  label?: string,
): AccessPointElement {
  return {
    id,
    type: 'access-point',
    x: 0,
    y: 0,
    width: 30,
    height: 30,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: label ?? id,
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    serialNumber: serial ?? null,
  }
}

function displayElement(id: string): DisplayElement {
  return {
    id,
    type: 'display',
    x: 0,
    y: 0,
    width: 80,
    height: 16,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: id,
    visible: true,
    style: { fill: '#222', stroke: '#000', strokeWidth: 1, opacity: 1 },
  }
}

function floorFixture(id: string, name: string, els: Array<AccessPointElement | DisplayElement>): Floor {
  return {
    id,
    name,
    order: 0,
    elements: Object.fromEntries(els.map((e) => [e.id, e])),
  }
}

describe('linkNodeToElement / unlinkNode', () => {
  beforeEach(freshTopology)

  it('linkNodeToElement sets floorElementId on the topology node', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    const ok = store.linkNodeToElement('n1', 'el-A')
    expect(ok).toBe(true)
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']?.floorElementId).toBe(
      'el-A',
    )
  })

  it('unlinkNode clears floorElementId back to null', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    store.linkNodeToElement('n1', 'el-A')
    store.unlinkNode('n1')
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']?.floorElementId).toBe(
      null,
    )
  })

  it('rejects a second topology node trying to link to the same element', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    store.addNode(nodeFixture('n2'))
    expect(store.linkNodeToElement('n1', 'el-A')).toBe(true)
    // Second link to the same element from a DIFFERENT node is rejected.
    expect(store.linkNodeToElement('n2', 'el-A')).toBe(false)
    // n2 should NOT have a floorElementId set.
    expect(useNetworkTopologyStore.getState().topology?.nodes['n2']?.floorElementId).toBeFalsy()
  })

  it('re-linking the same node to the same element is idempotent (returns true)', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    expect(store.linkNodeToElement('n1', 'el-A')).toBe(true)
    expect(store.linkNodeToElement('n1', 'el-A')).toBe(true)
  })

  it('a node can re-target to a different element after unlinking', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    store.linkNodeToElement('n1', 'el-A')
    store.unlinkNode('n1')
    expect(store.linkNodeToElement('n1', 'el-B')).toBe(true)
    expect(useNetworkTopologyStore.getState().topology?.nodes['n1']?.floorElementId).toBe(
      'el-B',
    )
  })
})

describe('findTopologyNodeForElement', () => {
  beforeEach(freshTopology)

  it('returns the node that references the given element id', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    store.addNode(nodeFixture('n2'))
    store.linkNodeToElement('n2', 'el-A')
    const t = useNetworkTopologyStore.getState().topology
    expect(findTopologyNodeForElement(t, 'el-A')?.id).toBe('n2')
  })

  it('returns null when no topology node references the element', () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n1'))
    const t = useNetworkTopologyStore.getState().topology
    expect(findTopologyNodeForElement(t, 'el-A')).toBeNull()
  })

  it('returns null when topology is null/undefined', () => {
    expect(findTopologyNodeForElement(null, 'anything')).toBeNull()
    expect(findTopologyNodeForElement(undefined, 'anything')).toBeNull()
  })
})

describe('findUnlinkedFloorElements (compatibility filter)', () => {
  beforeEach(freshTopology)

  it("returns the access-point floor elements for an 'access-point' node, excluding linked ones", () => {
    const store = useNetworkTopologyStore.getState()
    store.addNode(nodeFixture('n-already-linked'))
    store.linkNodeToElement('n-already-linked', 'ap-2')

    const floors: Floor[] = [
      floorFixture('f1', 'Engineering', [
        apElement('ap-1', 'Q3CD-001'),
        apElement('ap-2', 'Q3CD-002'), // already linked
        apElement('ap-3', 'Q3CD-003'),
        displayElement('disp-1'), // wrong type — must be filtered out
      ]),
    ]
    const t = useNetworkTopologyStore.getState().topology
    const candidates = findUnlinkedFloorElements(floors, t, 'access-point')
    const ids = candidates.map((c) => c.element.id).sort()
    expect(ids).toEqual(['ap-1', 'ap-3'])
  })

  it('returns empty for an access-point node when only display floor elements exist', () => {
    // Compatibility check — a `display` floor element is NOT a valid
    // target for an `access-point` topology node, so the picker list
    // is empty even though the floor has IT-device elements.
    const floors: Floor[] = [floorFixture('f1', 'Engineering', [displayElement('disp-1')])]
    const t = useNetworkTopologyStore.getState().topology
    const candidates = findUnlinkedFloorElements(floors, t, 'access-point')
    expect(candidates).toEqual([])
  })

  it('returns empty for node types with no floor representation (firewall, ISP, …)', () => {
    const floors: Floor[] = [floorFixture('f1', 'Engineering', [apElement('ap-1')])]
    const t = useNetworkTopologyStore.getState().topology
    expect(findUnlinkedFloorElements(floors, t, 'firewall')).toEqual([])
    expect(findUnlinkedFloorElements(floors, t, 'isp')).toEqual([])
    expect(findUnlinkedFloorElements(floors, t, 'cloud')).toEqual([])
  })
})

describe('findElementsBySerial (auto-link)', () => {
  it('finds the single matching access-point among multiple candidates', () => {
    const floors: Floor[] = [
      floorFixture('f1', 'Engineering', [
        apElement('ap-1', 'Q3CD-AAAA'),
        apElement('ap-2', 'Q3CD-XYZW-1234'), // the match
        apElement('ap-3', 'Q3CD-CCCC'),
      ]),
    ]
    const matches = findElementsBySerial(floors, 'Q3CD-XYZW-1234')
    expect(matches.map((m) => m.element.id)).toEqual(['ap-2'])
  })

  it('matches case-insensitively and trims whitespace', () => {
    const floors: Floor[] = [floorFixture('f1', 'F', [apElement('ap-1', 'Q3CD-001')])]
    expect(findElementsBySerial(floors, '  q3cd-001  ').map((m) => m.element.id)).toEqual([
      'ap-1',
    ])
  })

  it('returns no matches for a null/empty/whitespace serial', () => {
    const floors: Floor[] = [floorFixture('f1', 'F', [apElement('ap-1', 'Q3CD-001')])]
    expect(findElementsBySerial(floors, null)).toEqual([])
    expect(findElementsBySerial(floors, '')).toEqual([])
    expect(findElementsBySerial(floors, '   ')).toEqual([])
  })

  it('skips elements without a serial number', () => {
    const floors: Floor[] = [
      floorFixture('f1', 'F', [apElement('ap-no-serial', null), apElement('ap-1', 'X')]),
    ]
    expect(findElementsBySerial(floors, 'X').map((m) => m.element.id)).toEqual(['ap-1'])
  })
})

describe('topologyNodeTypeForElement (inverse mapping)', () => {
  it('maps access-point element → access-point topology node', () => {
    expect(topologyNodeTypeForElement('access-point')).toBe('access-point')
  })

  it('returns null for IT element types with no compatible topology node today', () => {
    expect(topologyNodeTypeForElement('display')).toBeNull()
    expect(topologyNodeTypeForElement('outlet')).toBeNull()
    expect(topologyNodeTypeForElement('badge-reader')).toBeNull()
  })

  it('returns null for non-IT element types (desk, wall, …)', () => {
    expect(topologyNodeTypeForElement('desk')).toBeNull()
    expect(topologyNodeTypeForElement('wall')).toBeNull()
  })
})
