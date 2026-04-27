import type { CanvasElement, ElementType } from '../types/elements'
import type { Floor } from '../types/floor'
import type {
  NetworkTopology,
  TopologyNode,
  TopologyNodeType,
} from '../types/networkTopology'
import { isITDevice } from '../types/elements'

/**
 * M6.6 — pure helpers behind the bidirectional floor-plan ↔ topology
 * linkage.
 *
 * The linkage itself is a single-field reference: a `TopologyNode`
 * stores `floorElementId?: string | null`. The shape is intentionally
 * one-way at the data layer (topology → floor) because:
 *
 *   1. The topology side has fewer cardinality constraints — at most
 *      one floor element per topology node, at most one topology node
 *      per floor element. Storing the back-pointer on the floor side
 *      would force a second invariant ("the floor element's `linkedTopologyNodeId`
 *      must equal the topology node's id, and vice versa") and double
 *      the migration surface for legacy payloads.
 *   2. The floor element's data layer (M1) is a stable schema with a
 *      large blast radius — every renderer, every analyzer, every
 *      payload migration touches it. Adding an inverse pointer there
 *      would be an invasive change for a feature that's perfectly
 *      well-served by a derived lookup.
 *
 * The "feels-bidirectional" UX is therefore powered by a derived
 * lookup: `findTopologyNodeForElement(topology, elementId)` walks the
 * topology nodes for one whose `floorElementId === elementId`. The
 * cost is O(n) over topology nodes, which is fine — an enterprise
 * office tops out at ~50 topology nodes, and the lookup is run once
 * per floor-Properties-panel render (not per frame).
 *
 * This file owns the rules so the React components can stay thin: the
 * Properties panel asks "is this element linked?" and "what topology
 * node compatible types pair with this element type?" without having
 * to know how the relationship is encoded.
 */

/**
 * Map a `TopologyNodeType` to the floor `ElementType`s it can link to.
 *
 * The mapping is intentionally narrow: an `access-point` topology node
 * pairs with `'access-point'` floor elements only — not jacks or
 * displays — because the operator's mental model is "this card on the
 * topology IS this physical AP on the floor." A loose mapping
 * (anything-to-anything) would let users link an AP node to a video
 * bar element, which surfaces as confusing nonsense in the linked
 * read-out ("AP node linked to Display VC-101"). A strict mapping
 * mirrors the M1 `IT_DEVICE_TYPES` vocabulary.
 *
 * `endpoint-group`, `cloud`, `isp`, and `wan-switch` have no floor
 * representation in M1 — they're abstractions that don't sit inside
 * the office walls — and therefore have no compatible types. The
 * picker UI uses an empty list to mean "this node type can't link to
 * a physical floor element," which matches reality.
 */
export const COMPATIBLE_FLOOR_TYPES: Record<TopologyNodeType, readonly ElementType[]> = {
  isp: [],
  'wan-switch': [],
  firewall: [],
  cloud: [],
  // Core / edge switches are physical rack-mounted boxes; a future M6.x
  // may introduce a 'switch' floor element. For now the closest analogue
  // on the floor is a network-jack cluster, so we leave the link surface
  // open by NOT listing one — pickers show "no compatible elements" and
  // the auto-link-by-serial pass simply finds nothing.
  'core-switch': [],
  'edge-switch': [],
  'access-point': ['access-point'],
  'endpoint-group': [],
} as const

/**
 * Inverse lookup of `COMPATIBLE_FLOOR_TYPES` — given an IT-device
 * floor element's type, which topology node types can hold a link to
 * it? Used by the floor-side "Add to network topology" affordance to
 * pick a matching node type when creating the new node.
 *
 * Today there's a 1:1 between `'access-point'` floor and `'access-point'`
 * topology, so the inverse is single-valued. Kept as a function (not
 * a const map) to avoid the verbose copy-of-COMPATIBLE_FLOOR_TYPES
 * declaration; if the mapping ever fans out we'll extend the function.
 */
export function topologyNodeTypeForElement(elementType: ElementType): TopologyNodeType | null {
  for (const [nodeType, floorTypes] of Object.entries(COMPATIBLE_FLOOR_TYPES) as Array<
    [TopologyNodeType, readonly ElementType[]]
  >) {
    if (floorTypes.includes(elementType)) return nodeType
  }
  return null
}

