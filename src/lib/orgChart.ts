import type { Employee } from '../types/employee'

/**
 * Org-chart layout model. A `OrgTreeNode` wraps an employee with its
 * depth (root = 0) and the list of direct reports, pre-sorted by name.
 *
 * Shape notes:
 *   - The visualizer renders a flat list of `roots` top-down; children are
 *     recursed into.
 *   - `cycle` is non-null iff the input contains a reporting loop. When set,
 *     `roots` is empty — the caller is expected to render a banner listing
 *     the cycle members and refuse to draw the tree (otherwise recursion
 *     would hang).
 *   - `nodesById` lets callers jump to a specific node without re-walking.
 */
export interface OrgTreeNode {
  id: string
  name: string
  employee: Employee
  depth: number
  children: OrgTreeNode[]
}

export interface OrgTree {
  roots: OrgTreeNode[]
  cycle: string[] | null
  nodesById: Record<string, OrgTreeNode>
}

/**
 * Sentinel id used for the synthetic "No manager" bucket if consumers
 * ever need to represent orphans as a single virtual root. Today the
 * page renders orphans as true roots directly; the id is exported so
 * future consumers (export-to-PNG, printable handout) can latch onto a
 * stable key.
 */
export const SYNTHETIC_ROOT_ID = '__no-manager__'

/**
 * Detect a reporting cycle in `employees`. Returns the set of employee
 * ids that participate in the loop, or null if the reporting graph is a
 * forest. A single walk from each unvisited node is enough — once we
 * see an id that's on the current path, that path segment is the cycle.
 *
 * We deliberately scan the *whole* graph (not just a single candidate
 * write, as `findManagerCycle` does) because the visualizer is reading
 * real persisted data and any pre-existing cycle is fatal to rendering.
 */
function detectCycle(employees: Record<string, Employee>): string[] | null {
  // Classic three-color DFS. `state[id]`:
  //   undefined → unvisited
  //   'visiting' → on the current recursion stack
  //   'done' → fully processed, can't be on a new cycle
  const state: Record<string, 'visiting' | 'done'> = {}
  for (const startId of Object.keys(employees)) {
    if (state[startId]) continue
    // Walk up from `startId` following managerId. We record the path so
    // we can slice out the cycle members if we revisit.
    const path: string[] = []
    let cursor: string | null = startId
    while (cursor !== null) {
      if (state[cursor] === 'done') break
      if (state[cursor] === 'visiting') {
        // Cycle closed. The cycle is the tail of `path` starting at
        // `cursor` — every earlier element is a tree-shaped approach
        // path that merely leads into the loop.
        const idx = path.indexOf(cursor)
        if (idx >= 0) return path.slice(idx)
        // Cursor is `visiting` but isn't in path — shouldn't happen given
        // how we mark, but belt-and-braces: treat as cycle involving
        // cursor alone.
        return [cursor]
      }
      state[cursor] = 'visiting'
      path.push(cursor)
      const mgr: Employee | undefined = employees[cursor]
      // Missing manager id (ghost reference) → the chain terminates here
      // as an orphan root, not a cycle.
      if (!mgr) break
      cursor = mgr.managerId
    }
    for (const id of path) state[id] = 'done'
  }
  return null
}

/**
 * Build the renderable org-tree from an employee map. Root nodes are
 * employees with `managerId === null` OR whose manager id doesn't
 * resolve to an employee in the map (orphans from a stale delete).
 *
 * Siblings are sorted by `name` (case-insensitive) so the layout is
 * stable across store mutations — otherwise JavaScript's insertion-
 * order semantics would let a single edit shuffle every neighbour.
 *
 * If the graph has a cycle, we short-circuit: `roots` is returned empty
 * and `cycle` holds the participating ids. Callers must check `cycle`
 * before recursing into `roots`.
 */
export function buildOrgTree(employees: Record<string, Employee>): OrgTree {
  const cycle = detectCycle(employees)
  if (cycle) {
    return { roots: [], cycle, nodesById: {} }
  }

  const nodesById: Record<string, OrgTreeNode> = {}
  for (const e of Object.values(employees)) {
    nodesById[e.id] = {
      id: e.id,
      name: e.name,
      employee: e,
      depth: 0, // overwritten during assembly
      children: [],
    }
  }

  const roots: OrgTreeNode[] = []
  for (const e of Object.values(employees)) {
    const node = nodesById[e.id]
    // True root: no manager set, OR manager points at a non-existent id
    // (orphan from a delete race). Both surface at depth 0.
    const parent = e.managerId ? nodesById[e.managerId] : undefined
    if (!parent) {
      roots.push(node)
    } else {
      parent.children.push(node)
    }
  }

  // Stable sort (by lowercase name). Apply to roots + every non-leaf
  // level. Doing this in one pass after the graph is shaped keeps the
  // logic readable.
  const byName = (a: OrgTreeNode, b: OrgTreeNode): number => {
    const an = a.name.toLowerCase()
    const bn = b.name.toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    return 0
  }
  const assignDepth = (node: OrgTreeNode, depth: number): void => {
    node.depth = depth
    node.children.sort(byName)
    for (const c of node.children) assignDepth(c, depth + 1)
  }
  roots.sort(byName)
  for (const r of roots) assignDepth(r, 0)

  return { roots, cycle: null, nodesById }
}
