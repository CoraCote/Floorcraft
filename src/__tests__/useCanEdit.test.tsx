import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanEdit } from '../hooks/useCanEdit'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: null })
})

describe('useCanEdit', () => {
  it('returns true when role is unknown (fail-open permissive default)', () => {
    useProjectStore.setState({ currentOfficeRole: null })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns true for editor role', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns true for owner role', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns false for viewer role', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(false)
  })
})
