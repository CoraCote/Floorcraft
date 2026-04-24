/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImpersonationBanner } from '../components/editor/ImpersonationBanner'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({
    currentOfficeRole: null,
    impersonatedRole: null,
  } as any)
})

describe('ImpersonationBanner', () => {
  it('renders nothing when no impersonation is active', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: null } as any)
    const { container } = render(<ImpersonationBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders with the active role when impersonating', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'viewer' } as any)
    render(<ImpersonationBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/viewing as viewer/i)
  })

  it('clicking the exit affordance clears impersonation', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner', impersonatedRole: 'hr-editor' } as any)
    render(<ImpersonationBanner />)
    fireEvent.click(screen.getByRole('button', { name: /exit/i }))
    expect(useProjectStore.getState().impersonatedRole).toBeNull()
  })

  it('does not render for a non-owner even if impersonatedRole is somehow set', () => {
    // Defense in depth: the store guard should already prevent this, but
    // the banner also short-circuits on base role so a stale state can't
    // keep the banner pinned to the screen.
    useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: 'viewer' } as any)
    const { container } = render(<ImpersonationBanner />)
    expect(container.firstChild).toBeNull()
  })
})
