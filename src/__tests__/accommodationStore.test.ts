import { describe, it, expect, beforeEach } from 'vitest'
import { useEmployeeStore } from '../stores/employeeStore'
import type { Accommodation } from '../types/employee'

describe('employeeStore — accommodations', () => {
  beforeEach(() => {
    useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  })

  it('defaults accommodations to [] when creating an employee', () => {
    const id = useEmployeeStore.getState().addEmployee({ name: 'Alice' })
    expect(useEmployeeStore.getState().employees[id].accommodations).toEqual([])
  })

  it('preserves provided accommodations on create', () => {
    const entry: Accommodation = {
      id: 'a1',
      type: 'wheelchair-access',
      notes: null,
      createdAt: new Date().toISOString(),
    }
    const id = useEmployeeStore
      .getState()
      .addEmployee({ name: 'Bob', accommodations: [entry] })
    expect(useEmployeeStore.getState().employees[id].accommodations).toEqual([entry])
  })

  it('updateEmployee appends a new accommodation via array spread', () => {
    const id = useEmployeeStore.getState().addEmployee({ name: 'Carol' })
    const existing = useEmployeeStore.getState().employees[id].accommodations
    const next: Accommodation = {
      id: 'a-new',
      type: 'quiet-zone',
      notes: 'Near east-wing windows',
      createdAt: new Date().toISOString(),
    }
    useEmployeeStore
      .getState()
      .updateEmployee(id, { accommodations: [...existing, next] })
    expect(useEmployeeStore.getState().employees[id].accommodations).toHaveLength(1)
    expect(useEmployeeStore.getState().employees[id].accommodations[0]).toEqual(next)
  })

  it('updateEmployee can remove an accommodation by filtering the list', () => {
    const entry1: Accommodation = {
      id: 'a1',
      type: 'wheelchair-access',
      notes: null,
      createdAt: new Date().toISOString(),
    }
    const entry2: Accommodation = {
      id: 'a2',
      type: 'standing-desk',
      notes: null,
      createdAt: new Date().toISOString(),
    }
    const id = useEmployeeStore
      .getState()
      .addEmployee({ name: 'Dave', accommodations: [entry1, entry2] })
    useEmployeeStore
      .getState()
      .updateEmployee(id, {
        accommodations: useEmployeeStore
          .getState()
          .employees[id].accommodations.filter((a) => a.id !== 'a1'),
      })
    expect(useEmployeeStore.getState().employees[id].accommodations).toEqual([entry2])
  })
})
