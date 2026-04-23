import { describe, it, expect, beforeEach } from 'vitest'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { deleteEmployee } from '../lib/seatAssignment'

/**
 * `deleteEmployee` historically cleaned seat + table-guest references but
 * left `managerId` pointers intact on other employees. The drawer's
 * Manager dropdown would then surface a phantom value, and exports would
 * carry a dead id that a re-import couldn't resolve.
 *
 * These tests cover the cascade: when A manages B (and C), deleting A
 * should null B and C's `managerId` but leave unrelated employees alone.
 */
beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  useEmployeeStore.setState({
    employees: {
      mgr: {
        id: 'mgr', name: 'Manager Mia', email: '', department: null, team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
      rep1: {
        id: 'rep1', name: 'Report One', email: '', department: null, team: null,
        title: null, managerId: 'mgr', employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
      rep2: {
        id: 'rep2', name: 'Report Two', email: '', department: null, team: null,
        title: null, managerId: 'mgr', employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
      bystander: {
        id: 'bystander', name: 'Bystander Bob', email: '', department: null, team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('deleteEmployee — manager cleanup', () => {
  it('nulls managerId on every direct report when the manager is deleted', () => {
    deleteEmployee('mgr')
    const { employees } = useEmployeeStore.getState()
    // Manager is gone
    expect(employees.mgr).toBeUndefined()
    // Reports retain every other field but managerId is now null
    expect(employees.rep1.managerId).toBeNull()
    expect(employees.rep2.managerId).toBeNull()
    // Bystander wasn't touched
    expect(employees.bystander.managerId).toBeNull()
  })

  it('does not touch employees whose managerId was already null', () => {
    // Bystander had managerId: null going in — making sure the cleanup
    // loop doesn't accidentally overwrite or remove unrelated records.
    deleteEmployee('mgr')
    const bystander = useEmployeeStore.getState().employees.bystander
    expect(bystander).toBeTruthy()
    expect(bystander.name).toBe('Bystander Bob')
    expect(bystander.managerId).toBeNull()
  })

  it('handles deletion of a report without affecting the manager', () => {
    // Deleting a report should leave the manager's record (and other
    // reports) completely untouched — no accidental cascade upward.
    deleteEmployee('rep1')
    const { employees } = useEmployeeStore.getState()
    expect(employees.rep1).toBeUndefined()
    expect(employees.mgr).toBeTruthy()
    expect(employees.mgr.name).toBe('Manager Mia')
    expect(employees.rep2.managerId).toBe('mgr')
  })
})
