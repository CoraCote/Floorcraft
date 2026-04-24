/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useProjectStore } from '../stores/projectStore'
import { useUIStore } from '../stores/uiStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: null, impersonatedRole: null } as any)
  // Ensure modalOpenCount is 0 so the Escape path can run.
  useUIStore.setState({ modalOpenCount: 0 } as any)
})

function mount() {
  return renderHook(() => useKeyboardShortcuts(), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  })
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
}

describe('Escape clears impersonation before other cleanups', () => {
  it('exits impersonation when an owner presses Escape', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    mount()
    pressEscape()
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })

  it('does not touch impersonation when a modal is open (modal gets Escape)', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    useUIStore.setState({ modalOpenCount: 1 } as any)
    mount()
    pressEscape()
    // Modal guard short-circuits the entire Escape branch, so impersonation
    // stays put. The banner's own exit button and the menu "None" option
    // remain the ways out while a modal is foregrounded.
    expect(useProjectStore.getState().impersonatedRole).toBe('viewer')
  })
})
