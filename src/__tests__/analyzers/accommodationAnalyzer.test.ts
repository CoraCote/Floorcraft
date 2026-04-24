import { describe, it, expect } from 'vitest'
import { analyzeAccommodations } from '../../lib/analyzers/accommodationAnalyzer'
import type {
  CanvasElement,
  PrivateOfficeElement,
} from '../../types/elements'
import type { Accommodation, Employee } from '../../types/employee'

function makePrivateOffice(
  overrides: Partial<PrivateOfficeElement> = {},
): PrivateOfficeElement {
  return {
    id: overrides.id || 'po-1',
    type: 'private-office',
    x: 0, y: 0, width: 200, height: 160, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Office', visible: true,
    style: { fill: '#EFF6FF', stroke: '#1E3A5F', strokeWidth: 2, opacity: 1 },
    deskId: overrides.deskId || 'O-1',
    assignedEmployeeIds: overrides.assignedEmployeeIds ?? [],
    capacity: 1,
    ...overrides,
  } as PrivateOfficeElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], accommodations: [], sensitivityTags: [],
    pendingStatusChanges: [],
    seatId: null, floorId: null,
    status: 'active',
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function wheelchair(id = 'a1'): Accommodation {
  return {
    id,
    type: 'wheelchair-access',
    notes: null,
    createdAt: new Date().toISOString(),
  }
}

describe('analyzeAccommodations', () => {
  it('warns when a wheelchair-access employee is in a cramped private office', () => {
    const office = makePrivateOffice({ id: 'po-small', width: 90, assignedEmployeeIds: ['e1'] })
    const elements: CanvasElement[] = [office]
    const employees = [
      makeEmployee({ id: 'e1', name: 'Jane', seatId: 'po-small', accommodations: [wheelchair()] }),
    ]

    const result = analyzeAccommodations({ elements, employees, zones: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('warning')
    expect(result[0].title).toBe('Jane needs accessible path')
    expect(result[0].relatedElementIds).toEqual(['po-small'])
    expect(result[0].relatedEmployeeIds).toEqual(['e1'])
  })

  it('stays silent when the private office is wide enough', () => {
    const office = makePrivateOffice({ id: 'po-big', width: 200, assignedEmployeeIds: ['e1'] })
    const employees = [
      makeEmployee({ id: 'e1', seatId: 'po-big', accommodations: [wheelchair()] }),
    ]
    const result = analyzeAccommodations({ elements: [office], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('stays silent when the employee has no accommodations', () => {
    const office = makePrivateOffice({ id: 'po-small', width: 90, assignedEmployeeIds: ['e1'] })
    const employees = [makeEmployee({ id: 'e1', seatId: 'po-small' })]
    const result = analyzeAccommodations({ elements: [office], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('stays silent when the accommodation is not wheelchair-access', () => {
    const office = makePrivateOffice({ id: 'po-small', width: 90, assignedEmployeeIds: ['e1'] })
    const quiet: Accommodation = {
      id: 'a1',
      type: 'quiet-zone',
      notes: null,
      createdAt: new Date().toISOString(),
    }
    const employees = [
      makeEmployee({ id: 'e1', seatId: 'po-small', accommodations: [quiet] }),
    ]
    const result = analyzeAccommodations({ elements: [office], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('stays silent when the employee has no seat', () => {
    const employees = [
      makeEmployee({ id: 'e1', seatId: null, accommodations: [wheelchair()] }),
    ]
    const result = analyzeAccommodations({ elements: [], employees, zones: new Map() })
    expect(result).toEqual([])
  })
})
