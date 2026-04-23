import { describe, it, expect } from 'vitest'
import { importEmployees } from '../lib/employeeCsv'
import type { ValidImportRow } from '../lib/employeeCsv'

function validRow(over: Partial<ValidImportRow> = {}): ValidImportRow {
  return {
    name: over.name ?? 'Alice',
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerName: over.managerName ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
  }
}

describe('importEmployees', () => {
  it('adds every valid row and returns their new ids', () => {
    const calls: Array<Parameters<Parameters<typeof importEmployees>[0]['addEmployee']>[0]> = []
    const addEmployee = (data: typeof calls[number]) => {
      calls.push(data)
      return `new-${calls.length}`
    }
    const updateEmployee = () => {}

    const result = importEmployees({
      valid: [validRow({ name: 'Alice' }), validRow({ name: 'Bob' })],
      existing: {},
      addEmployee,
      updateEmployee,
    })

    expect(result.imported).toHaveLength(2)
    expect(result.imported[0]).toEqual({
      id: 'new-1',
      name: 'Alice',
      email: '',
    })
    expect(calls[0].name).toBe('Alice')
    expect(calls[0].managerId).toBeNull()
  })

  it('resolves manager names against same-import peers on a second pass', () => {
    const idByName: Record<string, string> = {}
    let i = 0
    const addEmployee = (data: { name: string }) => {
      const id = `e-${++i}`
      idByName[data.name] = id
      return id
    }
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [
        validRow({ name: 'Carol' }),
        validRow({ name: 'Bob', managerName: 'Carol' }),
      ],
      existing: {},
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([{ id: idByName['Bob'], managerId: idByName['Carol'] }])
  })

  it('leaves managerId null when manager name does not resolve', () => {
    const addEmployee = () => 'e-1'
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [validRow({ name: 'Bob', managerName: 'Ghost' })],
      existing: {},
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([])
  })

  it('resolves manager name against pre-existing employee', () => {
    const addEmployee = () => 'e-new'
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [validRow({ name: 'Bob', managerName: 'Carol' })],
      existing: { 'e-carol': { id: 'e-carol', name: 'Carol', email: null } },
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([{ id: 'e-new', managerId: 'e-carol' }])
  })
})
