import { describe, it, expect } from 'vitest'
import { analyzeNeighborhoodDepartments } from '../lib/analyzers/neighborhoods'
import { buildAnalyzerInput } from '../lib/analyzers'
import type { DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'

function desk(id: string, x: number, y: number, assigned: string | null): DeskElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Desk',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: `DSK-${id}`,
    assignedEmployeeId: assigned,
    capacity: 1,
  }
}

function emp(id: string, department: string | null): Employee {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    department,
    team: null,
    title: null,
    managerId: null,
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
    pendingStatusChanges: [],
    seatId: null,
    floorId: null,
    createdAt: '2025-01-01',
  }
}

const neighborhood: Neighborhood = {
  id: 'n1',
  name: 'Engineering Pod A',
  color: '#3B82F6',
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  floorId: 'floor-1',
  department: 'Engineering',
}

describe('analyzeNeighborhoodDepartments', () => {
  it('emits an insight when an assigned seat employee is in a different department', () => {
    const e1 = emp('e1', 'Sales')
    const e2 = emp('e2', 'Sales')
    const e3 = emp('e3', 'Engineering')
    const elements = [
      desk('a', 50, 50, 'e1'),   // inside, Sales (mismatch)
      desk('b', 120, 120, 'e2'), // inside, Sales (mismatch)
      desk('c', 100, 100, 'e3'), // inside, Engineering (ok)
    ]
    const input = buildAnalyzerInput(elements, [e1, e2, e3])
    const empById = new Map([
      ['e1', { department: 'Sales' }],
      ['e2', { department: 'Sales' }],
      ['e3', { department: 'Engineering' }],
    ])
    const insights = analyzeNeighborhoodDepartments(input, [neighborhood], empById)
    expect(insights).toHaveLength(1)
    expect(insights[0].title).toMatch(/2 seats in Engineering Pod A assigned to Sales/)
    expect(insights[0].relatedEmployeeIds.sort()).toEqual(['e1', 'e2'])
    expect(insights[0].severity).toBe('warning')
  })

  it('emits no insight when all inside-seats match the neighborhood department', () => {
    const e1 = emp('e1', 'Engineering')
    const elements = [desk('a', 100, 100, 'e1')]
    const input = buildAnalyzerInput(elements, [e1])
    const empById = new Map([['e1', { department: 'Engineering' }]])
    const insights = analyzeNeighborhoodDepartments(input, [neighborhood], empById)
    expect(insights).toEqual([])
  })

  it('ignores neighborhoods without a department set', () => {
    const e1 = emp('e1', 'Sales')
    const elements = [desk('a', 100, 100, 'e1')]
    const input = buildAnalyzerInput(elements, [e1])
    const empById = new Map([['e1', { department: 'Sales' }]])
    const noDept = { ...neighborhood, department: null }
    const insights = analyzeNeighborhoodDepartments(input, [noDept], empById)
    expect(insights).toEqual([])
  })

  it('ignores seats outside the neighborhood', () => {
    const e1 = emp('e1', 'Sales')
    const elements = [desk('a', 500, 500, 'e1')] // far outside
    const input = buildAnalyzerInput(elements, [e1])
    const empById = new Map([['e1', { department: 'Sales' }]])
    const insights = analyzeNeighborhoodDepartments(input, [neighborhood], empById)
    expect(insights).toEqual([])
  })

  it('ignores seats whose assignee has no department', () => {
    const e1 = emp('e1', null)
    const elements = [desk('a', 100, 100, 'e1')]
    const input = buildAnalyzerInput(elements, [e1])
    const empById = new Map([['e1', { department: null }]])
    const insights = analyzeNeighborhoodDepartments(input, [neighborhood], empById)
    expect(insights).toEqual([])
  })
})
