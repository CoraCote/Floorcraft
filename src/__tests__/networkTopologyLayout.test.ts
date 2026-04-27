/**
 * M6.2 — `layeredLayout` algorithm tests.
 *
 * The layout function is pure and the algorithm is small, so the tests
 * pin down four properties:
 *
 *   1. Bands are assigned correctly: the 8 node types collapse to 7
 *      Y rows in the order ISP → WAN → (firewall + cloud) → core →
 *      edge → AP → endpoints.
 *   2. Within a band, nodes sort deterministically (label, then id).
 *   3. The firewall+cloud shared band places cloud LEFT of firewalls.
 *   4. Edge cases: empty input returns empty; single-node input
 *      returns one centered position; an unknown type goes to band -1.
 *
 * The store-side action (`applyAutoLayout`) is exercised in
 * `networkTopologyStore.test.ts` so the responsibility split mirrors
 * the file boundary — pure layout here, side effects there.
 */
import { describe, it, expect } from 'vitest'
import {
  BAND_HEIGHT,
  layeredLayout,
  TOPOLOGY_LAYERS,
} from '../lib/networkTopologyLayout'
import type { TopologyNode, TopologyNodeType } from '../types/networkTopology'

function node(
  id: string,
  type: TopologyNodeType,
  label = id,
): TopologyNode {
  return { id, type, label, position: { x: 0, y: 0 } }
}

function toMap(nodes: TopologyNode[]): Record<string, TopologyNode> {
  return Object.fromEntries(nodes.map((n) => [n.id, n]))
}

describe('layeredLayout — basics', () => {
  it('returns an empty position map for an empty topology', () => {
    expect(layeredLayout({})).toEqual({})
  })

  it('places a single node at centerX, band 0', () => {
    const out = layeredLayout(toMap([node('isp1', 'isp', 'ISP 1')]), {
      centerX: 500,
      topY: 100,
    })
    // n = 1 → totalSpan = 0 → firstCenterX = centerX
    expect(out.isp1).toEqual({ x: 500, y: 100 })
  })

  it('uses default centerX=600 / topY=80 when options are omitted', () => {
    const out = layeredLayout(toMap([node('only', 'isp')]))
    expect(out.only).toEqual({ x: 600, y: 80 })
  })

  it('Y coordinate increases by BAND_HEIGHT per band', () => {
    const out = layeredLayout(
      toMap([
        node('isp1', 'isp'),
        node('wan1', 'wan-switch'),
        node('fw1', 'firewall'),
        node('core1', 'core-switch'),
      ]),
      { topY: 0 },
    )
    expect(out.isp1.y).toBe(0)
    expect(out.wan1.y).toBe(BAND_HEIGHT)
    expect(out.fw1.y).toBe(BAND_HEIGHT * 2)
    expect(out.core1.y).toBe(BAND_HEIGHT * 3)
  })
})

describe('layeredLayout — within a band', () => {
  it('sorts nodes alphabetically by label', () => {
    const out = layeredLayout(
      toMap([
        node('z', 'edge-switch', 'Zulu'),
        node('a', 'edge-switch', 'Alpha'),
        node('m', 'edge-switch', 'Mike'),
      ]),
    )
    // Alphabetical → Alpha (leftmost), Mike, Zulu (rightmost)
    const xs = [out.a.x, out.m.x, out.z.x]
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
  })

  it('spreads nodes symmetrically around centerX', () => {
    const out = layeredLayout(
      toMap([
        node('a', 'edge-switch', 'A'),
        node('b', 'edge-switch', 'B'),
      ]),
      { centerX: 600 },
    )
    // The midpoint of the two xs should equal centerX.
    expect((out.a.x + out.b.x) / 2).toBe(600)
  })

  it('places a single node at exactly centerX', () => {
    const out = layeredLayout(
      toMap([node('only', 'edge-switch', 'Only')]),
      { centerX: 600 },
    )
    expect(out.only.x).toBe(600)
  })

  it('breaks label ties with the id', () => {
    const out = layeredLayout(
      toMap([
        node('id-zzz', 'edge-switch', 'Same'),
        node('id-aaa', 'edge-switch', 'Same'),
      ]),
    )
    // id-aaa < id-zzz lexicographically, so id-aaa is leftmost.
    expect(out['id-aaa'].x).toBeLessThan(out['id-zzz'].x)
  })
})

