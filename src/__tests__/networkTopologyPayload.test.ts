/**
 * M6.1 — `migrateNetworkTopology` round-trip + legacy compat.
 *
 * The migration helper has two responsibilities:
 *
 *   1. Back-fill an empty topology when the payload omits the
 *      `networkTopology` key (legacy / brand-new office). The store
 *      must always land in a non-null state so the page can render
 *      without null-checks at every read.
 *   2. Coerce a hand-edited or partially-corrupted payload into a
 *      valid `NetworkTopology` — drop unknown node types, drop edges
 *      with bad endpoints, cascade edges that referenced nodes that
 *      didn't survive migration.
 *
 * These tests pin both behaviors so a future refactor can't silently
 * change either branch.
 */
import { describe, it, expect, vi } from 'vitest'
import { migrateNetworkTopology } from '../lib/offices/loadFromLegacyPayload'

const OFFICE = 'office-1'

describe('migrateNetworkTopology — legacy compat', () => {
  it('returns an empty topology for undefined (legacy payload)', () => {
    const t = migrateNetworkTopology(undefined, OFFICE)
    expect(t.officeId).toBe(OFFICE)
    expect(t.nodes).toEqual({})
    expect(t.edges).toEqual({})
    expect(t.layoutLocked).toBe(false)
  })

  it('returns an empty topology for null / non-object / array', () => {
    expect(migrateNetworkTopology(null, OFFICE).nodes).toEqual({})
    expect(migrateNetworkTopology('nope', OFFICE).nodes).toEqual({})
    expect(migrateNetworkTopology([], OFFICE).nodes).toEqual({})
  })
})

describe('migrateNetworkTopology — round-trip', () => {
  it('preserves valid nodes + edges + layoutLocked', () => {
    const raw = {
      id: 'topology-1',
      officeId: OFFICE,
      nodes: {
        a: {
          id: 'a',
          type: 'firewall',
          label: 'MX450',
          model: 'MX450',
          status: 'live',
          position: { x: 100, y: 200 },
        },
        b: {
          id: 'b',
          type: 'core-switch',
          label: 'Core',
          position: { x: 100, y: 400 },
        },
      },
      edges: {
        e1: { id: 'e1', source: 'a', target: 'b', type: 'sfp-10g', label: 'uplink' },
      },
      layoutLocked: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    }
    const t = migrateNetworkTopology(raw, OFFICE)
    expect(t.id).toBe('topology-1')
    expect(t.layoutLocked).toBe(true)
    expect(t.nodes['a']?.model).toBe('MX450')
    expect(t.nodes['a']?.status).toBe('live')
    expect(t.edges['e1']?.label).toBe('uplink')
  })

  it('forces officeId to the loader-provided value (security)', () => {
    // A hand-edited payload could try to claim it belongs to a different
    // office. The migration always trusts the loader's `officeId`
    // argument, never the payload's own field, so a leaked topology
    // can't impersonate another office on rehydrate.
    const raw = {
      officeId: 'evil-other-office',
      nodes: {},
      edges: {},
      layoutLocked: false,
    }
    expect(migrateNetworkTopology(raw, OFFICE).officeId).toBe(OFFICE)
  })
})

describe('migrateNetworkTopology — corrupt entries', () => {
  it('drops a node with an unknown type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = migrateNetworkTopology(
      {
        nodes: {
          a: { id: 'a', type: 'firewall', label: 'a', position: { x: 0, y: 0 } },
          bad: { id: 'bad', type: 'unicorn', label: 'b', position: { x: 0, y: 0 } },
        },
        edges: {},
      },
      OFFICE,
    )
    expect(Object.keys(t.nodes)).toEqual(['a'])
    warn.mockRestore()
  })

  it('drops a node with a non-finite position', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = migrateNetworkTopology(
      {
        nodes: {
          a: { id: 'a', type: 'firewall', label: 'a', position: { x: NaN, y: 0 } },
          b: { id: 'b', type: 'firewall', label: 'b', position: { x: 5, y: 5 } },
        },
        edges: {},
      },
      OFFICE,
    )
    expect(Object.keys(t.nodes)).toEqual(['b'])
    warn.mockRestore()
  })

  it('drops edges that reference a node we dropped during migration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = migrateNetworkTopology(
      {
        nodes: {
          a: { id: 'a', type: 'firewall', label: 'a', position: { x: 0, y: 0 } },
          // 'bad' won't survive — its type is unknown.
          bad: { id: 'bad', type: 'wormhole', label: 'b', position: { x: 0, y: 0 } },
        },
        edges: {
          ok: { id: 'ok', source: 'a', target: 'a', type: 'sfp-10g' },
          dangle: { id: 'dangle', source: 'a', target: 'bad', type: 'sfp-10g' },
        },
      },
      OFFICE,
    )
    expect(Object.keys(t.edges)).toEqual(['ok'])
    warn.mockRestore()
  })

  it('drops edges with an unknown type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = migrateNetworkTopology(
      {
        nodes: {
          a: { id: 'a', type: 'firewall', label: 'a', position: { x: 0, y: 0 } },
          b: { id: 'b', type: 'firewall', label: 'b', position: { x: 0, y: 0 } },
        },
        edges: {
          good: { id: 'good', source: 'a', target: 'b', type: 'sfp-10g' },
          bad: { id: 'bad', source: 'a', target: 'b', type: 'unobtanium' },
        },
      },
      OFFICE,
    )
    expect(Object.keys(t.edges).sort()).toEqual(['good'])
    warn.mockRestore()
  })
})
