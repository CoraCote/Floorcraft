import { nanoid } from 'nanoid'
import type {
  NetworkTopology,
  TopologyNode,
  TopologyNodeStatus,
  TopologyNodeType,
} from '../../../types/networkTopology'
import type {
  MerakiDevice,
  MerakiDeviceLiveStatus,
  MerakiDeviceStatus,
  MerakiProductType,
  MerakiSnapshot,
} from './types'

/**
 * M4 Phase A — Pure reconciliation between a Meraki org snapshot and
 * the local topology.
 *
 * # What "reconcile" means here
 *
 * Match by `serial`. For every Meraki device we either:
 *
 *   - **Add** a new topology node (no node currently has that serial),
 *   - **Update** an existing node (vendor/model/status drift), or
 *   - **Skip** it (the productType has no topology mapping — cameras,
 *      sensors).
 *
 * For every topology node with a `serialNumber` that is NOT in the
 * Meraki snapshot, we surface an **Orphaned** entry — informational
 * only. We never auto-delete, because the device might be on a
 * different organization the user hasn't connected yet, or simply not
 * yet onboarded into Meraki.
 *
 * The reconcile output is a *plan*, not a mutation. The dialog presents
 * the plan, lets the user trim it, and only on Apply do we hit the
 * topology store.
 *
 * # Why pure
 *
 * Tested in isolation, swappable between Phase A's fixture loader and
 * Phase B's real client without any plumbing change. The store never
 * sees this module — the dialog calls store actions explicitly with
 * the trimmed plan.
 */

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

/**
 * Map a Meraki productType to a topology node type. Switches default to
 * `edge-switch`; the caller upgrades to `core-switch` when the device
 * tags include `'core'` (a Meraki convention for spine devices).
 *
 * Cameras and sensors return `null` — they're real Meraki devices but
 * not part of the network-stack diagram the topology page is about.
 * The reconcile output records them as "skipped" so the user knows we
 * saw them and chose not to import.
 */
export function mapProductTypeToTopology(
  productType: MerakiProductType,
  tags: string[] | undefined,
): TopologyNodeType | null {
  switch (productType) {
    case 'appliance':
      return 'firewall'
    case 'cellularGateway':
      // MG cellular gateways are typically branch-office failover
      // appliances; "firewall" is the closest mental model on our
      // 8-type axis (the user can re-type to wan-switch if they
      // disagree).
      return 'firewall'
    case 'switch':
      if (tags && tags.some((t) => t.toLowerCase() === 'core')) {
        return 'core-switch'
      }
      return 'edge-switch'
    case 'wireless':
      return 'access-point'
    case 'camera':
    case 'sensor':
      return null
  }
}

/**
 * Map a Meraki device-status enum to our 5-value `TopologyNodeStatus`.
 * The ratio behind each pick:
 *
 *   - `online` → `live` (gear is racked and serving traffic)
 *   - `offline` → `broken` (gear is racked but not reachable; broken
 *     is the closest signal in our enum since `decommissioned` implies
 *     "we removed it on purpose")
 *   - `alerting` → `broken` (alerting in Meraki = degraded; same
 *     remediation surface for a planner — go investigate)
 *   - `dormant` → `installed` (powered on but never seen — typically a
 *     freshly-claimed device that hasn't enrolled yet)
 */
export function mapMerakiStatus(status: MerakiDeviceLiveStatus): TopologyNodeStatus {
  switch (status) {
    case 'online':
      return 'live'
    case 'offline':
    case 'alerting':
      return 'broken'
    case 'dormant':
      return 'installed'
  }
}

/**
 * Build a friendly node label from a Meraki device. Prefers the
 * dashboard's `name`, falls back to `model + last4(serial)` so a
 * device without a name still shows something humans can pattern-match
 * (e.g. "MR46 · 0010" for `Q2YY-CCCC-0010`).
 */
function buildNodeLabel(device: MerakiDevice): string {
  if (device.name && device.name.trim().length > 0) return device.name
  const last4 = device.serial.slice(-4)
  return `${device.model} · ${last4}`
}

/**
 * Build the `notes` payload we attach to a topology node. Keeps the
 * IT-relevant context (MAC, IP, firmware, tags) on hand without
 * forcing dedicated fields onto our `TopologyNode` shape.
 */
