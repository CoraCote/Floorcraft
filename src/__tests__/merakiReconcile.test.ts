import { describe, it, expect } from 'vitest'
import {
  buildSyncPlan,
  mapMerakiStatus,
  mapProductTypeToTopology,
  summarizeSyncPlan,
} from '../lib/integrations/meraki/reconcile'
import { loadSampleMerakiSnapshot } from '../lib/integrations/meraki/fixtures'
import {
  createEmptyTopology,
  type NetworkTopology,
  type TopologyNode,
} from '../types/networkTopology'

function topologyWith(nodes: TopologyNode[]): NetworkTopology {
  const t = createEmptyTopology('office-1')
  for (const n of nodes) t.nodes[n.id] = n
  return t
}

function node(
  id: string,
  overrides: Partial<TopologyNode> = {},
): TopologyNode {
  return {
    id,
    type: 'edge-switch',
    label: id,
    position: { x: 0, y: 0 },
    status: 'planned',
    ...overrides,
  }
}

describe('mapProductTypeToTopology', () => {
  it('maps appliance + cellularGateway to firewall', () => {
    expect(mapProductTypeToTopology('appliance', undefined)).toBe('firewall')
    expect(mapProductTypeToTopology('cellularGateway', undefined)).toBe('firewall')
  })
  it('maps wireless to access-point', () => {
    expect(mapProductTypeToTopology('wireless', undefined)).toBe('access-point')
  })
  it('maps untagged switch to edge-switch', () => {
    expect(mapProductTypeToTopology('switch', undefined)).toBe('edge-switch')
    expect(mapProductTypeToTopology('switch', [])).toBe('edge-switch')
    expect(mapProductTypeToTopology('switch', ['branch'])).toBe('edge-switch')
  })
  it('maps switch tagged "core" to core-switch (case-insensitive)', () => {
    expect(mapProductTypeToTopology('switch', ['core'])).toBe('core-switch')
    expect(mapProductTypeToTopology('switch', ['CORE'])).toBe('core-switch')
    expect(mapProductTypeToTopology('switch', ['hq', 'Core'])).toBe('core-switch')
  })
  it('returns null for camera + sensor (no topology mapping)', () => {
    expect(mapProductTypeToTopology('camera', undefined)).toBeNull()
    expect(mapProductTypeToTopology('sensor', undefined)).toBeNull()
  })
})

describe('mapMerakiStatus', () => {
  it('online → live', () => {
    expect(mapMerakiStatus('online')).toBe('live')
  })
  it('offline + alerting → broken (degraded surfaces in topology)', () => {
    expect(mapMerakiStatus('offline')).toBe('broken')
    expect(mapMerakiStatus('alerting')).toBe('broken')
  })
  it('dormant → installed (claimed but never enrolled)', () => {
    expect(mapMerakiStatus('dormant')).toBe('installed')
  })
})

