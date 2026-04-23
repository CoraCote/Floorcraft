import { describe, it, expect } from 'vitest'
import { applyBulkEdit, type BulkEditPatch } from '../lib/bulkEditEmployees'

describe('applyBulkEdit', () => {
  it('returns a patch with only non-empty fields for each id', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: 'Eng', title: null, status: null, team: null }
    applyBulkEdit(['a', 'b'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({ id: 'a', patch: { department: 'Eng' } })
    expect(calls[1]).toEqual({ id: 'b', patch: { department: 'Eng' } })
  })

  it('merges multiple fields into a single patch per id', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = {
      department: 'Eng',
      title: 'IC5',
      status: 'active',
      team: 'Platform',
    }
    applyBulkEdit(['a'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls[0].patch).toEqual({
      department: 'Eng',
      title: 'IC5',
      status: 'active',
      team: 'Platform',
    })
  })

  it('no-ops when every patch field is null', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: null, title: null, status: null, team: null }
    applyBulkEdit(['a', 'b'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls).toHaveLength(0)
  })

  it('treats empty string as "clear this field" (distinct from null = skip)', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: '', title: null, status: null, team: null }
    applyBulkEdit(['a'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls[0].patch).toEqual({ department: null })
  })
})
