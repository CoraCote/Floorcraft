import { describe, it, expect } from 'vitest'
import { humanizeAuthError } from '../lib/auth/humanizeAuthError'

describe('humanizeAuthError', () => {
  it('rewrites "Failed to fetch" to a connection-hint message', () => {
    const err = new TypeError('Failed to fetch')
    expect(humanizeAuthError(err)).toBe(
      "Can't reach the server. Check your connection and try again.",
    )
  })

  it('matches "Failed to fetch" case-insensitively', () => {
    expect(humanizeAuthError({ message: 'FAILED to FETCH' })).toMatch(
      /Can't reach the server/,
    )
  })

  it('rewrites Firefox-style NetworkError', () => {
    const err = new Error('NetworkError when attempting to fetch resource.')
    expect(humanizeAuthError(err)).toMatch(/Can't reach the server/)
  })

  it('rewrites Safari-style "Load failed"', () => {
    expect(humanizeAuthError(new Error('Load failed'))).toMatch(
      /Can't reach the server/,
    )
  })

  it('passes through known-good Supabase server messages', () => {
    // Server responses are already user-facing and should reach the user
    // verbatim so bug reports reflect the real reason.
    expect(humanizeAuthError({ message: 'Invalid login credentials' })).toBe(
      'Invalid login credentials',
    )
    expect(
      humanizeAuthError({ message: 'User already registered' }),
    ).toBe('User already registered')
  })

  it('handles a plain string error', () => {
    expect(humanizeAuthError('Invalid login credentials')).toBe(
      'Invalid login credentials',
    )
  })

  it('falls back to a generic message for empty/unknown errors', () => {
    expect(humanizeAuthError(null)).toBe('Something went wrong. Please try again.')
    expect(humanizeAuthError(undefined)).toBe(
      'Something went wrong. Please try again.',
    )
    expect(humanizeAuthError({ message: '' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(humanizeAuthError({ message: '   ' })).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
