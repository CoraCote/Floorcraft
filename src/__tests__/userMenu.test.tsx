import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UserMenu } from '../components/team/UserMenu'
import { useUIStore } from '../stores/uiStore'

// Stable reference to the signOut spy so each test can reset it.
const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: signOutMock,
    },
  },
}))

// useSession is the gate: UserMenu renders nothing unless authenticated.
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.co' } }),
}))

function renderMenu() {
  return render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  )
}

describe('UserMenu', () => {
  beforeEach(() => {
    signOutMock.mockClear()
    act(() => {
      useUIStore.getState().setShortcutsOverlayOpen(false)
    })
  })

  it('renders just the initial on the trigger (email is in the panel header, not the trigger)', () => {
    renderMenu()
    const trigger = screen.getByTestId('user-menu-trigger')
    // Trigger shows only the initial; the email lives in the dropdown
    // header row when the menu is open.
    expect(trigger.textContent).toMatch(/A/)
    expect(trigger.textContent).not.toMatch(/a@b\.co/)
    // Accessible name still includes the email so screen readers and
    // hover tooltips can disambiguate which account this is.
    expect(trigger.getAttribute('aria-label')).toMatch(/a@b\.co/)
    expect(trigger.getAttribute('title')).toBe('a@b.co')
  })

  it('opens the dropdown on click and shows grouped items', () => {
    renderMenu()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    expect(screen.getByTestId('user-menu-panel')).toBeTruthy()
    expect(screen.getByTestId('user-menu-profile')).toBeTruthy()
    expect(screen.getByTestId('user-menu-help')).toBeTruthy()
    expect(screen.getByTestId('user-menu-shortcuts')).toBeTruthy()
    expect(screen.getByTestId('user-menu-signout')).toBeTruthy()
  })

  it('clicking Sign out calls supabase.auth.signOut', async () => {
    renderMenu()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    fireEvent.click(screen.getByTestId('user-menu-signout'))
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))
  })

  it('clicking Keyboard shortcuts opens the shortcuts overlay via the UI store', () => {
    renderMenu()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    fireEvent.click(screen.getByTestId('user-menu-shortcuts'))
    expect(useUIStore.getState().shortcutsOverlayOpen).toBe(true)
  })

  it('Escape closes the panel and refocuses the trigger', () => {
    renderMenu()
    const trigger = screen.getByTestId('user-menu-trigger')
    fireEvent.click(trigger)
    const panel = screen.getByTestId('user-menu-panel')
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(screen.queryByTestId('user-menu-panel')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders the Theme toggle row', () => {
    renderMenu()
    fireEvent.click(screen.getByTestId('user-menu-trigger'))
    expect(screen.getByTestId('user-menu-theme-row')).toBeTruthy()
    // ThemeToggle renders a radiogroup — it should be inside the row.
    expect(screen.getByRole('radiogroup', { name: /color theme/i })).toBeTruthy()
  })
})
