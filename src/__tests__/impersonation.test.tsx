/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, renderHook, act, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useCan } from '../hooks/useCan'
import { useProjectStore } from '../stores/projectStore'
import { ViewAsMenu } from '../components/editor/ViewAsMenu'

/**
 * Owner-only "view as role" impersonation is a client-side UI gating
 * mechanism. It layers a pretend role on top of `currentOfficeRole` so
 * the owner can experience the UI as a lower-privileged role. The server
 * still sees the owner token; nothing in the Supabase call path reads
 * `impersonatedRole`. These tests pin that contract.
 */
beforeEach(() => {
  useProjectStore.setState({
    currentOfficeRole: null,
    impersonatedRole: null,
  } as any)
})

describe('useCan with impersonation', () => {
  it('owner without impersonation retains full permissions', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: null } as any)
    const { result } = renderHook(() => useCan('editMap'))
    expect(result.current).toBe(true)
  })

  it('owner impersonating viewer loses editMap permission', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    const { result } = renderHook(() => useCan('editMap'))
    expect(result.current).toBe(false)
  })

  it('owner impersonating hr-editor loses editMap but keeps editRoster', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'hr-editor' } as any)
    const { result: editMap } = renderHook(() => useCan('editMap'))
    const { result: editRoster } = renderHook(() => useCan('editRoster'))
    expect(editMap.current).toBe(false)
    expect(editRoster.current).toBe(true)
  })

  it('owner impersonating space-planner loses viewPII (sees redacted roster)', () => {
    // This is the "feature, not bug" interaction with PR #48: impersonating
    // a role without viewPII means the owner sees the redacted employee
    // projection — which is exactly what a support rep needs to reproduce
    // a "why can't this viewer see X" report.
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'space-planner' } as any)
    const { result } = renderHook(() => useCan('viewPII'))
    expect(result.current).toBe(false)
  })

  it('exiting impersonation restores full owner permissions', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    const { result, rerender } = renderHook(() => useCan('editMap'))
    expect(result.current).toBe(false)
    act(() => {
      useProjectStore.getState().setImpersonatedRole(null)
    })
    rerender()
    expect(result.current).toBe(true)
  })
})

describe('setImpersonatedRole owner guard', () => {
  it('refuses to set an impersonated role when current role is not owner', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
    act(() => {
      useProjectStore.getState().setImpersonatedRole('viewer')
    })
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })

  it('refuses to set an impersonated role when role is unknown', () => {
    useProjectStore.setState({ currentOfficeRole: null, impersonatedRole: null } as any)
    act(() => {
      useProjectStore.getState().setImpersonatedRole('viewer')
    })
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })

  it('allows an owner to set, change, and clear impersonation', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: null } as any)
    act(() => {
      useProjectStore.getState().setImpersonatedRole('viewer')
    })
    expect(useProjectStore.getState().impersonatedRole).toBe('viewer')
    act(() => {
      useProjectStore.getState().setImpersonatedRole('hr-editor')
    })
    expect(useProjectStore.getState().impersonatedRole).toBe('hr-editor')
    act(() => {
      useProjectStore.getState().setImpersonatedRole(null)
    })
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })

  it('clears impersonation if role drops below owner (defense in depth)', () => {
    // Owners who lose their owner seat mid-session shouldn't retain a
    // stale "view as viewer" that would now be an actual permission
    // downgrade instead of a preview. `setCurrentOfficeRole` resets
    // impersonation whenever the base role changes.
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    act(() => {
      useProjectStore.getState().setCurrentOfficeRole('editor')
    })
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })
})

describe('ViewAsMenu visibility', () => {
  function mount() {
    return render(
      <MemoryRouter>
        <ViewAsMenu />
      </MemoryRouter>,
    )
  }

  it('owner sees the "View as…" trigger', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: null } as any)
    mount()
    expect(screen.getByRole('button', { name: /view as/i })).toBeInTheDocument()
  })

  it('editor does not see the trigger (owner-only)', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
    const { container } = mount()
    expect(container.firstChild).toBeNull()
  })

  it('viewer does not see the trigger (owner-only)', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer', impersonatedRole: null } as any)
    const { container } = mount()
    expect(container.firstChild).toBeNull()
  })
})
