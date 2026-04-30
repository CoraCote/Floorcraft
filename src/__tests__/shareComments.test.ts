import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addShareComment,
  addOfficeComment,
  listShareComments,
} from '../lib/shareComments'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

describe('addShareComment', () => {
  beforeEach(() => rpcMock.mockReset())

  it('rejects an empty body without calling the server', async () => {
    const out = await addShareComment({
      token: 't',
      officeId: 'o',
      body: '   ',
      authorName: 'A',
    })
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.reason).toBe('empty')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a body over 4000 chars without calling the server', async () => {
    const out = await addShareComment({
      token: 't',
      officeId: 'o',
      body: 'x'.repeat(4001),
      authorName: 'A',
    })
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.reason).toBe('too_long')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns the inserted row on success', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'c1',
        office_id: 'o',
        body: 'Looks great',
        author_name: 'Reviewer',
        created_at: '2026-04-30T12:00:00Z',
      },
      error: null,
    })
    const out = await addShareComment({
      token: 't',
      officeId: 'o',
      body: 'Looks great',
      authorName: 'Reviewer',
    })
    expect(out.kind).toBe('ok')
    if (out.kind === 'ok') expect(out.comment.id).toBe('c1')
  })

  it('maps invalid_or_revoked_token RPC error to a typed reason', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid_or_revoked_token' },
    })
    const out = await addShareComment({
      token: 't',
      officeId: 'o',
      body: 'hi',
      authorName: '',
    })
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.reason).toBe('invalid_token')
  })
})

describe('listShareComments', () => {
  beforeEach(() => rpcMock.mockReset())

  it('returns the array of rows on success', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'c1',
          office_id: 'o',
          body: 'A',
          author_name: 'X',
          created_at: '2026-04-30T12:00:00Z',
        },
      ],
      error: null,
    })
    const out = await listShareComments({ token: 't', officeId: 'o' })
    expect(out).toHaveLength(1)
  })

  it('returns null on RPC failure (caller distinguishes from empty)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await listShareComments({ token: 't', officeId: 'o' })
    expect(out).toBeNull()
  })

  it('returns [] on no rows (distinct from null)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const out = await listShareComments({ token: 't', officeId: 'o' })
    expect(out).toEqual([])
  })
})

describe('addOfficeComment', () => {
  beforeEach(() => rpcMock.mockReset())

  it('rejects empty / over-cap bodies without calling the server', async () => {
    const empty = await addOfficeComment({ officeId: 'o', body: '   ', authorName: 'X' })
    expect(empty.kind).toBe('error')
    if (empty.kind === 'error') expect(empty.reason).toBe('empty')

    const tooLong = await addOfficeComment({
      officeId: 'o',
      body: 'x'.repeat(4001),
      authorName: 'X',
    })
    expect(tooLong.kind).toBe('error')
    if (tooLong.kind === 'error') expect(tooLong.reason).toBe('too_long')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns the inserted row with share_token=null on success', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'c1',
        office_id: 'o',
        body: 'On it',
        author_name: 'Owner',
        created_at: '2026-04-30T13:00:00Z',
        share_token: null,
      },
      error: null,
    })
    const out = await addOfficeComment({
      officeId: 'o',
      body: 'On it',
      authorName: 'Owner',
    })
    expect(out.kind).toBe('ok')
    if (out.kind === 'ok') {
      expect(out.comment.id).toBe('c1')
      expect(out.comment.share_token).toBeNull()
    }
  })

  it('maps forbidden RPC error to a typed reason', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const out = await addOfficeComment({ officeId: 'o', body: 'hi', authorName: '' })
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.reason).toBe('forbidden')
  })

  it('maps not_authenticated RPC error to a typed reason', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'not_authenticated' },
    })
    const out = await addOfficeComment({ officeId: 'o', body: 'hi', authorName: '' })
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.reason).toBe('not_authenticated')
  })
})
