import { create } from 'zustand'
import type { NodeChange, EdgeChange } from '@xyflow/react'
import {
  type NetworkTopology,
  type TopologyEdge,
  type TopologyNode,
  createEmptyTopology,
} from '../types/networkTopology'
import { layeredLayout } from '../lib/networkTopologyLayout'

/**
 * M6.1 — Network topology store.
 *
 * Owns the office's logical network diagram (ISP → firewall → core →
 * edge → access → endpoints) and the typed connections between nodes.
 * Mirrors the `NetworkTopology` shape directly so the persistence path
 * is just `state.topology` ⇆ `payload.networkTopology` — no transform
 * needed at save or load time beyond the legacy back-fill.
 *
 * # Why a dedicated store
 *
 * The topology is unrelated to the `elementsStore` (Konva floor-plan
 * canvas) and the `itLayerStore` (View-menu visibility flags). Mixing
 * topology nodes into the elements map would couple react-flow into
 * every floor-plan code path; mixing into `itLayerStore` would conflate
 * "is this layer visible on the floor" with "is this device on the
 * topology graph". Keeping it on its own store lets each surface evolve
 * (M6.2 auto-layout, M6.3 BOM derivation) without churning the others.
 *
 * # Action surface
 *
 * The granular actions (`addNode`, `updateNode`, `removeNode`, etc.)
 * are the API the React components call. The bulk `applyNodeChanges`
 * / `applyEdgeChanges` actions are the bridge to react-flow's
 * controlled-state model: react-flow emits a `NodeChange[]` /
 * `EdgeChange[]` on every interaction (drag, select, dimension
 * measurement), and we route those through the store so positions
 * round-trip into the persisted payload.
 *
 * # Removing a node cascades to its edges
 *
 * Removing a node also removes any edge whose `source` or `target` is
 * that node. Without this, react-flow would render a dangling edge
 * pointing at a missing node id and either crash or render nothing
 * (the failure mode varies by react-flow version). Cascading the
 * delete in the store keeps the canvas state consistent regardless of
 * how the removal was triggered (delete key, properties panel button,
 * react-flow's own change stream).
 */

interface NetworkTopologyState {
  topology: NetworkTopology | null

  // ---- Hydration ----
  setTopology: (t: NetworkTopology | null) => void
  /** Clear back to a fresh empty topology for the given office. */
  resetTopology: (officeId: string) => void

  // ---- Node actions ----
  addNode: (node: TopologyNode) => void
  updateNode: (id: string, partial: Partial<TopologyNode>) => void
  removeNode: (id: string) => void
  setNodePosition: (id: string, x: number, y: number) => void

  // ---- Edge actions ----
  addEdge: (edge: TopologyEdge) => void
  updateEdge: (id: string, partial: Partial<TopologyEdge>) => void
  removeEdge: (id: string) => void

  // ---- react-flow bulk bridges ----
  applyNodeChanges: (changes: NodeChange[]) => void
  applyEdgeChanges: (changes: EdgeChange[]) => void

  // ---- M6.2 — auto-layout ----
  /**
   * Snap every node to its band-correct position via `layeredLayout`
   * and clear `layoutLocked`. Idempotent — running twice with no
   * intervening drag yields the same positions. Used by the
   * "Auto-arrange" button and (in the unlocked default) implicitly
   * after `addNode`.
   */
  applyAutoLayout: () => void

  // ---- M6.6 — bidirectional floor-plan ↔ topology linkage ----
  /**
   * Link an existing topology node to a floor-plan element id.
   *
   * Returns `true` on success and `false` when the link is rejected
   * because some OTHER topology node already references this element.
   * (A topology node is allowed to re-link to the SAME element it's
   * already pointing at — the operation is idempotent.)
   *
   * The cardinality is enforced here, not just at the picker boundary,
   * because a stale picker ("I opened the modal before someone else
   * linked this element") would otherwise create a double-link. The
   * store is the only place where the relationship lives, so it's the
   * only place that can authoritatively say "this element is taken."
   */
  linkNodeToElement: (nodeId: string, elementId: string) => boolean

  /**
   * Clear a node's `floorElementId` (set it back to `null`). No-op when
   * the node doesn't exist or is already unlinked. The mirror to
   * `linkNodeToElement` — the floor element it used to point at
   * automatically becomes "unlinked" because the back-reference was
   * derived (see `findTopologyNodeForElement`).
   */
  unlinkNode: (nodeId: string) => void
}

/**
 * Bump the `updatedAt` timestamp on every mutation. The save plumbing
 * doesn't strictly need this (the office row's `updated_at` is the
 * source of truth for collaborative-edit conflict detection), but
 * future M6.6 floor-plan sync may want a per-topology timestamp to
 * reconcile against. Cheap to maintain, expensive to retrofit.
 */