describe('layeredLayout — firewall + cloud shared band', () => {
  it('places cloud LEFT of firewalls regardless of label', () => {
    const out = layeredLayout(
      toMap([
        node('fw-a', 'firewall', 'Firewall A'),
        node('fw-b', 'firewall', 'Firewall B'),
        node('cloud-1', 'cloud', 'Z-Sorting-Last-By-Label'),
      ]),
    )
    // All three share band 2 → same Y.
    expect(out['fw-a'].y).toBe(out['fw-b'].y)
    expect(out['cloud-1'].y).toBe(out['fw-a'].y)
    // Cloud is leftmost; firewalls stack to its right by label.
    expect(out['cloud-1'].x).toBeLessThan(out['fw-a'].x)
    expect(out['fw-a'].x).toBeLessThan(out['fw-b'].x)
  })

  it('full reference topology — cloud + 2 firewalls + 2 cores lay out as expected', () => {
    const out = layeredLayout(
      toMap([
        node('fw-a', 'firewall', 'Firewall A'),
        node('fw-b', 'firewall', 'Firewall B'),
        node('cloud', 'cloud', 'Meraki Cloud'),
        node('core-a', 'core-switch', 'Core A'),
        node('core-b', 'core-switch', 'Core B'),
      ]),
      { centerX: 600, topY: 0 },
    )
    // Band 2: cloud — fw-a — fw-b
    expect(out['cloud'].y).toBe(BAND_HEIGHT * 2)
    expect(out['fw-a'].y).toBe(BAND_HEIGHT * 2)
    expect(out['fw-b'].y).toBe(BAND_HEIGHT * 2)
    expect(out['cloud'].x).toBeLessThan(out['fw-a'].x)
    expect(out['fw-a'].x).toBeLessThan(out['fw-b'].x)
    // Band 3: core-a left of core-b, both directly below the firewall row.
    expect(out['core-a'].y).toBe(BAND_HEIGHT * 3)
    expect(out['core-b'].y).toBe(BAND_HEIGHT * 3)
    expect(out['core-a'].x).toBeLessThan(out['core-b'].x)
  })
})

describe('layeredLayout — endpoint band tightening', () => {
  it('endpoint band uses a tighter horizontal gap than other bands', () => {
    const endpoints = layeredLayout(
      toMap([
        node('ep-a', 'endpoint-group', 'A'),
        node('ep-b', 'endpoint-group', 'B'),
      ]),
    )
    const aps = layeredLayout(
      toMap([
        node('ap-a', 'access-point', 'A'),
        node('ap-b', 'access-point', 'B'),
      ]),
    )
    // The endpoint pair should be CLOSER together than the AP pair.
    const endpointSpan = endpoints['ep-b'].x - endpoints['ep-a'].x
    const apSpan = aps['ap-b'].x - aps['ap-a'].x
    expect(endpointSpan).toBeLessThan(apSpan)
  })
})

describe('layeredLayout — defensive', () => {
  it('places an unknown node type at band -1 (off-canvas, above ISP)', () => {
    // Forge an unknown type via a cast — the type system blocks this in
    // production code but a hand-edited payload could carry it.
    const orphan = {
      id: 'orphan',
      type: 'mystery-device' as unknown as TopologyNodeType,
      label: 'mystery',
      position: { x: 0, y: 0 },
    }
    const out = layeredLayout(toMap([orphan, node('isp1', 'isp')]), {
      topY: 100,
    })
    // ISP at band 0 → y = 100. Orphan at band -1 → y = 100 - BAND_HEIGHT.
    expect(out['isp1'].y).toBe(100)
    expect(out['orphan'].y).toBe(100 - BAND_HEIGHT)
  })
})

describe('TOPOLOGY_LAYERS — invariants', () => {
  it('covers all 8 node types exactly once', () => {
    const seen = new Set<TopologyNodeType>()
    for (const layer of TOPOLOGY_LAYERS) {
      for (const t of layer.types) {
        expect(seen.has(t)).toBe(false)
        seen.add(t)
      }
    }
    expect(seen.size).toBe(8)
  })

  it('bands are zero-indexed and contiguous', () => {
    const bands = TOPOLOGY_LAYERS.map((l) => l.band)
    expect(bands).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
