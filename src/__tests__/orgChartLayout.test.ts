import { describe, it, expect } from 'vitest'
import { buildOrgTree, SYNTHETIC_ROOT_ID } from '../lib/orgChart'
import type { Employee } from '../types/employee'

/**
 * Minimal Employee fixture. Mirrors the shape used in
 * `managerChain.test.ts`; every required field is present so the union
 * type stays honest — in particular `accommodations` and
 * `pendingStatusChanges` are non-optional arrays.
 */
function emp(id: string, managerId: string | null = null, extra: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id.toUpperCase(),
    email: '',
    department: null,
    team: null,
    title: null,
    managerId,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [],
    startDate: null,
    endDate: null,
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    sensitivityTags: [],
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function toMap(list: Employee[]): Record<string, Employee> {
  return Object.fromEntries(list.map((e) => [e.id, e]))
}

describe('buildOrgTree', () => {
  it('returns an empty tree for an empty employee map', () => {
    const t = buildOrgTree({})
    expect(t.roots).toEqual([])
    expect(t.cycle).toBeNull()
    expect(t.nodesById).toEqual({})
  })

  it('places top-level employees (managerId=null) under a synthetic root', () => {
    const employees = toMap([emp('a'), emp('b')])
    const t = buildOrgTree(employees)
    // Both are true roots → they surface directly in `roots`, not nested.
    expect(t.roots.map((n) => n.id).sort()).toEqual(['a', 'b'])
    // No cycle.
    expect(t.cycle).toBeNull()
  })

  it('nests reports under their manager', () => {
    const employees = toMap([
      emp('ceo'),
      emp('vp', 'ceo'),
      emp('ic', 'vp'),
    ])
    const t = buildOrgTree(employees)
    expect(t.roots).toHaveLength(1)
    const ceo = t.roots[0]
    expect(ceo.id).toBe('ceo')
    expect(ceo.depth).toBe(0)
    expect(ceo.children).toHaveLength(1)
    const vp = ceo.children[0]
    expect(vp.id).toBe('vp')
    expect(vp.depth).toBe(1)
    expect(vp.children).toHaveLength(1)
    expect(vp.children[0].id).toBe('ic')
    expect(vp.children[0].depth).toBe(2)
  })

  it('treats employees whose manager is missing from the map as orphan roots', () => {
    // `ghost` managerId refers to an employee that no longer exists —
    // common after a departed-manager cleanup lag.
    const employees = toMap([emp('orphan', 'ghost')])
    const t = buildOrgTree(employees)
    expect(t.roots.map((n) => n.id)).toEqual(['orphan'])
    expect(t.cycle).toBeNull()
  })

  it('sorts siblings by name for a stable layout', () => {
    const employees = toMap([
      emp('boss'),
      emp('alpha', 'boss', { name: 'Alpha' }),
      emp('bravo', 'boss', { name: 'Bravo' }),
      emp('charlie', 'boss', { name: 'Charlie' }),
    ])
    const t = buildOrgTree(employees)
    expect(t.roots[0].children.map((c) => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('detects a simple 2-node cycle and refuses to render a tree', () => {
    // A reports to B, B reports to A — pathological import.
    const employees = toMap([emp('a', 'b'), emp('b', 'a')])
    const t = buildOrgTree(employees)
    expect(t.cycle).not.toBeNull()
    // The cycle members must include both of them.
    expect(t.cycle!).toEqual(expect.arrayContaining(['a', 'b']))
    // When a cycle is present, `roots` is empty — the caller is expected to
    // render a banner and skip the tree.
    expect(t.roots).toEqual([])
  })

  it('detects a 3-node cycle', () => {
    // A → B → C → A.
    const employees = toMap([
      emp('a', 'c'),
      emp('b', 'a'),
      emp('c', 'b'),
    ])
    const t = buildOrgTree(employees)
    expect(t.cycle).not.toBeNull()
    expect(t.cycle!.sort()).toEqual(['a', 'b', 'c'])
    expect(t.roots).toEqual([])
  })

  it('nodesById exposes every rendered node so callers can look up by id', () => {
    const employees = toMap([
      emp('ceo'),
      emp('vp', 'ceo'),
      emp('ic', 'vp'),
    ])
    const t = buildOrgTree(employees)
    expect(Object.keys(t.nodesById).sort()).toEqual(['ceo', 'ic', 'vp'])
    expect(t.nodesById['ic'].depth).toBe(2)
  })

  it('does not mutate the input employee map', () => {
    const employees = toMap([emp('a'), emp('b', 'a')])
    const snapshot = JSON.parse(JSON.stringify(employees))
    buildOrgTree(employees)
    expect(employees).toEqual(snapshot)
  })

  // Sanity check: the exported SYNTHETIC_ROOT_ID should be distinguishable
  // from any real employee id (starts with a character nanoid can't emit).
  it('exports a SYNTHETIC_ROOT_ID sentinel for the "No manager" bucket', () => {
    expect(SYNTHETIC_ROOT_ID.startsWith('__')).toBe(true)
  })
})