describe('buildSyncPlan', () => {
  it('produces all-add entries when topology is empty', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const adds = plan.entries.filter((e) => e.action === 'add')
    const skips = plan.entries.filter((e) => e.action === 'skip')
    // All non-camera/sensor devices are adds; camera + sensor go to skip.
    expect(adds.length).toBeGreaterThan(0)
    expect(skips.length).toBe(2) // BEL-CAM-LOBBY + BEL-SENSOR-LOFT
    expect(plan.orphans).toEqual([])
  })

  it('adds proposed nodes with vendor "Cisco Meraki" and a serial', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const firstAdd = plan.entries.find((e) => e.action === 'add')!
    if (firstAdd.action !== 'add') throw new Error('expected add')
    expect(firstAdd.proposedNode.vendor).toBe('Cisco Meraki')
    expect(firstAdd.proposedNode.serialNumber).toBe(firstAdd.device.serial)
    expect(firstAdd.proposedNode.label.length).toBeGreaterThan(0)
  })

  it('falls back to "model · last4(serial)" when device.name is null', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const unnamed = plan.entries.find(
      (e) => e.action === 'add' && e.device.serial === 'Q2XX-CCCC-0007',
    )
    if (!unnamed || unnamed.action !== 'add') throw new Error('expected unnamed add')
    expect(unnamed.proposedNode.label).toBe('CW9176I · 0007')
  })

  it('upgrades a switch tagged "core" to core-switch', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const coreSwitch = plan.entries.find(
      (e) => e.action === 'add' && e.device.serial === 'Q2XX-BBBB-0002',
    )
    if (!coreSwitch || coreSwitch.action !== 'add') throw new Error('expected add')
    expect(coreSwitch.proposedNode.type).toBe('core-switch')
  })

  it('matches by serial and proposes a vendor/model/status patch', () => {
    const existing = node('local-1', {
      type: 'firewall',
      label: 'Bellevue MX', // user-chosen label — should NOT be stomped
      vendor: null,
      model: 'old-mx',
      serialNumber: 'Q2XX-AAAA-0001',
      status: 'planned',
    })
    const topology = topologyWith([existing])
    const plan = buildSyncPlan(loadSampleMerakiSnapshot(), topology)
    const matched = plan.entries.find(
      (e) => e.action === 'update' && e.existingNode.id === 'local-1',
    )
    if (!matched || matched.action !== 'update') throw new Error('expected update')
    expect(matched.proposedPatch.vendor).toBe('Cisco Meraki')
    expect(matched.proposedPatch.model).toBe('MX450')
    expect(matched.proposedPatch.status).toBe('live')
    // Label was non-empty; we must NOT propose overwriting it.
    expect(matched.proposedPatch.label).toBeUndefined()
    expect(matched.selected).toBe(true)
  })

  it('overwrites empty labels but never user-chosen labels', () => {
    const empty = node('local-1', {
      type: 'firewall',
      label: '', // empty → safe to fill in
      vendor: 'Cisco Meraki',
      model: 'MX450',
      serialNumber: 'Q2XX-AAAA-0001',
      status: 'live',
    })
    const plan = buildSyncPlan(loadSampleMerakiSnapshot(), topologyWith([empty]))
    const matched = plan.entries.find(
      (e) => e.action === 'update' && e.existingNode.id === 'local-1',
    )
    if (!matched || matched.action !== 'update') throw new Error('expected update')
    expect(matched.proposedPatch.label).toBe('BEL-MX-01')
  })

  it('marks the entry as not-selected when the patch is empty', () => {
    // Snapshot says MX450 / live / "BEL-MX-01" — make the local node
    // already match in every way, plus an existing-equivalent notes.
    const snap = loadSampleMerakiSnapshot()
    const device = snap.devices.find((d) => d.serial === 'Q2XX-AAAA-0001')!
    const status = snap.statuses.find((s) => s.serial === device.serial)!
    const notes = [
      `MAC: ${device.mac}`,
      `LAN IP: ${device.lanIp}`,
      `Firmware: ${device.firmware}`,
      `Tags: ${device.tags?.join(', ')}`,
      `Meraki status: ${status.status} (${status.lastReportedAt})`,
    ].join('\n')
    const aligned = node('local-1', {
      type: 'firewall',
      label: 'BEL-MX-01',
      vendor: 'Cisco Meraki',
      model: 'MX450',
      status: 'live',
      serialNumber: 'Q2XX-AAAA-0001',
      notes,
    })
    const plan = buildSyncPlan(snap, topologyWith([aligned]))
    const matched = plan.entries.find(
      (e) => e.action === 'update' && e.existingNode.id === 'local-1',
    )
    if (!matched || matched.action !== 'update') throw new Error('expected update')
    expect(Object.keys(matched.proposedPatch)).toEqual([])
    expect(matched.selected).toBe(false)
  })

  it('surfaces topology nodes whose serial is not in the snapshot as orphans', () => {
    const orphanNode = node('local-orphan', {
      serialNumber: 'NOT-IN-SNAPSHOT',
      label: 'Old WAN switch',
    })
    const plan = buildSyncPlan(
      loadSampleMerakiSnapshot(),
      topologyWith([orphanNode]),
    )
    expect(plan.orphans.length).toBe(1)
    expect(plan.orphans[0].topologyNode.id).toBe('local-orphan')
  })

  it('does NOT count nodes without a serial as orphans', () => {
    const noSerial = node('local-1', { serialNumber: null })
    const plan = buildSyncPlan(loadSampleMerakiSnapshot(), topologyWith([noSerial]))
    expect(plan.orphans).toEqual([])
  })

  it('preserves Meraki snapshot ordering for entries', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const entrySerials = plan.entries.map((e) => e.device.serial)
    expect(entrySerials).toEqual(snap.devices.map((d) => d.serial))
  })
})

describe('summarizeSyncPlan', () => {
  it('counts adds, updates, skips, and orphans for the sample fixture', () => {
    const snap = loadSampleMerakiSnapshot()
    const plan = buildSyncPlan(snap, createEmptyTopology('o1'))
    const summary = summarizeSyncPlan(plan)
    // 14 devices total. Camera + sensor → 2 skipped. Rest → 12 adds.
    expect(summary.toAdd).toBe(12)
    expect(summary.toUpdate).toBe(0)
    expect(summary.noChange).toBe(0)
    expect(summary.skipped).toBe(2)
    expect(summary.orphaned).toBe(0)
  })

  it('separates "to update" from "no change" updates', () => {
    const snap = loadSampleMerakiSnapshot()
    // Aligned (no-change) match for Q2XX-AAAA-0001
    const device = snap.devices.find((d) => d.serial === 'Q2XX-AAAA-0001')!
    const status = snap.statuses.find((s) => s.serial === device.serial)!
    const notes = [
      `MAC: ${device.mac}`,
      `LAN IP: ${device.lanIp}`,
      `Firmware: ${device.firmware}`,
      `Tags: ${device.tags?.join(', ')}`,
      `Meraki status: ${status.status} (${status.lastReportedAt})`,
    ].join('\n')
    const aligned = node('local-aligned', {
      type: 'firewall',
      label: 'BEL-MX-01',
      vendor: 'Cisco Meraki',
      model: 'MX450',
      status: 'live',
      serialNumber: 'Q2XX-AAAA-0001',
      notes,
    })
    // Drifted match for Q2XX-BBBB-0003 — model wrong → real update.
    const drifted = node('local-drift', {
      type: 'edge-switch',
      label: 'BEL-EDGE-01',
      vendor: 'Cisco Meraki',
      model: 'MS130-OLD',
      status: 'live',
      serialNumber: 'Q2XX-BBBB-0003',
    })

    const plan = buildSyncPlan(snap, topologyWith([aligned, drifted]))
    const summary = summarizeSyncPlan(plan)
    expect(summary.noChange).toBe(1)
    expect(summary.toUpdate).toBe(1)
    // 12 mappable - 2 matched = 10 adds remain.
    expect(summary.toAdd).toBe(10)
  })
})