function buildNotes(device: MerakiDevice, status?: MerakiDeviceStatus): string {
  const lines: string[] = []
  if (device.mac) lines.push(`MAC: ${device.mac}`)
  if (device.lanIp) lines.push(`LAN IP: ${device.lanIp}`)
  if (device.firmware) lines.push(`Firmware: ${device.firmware}`)
  if (device.tags && device.tags.length > 0) {
    lines.push(`Tags: ${device.tags.join(', ')}`)
  }
  if (status) {
    lines.push(`Meraki status: ${status.status} (${status.lastReportedAt ?? 'never'})`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Plan shape
// ---------------------------------------------------------------------------

/**
 * Per-device entry in the sync plan. The dialog renders one row per
 * entry; the user can toggle `selected` to opt in/out before Apply.
 *
 *   action = 'add'     → new node will be created from `proposedNode`
 *   action = 'update'  → existing `existingNode.id` will receive `proposedPatch`
 *   action = 'skip'    → device cannot be mapped (camera/sensor) — informational
 */
export interface SyncEntryAdd {
  action: 'add'
  device: MerakiDevice
  status: MerakiDeviceStatus | null
  proposedNode: TopologyNode
  /** Default true; the user can untoggle in the preview. */
  selected: boolean
}

export interface SyncEntryUpdate {
  action: 'update'
  device: MerakiDevice
  status: MerakiDeviceStatus | null
  existingNode: TopologyNode
  proposedPatch: Partial<TopologyNode>
  /** Default true; the user can untoggle in the preview. */
  selected: boolean
}

export interface SyncEntrySkip {
  action: 'skip'
  device: MerakiDevice
  status: MerakiDeviceStatus | null
  reason: 'unmapped-product-type'
  selected: false
}

export type SyncEntry = SyncEntryAdd | SyncEntryUpdate | SyncEntrySkip

/**
 * Topology nodes whose `serialNumber` was not seen in the Meraki
 * snapshot. Surfaced for awareness so a user with stale or dual-org
 * inventory understands why a device they expected to update did not
 * appear. We never auto-delete; the user can clear the serial in the
 * Properties panel if they want.
 */
export interface SyncOrphan {
  topologyNode: TopologyNode
}

export interface SyncPlan {
  entries: SyncEntry[]
  orphans: SyncOrphan[]
}

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

/**
 * Compute the sync plan for a Meraki snapshot against the current
 * topology. The output is a deterministic function of its inputs; tests
 * pin the ordering (Meraki devices in their snapshot order, then a
 * single orphan list).
 *
 * Position assignment for new nodes: we leave a placeholder `(0, 0)`
 * coord and rely on the dialog calling `applyAutoLayout()` after the
 * batch import lands. That keeps the planner pure (no random nanoid +
 * position generators driving test flakes) and reuses M6.2's layered
 * layout so imported nodes settle into their canonical band.
 */
export function buildSyncPlan(
  snapshot: MerakiSnapshot,
  topology: NetworkTopology,
): SyncPlan {
  const statusBySerial = new Map<string, MerakiDeviceStatus>()
  for (const s of snapshot.statuses) statusBySerial.set(s.serial, s)

  const nodesBySerial = new Map<string, TopologyNode>()
  for (const node of Object.values(topology.nodes)) {
    if (node.serialNumber) nodesBySerial.set(node.serialNumber, node)
  }

  const matchedSerials = new Set<string>()
  const entries: SyncEntry[] = []

  for (const device of snapshot.devices) {
    const status = statusBySerial.get(device.serial) ?? null
    const topologyType = mapProductTypeToTopology(device.productType, device.tags)

    if (topologyType === null) {
      entries.push({
        action: 'skip',
        device,
        status,
        reason: 'unmapped-product-type',
        selected: false,
      })
      continue
    }

    const existing = nodesBySerial.get(device.serial)
    const proposedStatus: TopologyNodeStatus | null = status
      ? mapMerakiStatus(status.status)
      : null
    const label = buildNodeLabel(device)
    const notes = buildNotes(device, status ?? undefined)

    if (existing) {
      matchedSerials.add(device.serial)
      // Diff against the existing node — only surface fields that
      // would actually change so the dialog's "what changes" preview
      // doesn't lie. We do NOT propose a `type` change: the user may
      // have re-typed an edge to core (or vice versa) deliberately;
      // overwriting their choice would be obnoxious. We DO propose
      // model/vendor/status updates, plus refreshing the notes block.
      const patch: Partial<TopologyNode> = {}
      if (existing.vendor !== 'Cisco Meraki') patch.vendor = 'Cisco Meraki'
      if (existing.model !== device.model) patch.model = device.model
      if (proposedStatus && existing.status !== proposedStatus) {
        patch.status = proposedStatus
      }
      if (existing.notes !== notes) patch.notes = notes
      if (existing.label !== label && (!existing.label || existing.label.trim() === '')) {
        // Only overwrite empty labels; never stomp a name the user
        // chose deliberately.
        patch.label = label
      }
      entries.push({
        action: 'update',
        device,
        status,
        existingNode: existing,
        proposedPatch: patch,
        selected: Object.keys(patch).length > 0,
      })
    } else {
      const proposedNode: TopologyNode = {
        id: `node-${nanoid(8)}`,
        type: topologyType,
        label,
        vendor: 'Cisco Meraki',
        model: device.model,
        sku: null,
        serialNumber: device.serial,
        status: proposedStatus ?? 'installed',
        notes,
        position: { x: 0, y: 0 },
      }
      entries.push({
        action: 'add',
        device,
        status,
        proposedNode,
        selected: true,
      })
    }
  }

  // Orphans: topology nodes with serials NOT seen in this snapshot.
  // Skipped Meraki devices (cameras/sensors) are NOT counted as
  // matches here — if a user manually entered a camera serial as a
  // node and then runs sync, we tell them it's orphaned (no
  // network-stack mapping exists for it) so they can clean it up.
  const orphans: SyncOrphan[] = []
  for (const node of Object.values(topology.nodes)) {
    if (!node.serialNumber) continue
    if (matchedSerials.has(node.serialNumber)) continue
    orphans.push({ topologyNode: node })
  }

  return { entries, orphans }
}

// ---------------------------------------------------------------------------
// Plan summary (drives the dialog's headline counts)
// ---------------------------------------------------------------------------

export interface SyncPlanSummary {
  toAdd: number
  toUpdate: number
  noChange: number
  skipped: number
  orphaned: number
}

/**
 * Quick totals used by the dialog header ("3 new, 2 updates, 1 skipped").
 * `noChange` is updates whose patch was empty — we still show them in
 * the table (with a "matched, no changes" row) but they shouldn't
 * inflate the "to update" headline.
 */
export function summarizeSyncPlan(plan: SyncPlan): SyncPlanSummary {
  let toAdd = 0
  let toUpdate = 0
  let noChange = 0
  let skipped = 0
  for (const e of plan.entries) {
    if (e.action === 'add') toAdd++
    else if (e.action === 'update') {
      if (Object.keys(e.proposedPatch).length === 0) noChange++
      else toUpdate++
    } else skipped++
  }
  return { toAdd, toUpdate, noChange, skipped, orphaned: plan.orphans.length }
}
