/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVisibleEmployees } from '../hooks/useVisibleEmployees'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    department: 'Engineering',
    team: null,
    title: null,
    managerId: 'm1',
    employmentType: 'full-time',
    status: 'active',
    officeDays: ['Mon'],
    startDate: '2024-01-01',
    endDate: null,
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: 'https://img.example',
    tags: ['vip'],
    seatId: null,
    floorId: null,
    createdAt: new Date().toISOString(),
    accommodations: [],
    pendingStatusChanges: [],
    ...overrides,
  }
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Jane Doe' }),
      e2: emp({ id: 'e2', name: 'Bob Smith', email: 'bob@x.com' }),
    },
  } as any)
})

describe('useVisibleEmployees', () => {
  it('returns the raw employees map when the role has viewPII', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    const { result } = renderHook(() => useVisibleEmployees())
    // Editor sees full PII: name and email are intact.
    expect(result.current.e1.name).toBe('Jane Doe')
    expect(result.current.e1.email).toBe('jane@example.com')
    expect(result.current.e1.managerId).toBe('m1')
    expect(result.current.e1.photoUrl).toBe('https://img.example')
    // Identity-stable: returns the same object as the store for referential memo safety.
    expect(result.current).toBe(useEmployeeStore.getState().employees)
  })

  it('returns a redacted map for the viewer role', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    const { result } = renderHook(() => useVisibleEmployees())
    expect(result.current.e1.name).toBe('J.D.')
    expect(result.current.e1.email).toBe('')
    expect(result.current.e1.managerId).toBeNull()
    expect(result.current.e1.photoUrl).toBeNull()
    expect(result.current.e1.tags).toEqual([])
    expect(result.current.e1.officeDays).toEqual([])
    // Keys are preserved for downstream lookups.
    expect(Object.keys(result.current).sort()).toEqual(['e1', 'e2'])
  })

  it('returns a redacted map for the space-planner role (lacks viewPII)', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as any)
    const { result } = renderHook(() => useVisibleEmployees())
    expect(result.current.e1.name).toBe('J.D.')
    expect(result.current.e1.email).toBe('')
  })

  it('returns a redacted map when the role is null (pre-load fail-closed)', () => {
    useProjectStore.setState({ currentOfficeRole: null } as any)
    const { result } = renderHook(() => useVisibleEmployees())
    expect(result.current.e1.name).toBe('J.D.')
  })

  it('preserves non-PII structural fields in the redacted projection', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    const { result } = renderHook(() => useVisibleEmployees())
    expect(result.current.e1.department).toBe('Engineering')
    expect(result.current.e1.status).toBe('active')
    expect(result.current.e1.employmentType).toBe('full-time')
  })
})