function withTouched<T extends NetworkTopology>(t: T): T {
  return { ...t, updatedAt: new Date().toISOString() }
}

export const useNetworkTopologyStore = create<NetworkTopologyState>((set, get) => ({
  topology: null,

  setTopology: (t) => set({ topology: t }),

  resetTopology: (officeId) => set({ topology: createEmptyTopology(officeId) }),

  addNode: (node) =>
    set((s) => {
      if (!s.topology) return s
      const nextNodes = { ...s.topology.nodes, [node.id]: node }
      // M6.2: while the user hasn't manually arranged the canvas
      // (`layoutLocked === false`), every add re-flows the whole
      // graph into the layered hierarchy. The cost is a pure-function
      // pass over a ~50-node map; the win is a fresh canvas that
      // Just Looks Right after the first few clicks. Once the user
      // drags a node, `layoutLocked` flips and adds stop reshuffling.
      let nextNodesPositioned = nextNodes
      if (!s.topology.layoutLocked) {
        const positions = layeredLayout(nextNodes)
        const repositioned: Record<string, TopologyNode> = {}
        for (const [id, n] of Object.entries(nextNodes)) {
          const p = positions[id]
          repositioned[id] = p ? { ...n, position: { x: p.x, y: p.y } } : n
        }
        nextNodesPositioned = repositioned
      }
      return {
        topology: withTouched({
          ...s.topology,
          nodes: nextNodesPositioned,
        }),
      }
    }),

  updateNode: (id, partial) =>
    set((s) => {
      if (!s.topology) return s
      const existing = s.topology.nodes[id]
      if (!existing) return s
      return {
        topology: withTouched({
          ...s.topology,
          nodes: { ...s.topology.nodes, [id]: { ...existing, ...partial, id } },
        }),
      }
    }),

  removeNode: (id) =>
    set((s) => {
      if (!s.topology) return s
      // Cascade: drop every edge that touches the node we're removing.
      // See header comment for the rationale; this keeps the renderer
      // from receiving dangling source/target references.
      const nextNodes: Record<string, TopologyNode> = {}
      for (const [k, v] of Object.entries(s.topology.nodes)) {
        if (k !== id) nextNodes[k] = v
      }
      const nextEdges: Record<string, TopologyEdge> = {}
      for (const [k, e] of Object.entries(s.topology.edges)) {
        if (e.source !== id && e.target !== id) nextEdges[k] = e
      }
      return {
        topology: withTouched({
          ...s.topology,
          nodes: nextNodes,
          edges: nextEdges,
        }),
      }
    }),

  setNodePosition: (id, x, y) =>
    set((s) => {
      if (!s.topology) return s
      const existing = s.topology.nodes[id]
      if (!existing) return s
      // Snap-to-grid is intentionally NOT applied here — react-flow
      // owns the snap behavior at the canvas level (we configure it
      // on the <ReactFlow> component). Doing it here too would either
      // double-snap or fight react-flow's own internal coordinates.
      //
      // M6.2: a manual position update flips `layoutLocked` to true.
      // From now on, auto-layout is opt-in only via the button.
      // `setNodePosition` is the path the canvas dispatches to on
      // drag-end (via `applyNodeChanges` → position change), so this
      // is the correct boundary to mark "user took control".
      return {
        topology: withTouched({
          ...s.topology,
          layoutLocked: true,
          nodes: {
            ...s.topology.nodes,
            [id]: { ...existing, position: { x, y } },
          },
        }),
      }
    }),

  addEdge: (edge) =>
    set((s) => {
      if (!s.topology) return s
      // Refuse to add an edge that references a node id we don't
      // know about. Same defensive rationale as the cascade in
      // removeNode: a dangling edge corrupts the renderer.
      if (!s.topology.nodes[edge.source] || !s.topology.nodes[edge.target]) {
        return s
      }
      return {
        topology: withTouched({
          ...s.topology,
          edges: { ...s.topology.edges, [edge.id]: edge },
        }),
      }
    }),

  updateEdge: (id, partial) =>
    set((s) => {
      if (!s.topology) return s
      const existing = s.topology.edges[id]
      if (!existing) return s
      return {
        topology: withTouched({
          ...s.topology,
          edges: { ...s.topology.edges, [id]: { ...existing, ...partial, id } },
        }),
      }
    }),

  removeEdge: (id) =>
    set((s) => {
      if (!s.topology) return s
      const next: Record<string, TopologyEdge> = {}
      for (const [k, v] of Object.entries(s.topology.edges)) {
        if (k !== id) next[k] = v
      }
      return {
        topology: withTouched({ ...s.topology, edges: next }),
      }
    }),

  applyNodeChanges: (changes) => {
    // react-flow's change stream is granular — `position` (during a
    // drag), `dimensions` (after measurement), `select`, `remove`. We
    // only persist position + remove; selection/dimensions are pure UI
    // state owned by react-flow's internal store. Filtering at this
    // boundary keeps the persisted payload from churning on every
    // hover/measure.
    const t = get().topology
    if (!t) return
    let nextNodes = t.nodes
    let nextEdges = t.edges
    let mutated = false
    // M6.2: any position change in the react-flow change stream
    // counts as a manual drag (react-flow only emits this on user
    // movement, not on programmatic position assignment via our
    // batch updates), so we flip `layoutLocked` once we see one.
    let lockLayout = false
    for (const c of changes) {
      if (c.type === 'position') {
        const id = c.id
        const existing = nextNodes[id]
        if (!existing || !c.position) continue
        nextNodes = {
          ...nextNodes,
          [id]: { ...existing, position: { x: c.position.x, y: c.position.y } },
        }
        mutated = true
        lockLayout = true
      } else if (c.type === 'remove') {
        const id = c.id
        if (!nextNodes[id]) continue
        const filteredNodes: Record<string, TopologyNode> = {}
        for (const [k, v] of Object.entries(nextNodes)) {
          if (k !== id) filteredNodes[k] = v
        }
        nextNodes = filteredNodes
        // Cascade edge removal — same invariant as `removeNode`.
        const filteredEdges: Record<string, TopologyEdge> = {}
        for (const [k, e] of Object.entries(nextEdges)) {
          if (e.source !== id && e.target !== id) filteredEdges[k] = e
        }
        nextEdges = filteredEdges
        mutated = true
      }
    }
    if (!mutated) return
    set({
      topology: withTouched({
        ...t,
        nodes: nextNodes,
        edges: nextEdges,
        layoutLocked: t.layoutLocked || lockLayout,
      }),
    })
  },

  applyEdgeChanges: (changes) => {
    const t = get().topology
    if (!t) return
    let nextEdges = t.edges
    let mutated = false
    for (const c of changes) {
      if (c.type === 'remove') {
        const id = c.id
        if (!nextEdges[id]) continue
        const filtered: Record<string, TopologyEdge> = {}
        for (const [k, v] of Object.entries(nextEdges)) {
          if (k !== id) filtered[k] = v
        }
        nextEdges = filtered
        mutated = true
      }
    }
    if (!mutated) return
    set({ topology: withTouched({ ...t, edges: nextEdges }) })
  },

  applyAutoLayout: () =>
    set((s) => {
      if (!s.topology) return s
      // Pure layout pass — see `layeredLayout` for the algorithm.
      // We re-key the nodes map immutably so react-flow re-renders
      // every node in one frame, rather than animating each
      // position write separately (which would visibly cascade).
      const positions = layeredLayout(s.topology.nodes)
      const repositioned: Record<string, TopologyNode> = {}
      for (const [id, n] of Object.entries(s.topology.nodes)) {
        const p = positions[id]
        repositioned[id] = p ? { ...n, position: { x: p.x, y: p.y } } : n
      }
      return {
        topology: withTouched({
          ...s.topology,
          // Auto-layout is the user's escape hatch from a messy manual
          // arrangement. Clearing the lock here means a subsequent add
          // will continue to land in its band-correct spot — until the
          // user drags again.
          layoutLocked: false,
          nodes: repositioned,
        }),
      }
    }),

  linkNodeToElement: (nodeId, elementId) => {
    const t = get().topology
    if (!t) return false
    const target = t.nodes[nodeId]
    if (!target) return false
    // Reject the link if some OTHER topology node already references
    // this element. The "OTHER" check matters: re-linking the same
    // node to the same element should be a no-op success (idempotent),
    // not a failure — that's the natural behaviour of clicking "Link"
    // twice in the picker.
    for (const other of Object.values(t.nodes)) {
      if (other.id === nodeId) continue
      if (other.floorElementId === elementId) return false
    }
    set({
      topology: withTouched({
        ...t,
        nodes: {
          ...t.nodes,
          [nodeId]: { ...target, floorElementId: elementId },
        },
      }),
    })
    return true
  },

  unlinkNode: (nodeId) =>
    set((s) => {
      if (!s.topology) return s
      const target = s.topology.nodes[nodeId]
      if (!target) return s
      // No-op when the node is already unlinked. Saves a touched
      // timestamp on a state that didn't actually change.
      if (target.floorElementId == null) return s
      return {
        topology: withTouched({
          ...s.topology,
          nodes: {
            ...s.topology.nodes,
            [nodeId]: { ...target, floorElementId: null },
          },
        }),
      }
    }),
}))
