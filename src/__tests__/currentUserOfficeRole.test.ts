import { describe, it, expect, vi, beforeEach } from 'vitest'
import { currentUserOfficeRole } from '../lib/offices/currentUserOfficeRole'

// Minimal mock of the Supabase chain we use. `mockResult` is reset between
// tests so each case can drive a different branch (explicit role / missing
// override / query error).
const { mockResult } = vi.hoisted(() => ({
  mockResult: { data: null as unknown, error: null as unknown },
}))

vi.mock('../lib/supabase', () => {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(mockResult)),
  }
  return { supabase: chain }
})

beforeEach(() => {
  mockResult.data = null
  mockResult.error = null
})

describe('currentUserOfficeRole', () => {
  it('returns the explicit office_permissions role when one exists', async () => {
    mockResult.data = { role: 'viewer' }
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBe('viewer')
  })

  it('falls back to "editor" when no explicit override exists', async () => {
    mockResult.data = null
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBe('editor')
  })

  it('returns null on Supabase error (caller treats as unknown → permissive)', async () => {
    mockResult.error = new Error('boom')
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBeNull()
  })
})
