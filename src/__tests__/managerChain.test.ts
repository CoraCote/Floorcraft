import { describe, it, expect } from 'vitest'
import { findManagerCycle, getManagerChain } from '../lib/managerChain'
import type { Employee } from '../types/employee'

function emp(id: string, managerId: string | null = null): Employee {
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
    seatId: null,
    floorId: null,
    createdAt: new Date().toISOString(),
  }
}

function toMap(list: Employee[]): Record<string, Employee> {
  return Object.fromEntries(list.map((e) => [e.id, e]))
}

describe('findManagerCycle', () => {
  it('returns null for a valid tree', () => {
    const employees = toMap([
      emp('a'),
      emp('b', 'a'),
      emp('c', 'a'),
    ])
    // Assigning B as C's manager is fine — no loop.
    expect(findManagerCycle(employees, 'c', 'b')).toBeNull()
  })

  it('returns null when candidate is null (unassigning)', () => {
    const employees = toMap([emp('a'), emp('b', 'a')])
    expect(findManagerCycle(employees, 'b', null)).toBeNull()
  })

  it('detects a self-reference', () => {
    const employees = toMap([emp('a')])
    const cycle = findManagerCycle(employees, 'a', 'a')
    expect(cycle).not.toBeNull()
    expect(cycle).toEqual(['a', 'a'])
  })

  it('detects a simple 2-node cycle (A manages B, then make B manage A)', () => {
    // Current state: B reports to A. Now try to set A's manager to B.
    const employees = toMap([emp('a'), emp('b', 'a')])
    const cycle = findManagerCycle(employees, 'a', 'b')
    expect(cycle).not.toBeNull()
    // Path reads start → candidate → … → start so the UI can render it
    // verbatim: "A → B → A".
    expect(cycle![0]).toBe('a')
    expect(cycle![cycle!.length - 1]).toBe('a')
    expect(cycle).toContain('b')
  })

  it('detects a 3-node cycle', () => {
    // B reports to A, C reports to B. Now try to make A report to C —
    // that closes a 3-node loop A → C → B → A.
    const employees = toMap([emp('a'), emp('b', 'a'), emp('c', 'b')])
    const cycle = findManagerCycle(employees, 'a', 'c')
    expect(cycle).not.toBeNull()
    expect(cycle![0]).toBe('a')
    expect(cycle![cycle!.length - 1]).toBe('a')
    expect(cycle).toContain('b')
    expect(cycle).toContain('c')
  })

  it('does not flag writes that leave the existing tree loop-free', () => {
    // Flat tree. Re-assigning D under C is fine.
    const employees = toMap([
      emp('a'),
      emp('b', 'a'),
      emp('c', 'a'),
      emp('d', 'b'),
    ])
    expect(findManagerCycle(employees, 'd', 'c')).toBeNull()
  })
})

describe('getManagerChain', () => {
  it('walks up a clean chain', () => {
    const employees = toMap([
      emp('ceo'),
      emp('vp', 'ceo'),
      emp('dir', 'vp'),
      emp('ic', 'dir'),
    ])
    const chain = getManagerChain(employees, 'ic')
    expect(chain.map((e) => e.id)).toEqual(['dir', 'vp', 'ceo'])
  })

  it('returns empty chain for someone with no manager', () => {
    const employees = toMap([emp('a')])
    expect(getManagerChain(employees, 'a')).toEqual([])
  })

  it('survives a pre-existing cycle without hanging', () => {
    // Corrupt import: A→B→A loop. Walker should break out, not spin.
    const employees = toMap([emp('a', 'b'), emp('b', 'a')])
    const chain = getManagerChain(employees, 'a')
    // Exact ordering depends on walk direction — just assert it terminated
    // and produced at most the cap's worth of entries.
    expect(chain.length).toBeLessThanOrEqual(100)
    // And didn't revisit the start.
    expect(chain.map((e) => e.id)).not.toContain('a')
  })

  it('caps the walk at 100 even if the graph is deeper', () => {
    // Build a 200-deep linear chain (pathological but legal) to prove the
    // walker stops. Each node reports to the next; the last one has no
    // manager so we'd normally walk all 199 entries.
    const chain: Employee[] = []
    for (let i = 0; i < 200; i++) {
      chain.push(emp(`e${i}`, i < 199 ? `e${i + 1}` : null))
    }
    const employees = toMap(chain)
    const walked = getManagerChain(employees, 'e0')
    expect(walked.length).toBe(100)
  })
})
