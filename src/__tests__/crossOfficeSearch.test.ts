import { describe, it, expect } from 'vitest'
import {
  searchAllOffices,
  type SearchableOffice,
} from '../lib/crossOfficeSearch'

/**
 * Cross-office search — pure function exercise. No stores, no DOM. Each
 * test builds the minimum `SearchableOffice` shape needed to make the
 * assertion meaningful and relies on the upstream UI to render the
 * results.
 */

function makeOffice(overrides: Partial<SearchableOffice>): SearchableOffice {
  return {
    officeId: 'o-hq',
    officeSlug: 'hq',
    officeName: 'HQ',
    employees: [],
    elements: [],
    neighborhoods: [],
    ...overrides,
  }
}

describe('searchAllOffices', () => {
  it('returns no results for an empty / too-short query', () => {
    const offices = [
      makeOffice({ employees: [{ id: 'e1', name: 'Alice', department: 'Eng', title: null }] }),
    ]
    expect(searchAllOffices('', offices)).toEqual([])
    expect(searchAllOffices(' ', offices)).toEqual([])
    expect(searchAllOffices('a', offices)).toEqual([])
  })

  it('matches across every office (employees, elements, neighborhoods, office name)', () => {
    const offices = [
      makeOffice({
        officeId: 'o-hq',
        officeSlug: 'hq',
        officeName: 'HQ Alpine',
        employees: [
          { id: 'e1', name: 'Alpha Anderson', department: 'Eng', title: null },
        ],
        elements: [
          { id: 'el1', label: 'Alpha Desk', type: 'desk', floorId: 'f1' },
        ],
        neighborhoods: [{ id: 'n1', name: 'Alpha Pod', floorId: 'f1' }],
      }),
      makeOffice({
        officeId: 'o-alps',
        officeSlug: 'alps',
        officeName: 'Alps Outpost',
        employees: [
          { id: 'e2', name: 'Bob Baker', department: 'Sales', title: null },
        ],
        elements: [],
        neighborhoods: [],
      }),
    ]
    const results = searchAllOffices('alp', offices)
    const kinds = results.map((r) => `${r.officeId}:${r.kind}:${r.id}`)
    // Alice, Alpha desk, Alpha Pod, Alps Outpost (office) — Bob filtered out.
    expect(kinds).toContain('o-hq:employee:e1')
    expect(kinds).toContain('o-hq:element:el1')
    expect(kinds).toContain('o-hq:neighborhood:n1')
    expect(kinds).toContain('o-alps:office:o-alps')
    expect(kinds).not.toContain('o-alps:employee:e2')
  })

  it('prefers prefix matches over mid-label matches', () => {
    const offices = [
      makeOffice({
        employees: [
          { id: 'mid', name: 'Samantha Anderson', department: null, title: null },
          { id: 'pre', name: 'Andy Smith', department: null, title: null },
        ],
      }),
    ]
    const results = searchAllOffices('and', offices)
    // Prefix hit (Andy) should rank above the mid-label hit (Samantha Anderson).
    expect(results[0].id).toBe('pre')
  })

  it('breaks ties by kind ordering (office > employee > neighborhood > element)', () => {
    // All four kinds match the same query with identical label text, so
    // only the kind-rank tiebreaker distinguishes them.
    const offices = [
      makeOffice({
        officeId: 'o-test',
        officeSlug: 'test',
        officeName: 'Foo',
        employees: [{ id: 'e', name: 'Foo', department: null, title: null }],
        elements: [{ id: 'el', label: 'Foo', type: 'desk', floorId: 'f1' }],
        neighborhoods: [{ id: 'n', name: 'Foo', floorId: 'f1' }],
      }),
    ]
    const results = searchAllOffices('foo', offices)
    const order = results.map((r) => r.kind)
    expect(order.indexOf('office')).toBeLessThan(order.indexOf('employee'))
    expect(order.indexOf('employee')).toBeLessThan(order.indexOf('neighborhood'))
    expect(order.indexOf('neighborhood')).toBeLessThan(order.indexOf('element'))
  })

  it('is case-insensitive', () => {
    const offices = [
      makeOffice({
        employees: [
          { id: 'e1', name: 'Elena ZOË', department: null, title: null },
        ],
      }),
    ]
    expect(searchAllOffices('zoe'.toUpperCase(), offices)).toHaveLength(0)
    expect(searchAllOffices('elena', offices)).toHaveLength(1)
    expect(searchAllOffices('ELENA', offices)).toHaveLength(1)
  })
})
