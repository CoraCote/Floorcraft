import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isSampleOffice, SAMPLE_OFFICE_NAME, seedSampleOffice } from '../lib/demo/sampleOffice'

const { createOffice, saveOffice } = vi.hoisted(() => ({
  createOffice: vi.fn(),
  saveOffice: vi.fn(),
}))
vi.mock('../lib/offices/officeRepository', () => ({
  createOffice: (...a: unknown[]) => createOffice(...a),
  saveOffice: (...a: unknown[]) => saveOffice(...a),
}))

describe('isSampleOffice', () => {
  it('matches the seeded name verbatim', () => {
    expect(isSampleOffice(SAMPLE_OFFICE_NAME)).toBe(true)
  })

  it('returns false for null, undefined, or any other name', () => {
    expect(isSampleOffice(null)).toBe(false)
    expect(isSampleOffice(undefined)).toBe(false)
    expect(isSampleOffice('My office')).toBe(false)
    expect(isSampleOffice('sample office — try editing me')).toBe(false) // case-sensitive
  })
})

describe('seedSampleOffice', () => {
  beforeEach(() => {
    createOffice.mockReset()
    saveOffice.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('creates an office with the canonical sample name and seeds the demo payload', async () => {
    createOffice.mockResolvedValue({
      id: 'o1',
      slug: 'sample',
      name: SAMPLE_OFFICE_NAME,
      updated_at: '2026-04-30T00:00:00Z',
      is_private: false,
    })
    saveOffice.mockResolvedValue({ ok: true, updated_at: '2026-04-30T00:00:01Z' })

    await seedSampleOffice('team-1')

    expect(createOffice).toHaveBeenCalledWith('team-1', SAMPLE_OFFICE_NAME)
    expect(saveOffice).toHaveBeenCalledTimes(1)
    const [officeId, payload, version] = saveOffice.mock.calls[0]
    expect(officeId).toBe('o1')
    expect(version).toBe('2026-04-30T00:00:00Z')
    expect((payload as { version: number }).version).toBe(2)
  })

  it('swallows createOffice failures so navigation can proceed', async () => {
    createOffice.mockRejectedValue(new Error('network down'))
    await expect(seedSampleOffice('team-1')).resolves.toBeUndefined()
    expect(saveOffice).not.toHaveBeenCalled()
  })

  it('swallows saveOffice conflict/error responses without throwing', async () => {
    createOffice.mockResolvedValue({
      id: 'o1',
      slug: 'sample',
      name: SAMPLE_OFFICE_NAME,
      updated_at: '2026-04-30T00:00:00Z',
      is_private: false,
    })
    saveOffice.mockResolvedValue({ ok: false, reason: 'conflict' })
    await expect(seedSampleOffice('team-1')).resolves.toBeUndefined()
  })
})
