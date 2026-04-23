import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanEdit } from '../hooks/useCanEdit'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: null })
})

describe('useCanEdit', () => {
  it('returns false when role is unknown (tightened default after narrower-action migration)', () => {
    // As of Phase 5b the legacy hook composes `useCan('editMap') || useCan('editRoster')`,
    // both of which close on a null role. Callers that relied on the old permissive
    // default must seed `currentOfficeRole` explicitly.
    useProjectStore.setState({ currentOfficeRole: null })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(false)
  })

  it('returns true for hr-editor (roster-only edit still satisfies the legacy shim)', () => {
    useProjectStore.setState({ currentOfficeRole: 'hr-editor' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns true for space-planner (map-only edit still satisfies the legacy shim)', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' })
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
