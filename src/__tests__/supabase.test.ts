import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws a helpful error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    await expect(import('../lib/supabase')).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('returns a singleton when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const { supabase: a } = await import('../lib/supabase')
    const { supabase: b } = await import('../lib/supabase')
    expect(a).toBe(b)
  })
})