/**
 * Walk every topology node looking for one that references the given
 * floor element id. Returns `null` when no match (the floor element is
 * "unlinked" from the topology side).
 *
 * Runs O(n) over topology nodes — see file header for the rationale.
 */
export function findTopologyNodeForElement(
  topology: NetworkTopology | null | undefined,
  elementId: string,
): TopologyNode | null {
  if (!topology) return null
  for (const node of Object.values(topology.nodes)) {
    if (node.floorElementId === elementId) return node
  }
  return null
}

/**
 * Walk every topology node looking for any that holds a link reference.
 * Returns the SET of element ids that are already taken (referenced by
 * some topology node). Used by `findUnlinkedFloorElements` to filter the
 * picker list, and by `linkNodeToElement` in the store to reject a
 * second link to an already-claimed element.
 */
export function findLinkedElementIds(topology: NetworkTopology | null | undefined): Set<string> {
  const claimed = new Set<string>()
  if (!topology) return claimed
  for (const node of Object.values(topology.nodes)) {
    if (node.floorElementId) claimed.add(node.floorElementId)
  }
  return claimed
}

export interface FloorElementCandidate {
  floorId: string
  floorName: string
  element: CanvasElement
}

/**
 * Walk every floor's elements, collecting any IT-device element whose
 * type is compatible with the given topology node type AND that is NOT
 * already linked from some other topology node.
 *
 * The "unlinked" filter is the cardinality enforcement on the picker
 * UI side: a floor element can be referenced by at most ONE topology
 * node, so we hide elements that are already claimed. The store-side
 * `linkNodeToElement` guard catches the same case (race conditions, a
 * stale picker), but filtering here is what gives the user a clean
 * picker list rather than a list with greyed-out rows.
 *
 * Returns a flat array (not grouped by floor) so the picker UI is free
 * to group / sort however it wants. Each entry carries the owning
 * floor's name so the picker can show "AP-12 on Engineering loft"
 * without re-walking the floor list per row.
 */
export function findUnlinkedFloorElements(
  floors: readonly Floor[],
  topology: NetworkTopology | null | undefined,
  nodeType: TopologyNodeType,
): FloorElementCandidate[] {
  const compatible = COMPATIBLE_FLOOR_TYPES[nodeType]
  if (!compatible || compatible.length === 0) return []
  const claimed = findLinkedElementIds(topology)
  const candidates: FloorElementCandidate[] = []
  for (const floor of floors) {
    for (const element of Object.values(floor.elements)) {
      if (!isITDevice(element)) continue
      if (!compatible.includes(element.type)) continue
      if (claimed.has(element.id)) continue
      candidates.push({ floorId: floor.id, floorName: floor.name, element })
    }
  }
  return candidates
}

/**
 * Find all IT-device floor elements (across every floor) whose serial
 * number EQUALS the given target. Case-insensitive and trimmed: a
 * topology node's `serialNumber` field is hand-typed and tends to drift
 * in case ("Q3CD-001" vs "q3cd-001") — we normalise both sides so the
 * "Auto-link by serial" flow doesn't surprise the user with a near-miss
 * non-match.
 *
 * Empty / null serials are never considered a match (we'd otherwise
 * link every blank-serial element to every blank-serial node, which is
 * never what the operator wants).
 */
export function findElementsBySerial(
  floors: readonly Floor[],
  serial: string | null | undefined,
): FloorElementCandidate[] {
  if (!serial) return []
  const target = serial.trim().toLowerCase()
  if (target.length === 0) return []
  const out: FloorElementCandidate[] = []
  for (const floor of floors) {
    for (const element of Object.values(floor.elements)) {
      if (!isITDevice(element)) continue
      // Every IT-device interface in M1 carries a `serialNumber?: string | null`
      // field at the same path. We read off the loose shape rather than a
      // discriminated cast because every IT type has it — the property
      // existence check is sufficient.
      const elSerial = (element as { serialNumber?: string | null }).serialNumber
      if (!elSerial) continue
      if (elSerial.trim().toLowerCase() === target) {
        out.push({ floorId: floor.id, floorName: floor.name, element })
      }
    }
  }
  return out
}
