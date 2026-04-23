import { describe, it, expect } from 'vitest'
import { can, type Action } from '../lib/permissions'

describe('permissions matrix', () => {
  it('owner can do everything', () => {
    const actions: Action[] = [
      'editRoster', 'editMap', 'manageTeam',
      'viewAuditLog', 'viewReports', 'manageBilling', 'generateShareLink',
    ]
    for (const a of actions) expect(can('owner', a)).toBe(true)
  })

  it('viewer can only view reports', () => {
    expect(can('viewer', 'viewReports')).toBe(true)
    expect(can('viewer', 'editRoster')).toBe(false)
    expect(can('viewer', 'editMap')).toBe(false)
    expect(can('viewer', 'manageTeam')).toBe(false)
    expect(can('viewer', 'viewAuditLog')).toBe(false)
  })

  it('hr-editor can edit roster but not map', () => {
    expect(can('hr-editor', 'editRoster')).toBe(true)
    expect(can('hr-editor', 'editMap')).toBe(false)
    expect(can('hr-editor', 'viewAuditLog')).toBe(true)
    expect(can('hr-editor', 'manageTeam')).toBe(false)
  })

  it('space-planner can edit map but not roster', () => {
    expect(can('space-planner', 'editMap')).toBe(true)
    expect(can('space-planner', 'editRoster')).toBe(false)
    expect(can('space-planner', 'viewAuditLog')).toBe(false)
  })

  it('legacy editor gets both edit permissions', () => {
    expect(can('editor', 'editRoster')).toBe(true)
    expect(can('editor', 'editMap')).toBe(true)
    expect(can('editor', 'manageTeam')).toBe(false)
    expect(can('editor', 'viewAuditLog')).toBe(false)
  })

  it('null role fails open on view, closed on everything else', () => {
    expect(can(null, 'viewReports')).toBe(true)
    expect(can(null, 'editRoster')).toBe(false)
    expect(can(null, 'editMap')).toBe(false)
    expect(can(null, 'manageTeam')).toBe(false)
  })

  it('unknown action returns false', () => {
    // @ts-expect-error intentional
    expect(can('owner', 'somethingElse')).toBe(false)
  })
})
