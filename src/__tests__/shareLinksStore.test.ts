import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useShareLinksStore } from '../stores/shareLinksStore'

beforeEach(() => {
  useShareLinksStore.setState({ links: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shareLinksStore', () => {
  it('create stores a link and returns a URL containing the token', () => {
    const { link, url } = useShareLinksStore
      .getState()
      .create('office-1', 3600, 'board review', { id: 'u1', name: 'Alice' })
    expect(link.officeId).toBe('office-1')
    expect(link.label).toBe('board review')
    expect(link.createdBy).toBe('u1')
    expect(link.token).toHaveLength(36) // crypto.randomUUID shape
    expect(url).toContain('/share/office-1')
    expect(url).toContain(`t=${encodeURIComponent(link.token)}`)
    // Store now contains exactly one link, keyed by the returned id.
    const links = Object.values(useShareLinksStore.getState().links)
    expect(links).toHaveLength(1)
    expect(links[0].id).toBe(link.id)
  })

  it('isTokenValid returns true for a fresh token, false after revoke', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600)
    expect(useShareLinksStore.getState().isTokenValid(link.token)).toBe(true)
    useShareLinksStore.getState().revoke(link.id)
    expect(useShareLinksStore.getState().isTokenValid(link.token)).toBe(false)
  })

  it('isTokenValid returns false after the TTL has elapsed', () => {
    const start = new Date('2025-01-01T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(start)
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 60 /* 1 minute */)
    expect(useShareLinksStore.getState().isTokenValid(link.token)).toBe(true)
    vi.setSystemTime(new Date(start.getTime() + 120_000)) // +2min
    expect(useShareLinksStore.getState().isTokenValid(link.token)).toBe(false)
  })

  it('isTokenValid rejects tokens from a different office when officeId is provided', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600)
    expect(useShareLinksStore.getState().isTokenValid(link.token, 'office-1')).toBe(true)
    expect(useShareLinksStore.getState().isTokenValid(link.token, 'office-2')).toBe(false)
  })

  it('isTokenValid returns false for unknown tokens', () => {
    expect(useShareLinksStore.getState().isTokenValid('nope')).toBe(false)
  })

  it('activeForOffice filters by office, revocation, and expiry', () => {
    const start = new Date('2025-01-01T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(start)
    const store = useShareLinksStore.getState()
    const a = store.create('office-1', 3600, 'a')
    store.create('office-2', 3600, 'b') // other office
    const expired = store.create('office-1', 60, 'c')
    const revoked = store.create('office-1', 3600, 'd')
    useShareLinksStore.getState().revoke(revoked.link.id)
    vi.setSystemTime(new Date(start.getTime() + 120_000))
    const active = useShareLinksStore.getState().activeForOffice('office-1')
    expect(active.map((l) => l.id)).toEqual([a.link.id])
    expect(active).not.toContainEqual(expect.objectContaining({ id: expired.link.id }))
  })

  it('revoke is idempotent', () => {
    const { link } = useShareLinksStore
      .getState()
      .create('office-1', 3600)
    useShareLinksStore.getState().revoke(link.id)
    const first = useShareLinksStore.getState().links[link.id].revokedAt
    useShareLinksStore.getState().revoke(link.id)
    const second = useShareLinksStore.getState().links[link.id].revokedAt
    expect(first).toBe(second)
  })
})
