import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountPage } from '../components/team/AccountPage'

/**
 * Wave 18C: AccountPage polish render coverage. The brief explicitly
 * scoped these tests to "minimal render tests" — happy-path that the
 * structural sections render, plus the two highest-value behaviors
 * (sign out fires the supabase auth call, danger-zone delete shows
 * the type-to-confirm dialog).
 *
 * Data fetching wasn't restructured, so the supabase `from()` chain
 * is mocked to a thenable that resolves to a no-name profile + no
 * pending deletion request. That mirrors the brand-new account state.
 */

const { signOutMock, fromMock, rpcMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: signOutMock,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
    from: (...a: unknown[]) => fromMock(...a),
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}))

vi.mock('../lib/auth/session', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: { id: 'u1', email: 'alex@example.com' },
  }),
}))

// Build a minimal supabase-from chain that satisfies both the profile
// fetch (`from('profiles').select(...).eq(...).single()`) and the
// deletion-status fetch (`from('account_deletion_requests').select(...).maybeSingle()`).
function buildFromChain(table: string) {
  const profileResolved = Promise.resolve({ data: { name: '' } })
  const deletionResolved = Promise.resolve({ data: null })

  const chain = {
    select: () => chain,
    eq: () => chain,
    upsert: () => Promise.resolve({ error: null }),
    single: () => profileResolved,
    maybeSingle: () =>
      table === 'account_deletion_requests' ? deletionResolved : profileResolved,
  }
  return chain
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  )
}

describe('AccountPage (Wave 18C polish)', () => {
  beforeEach(() => {
    signOutMock.mockClear()
    fromMock.mockReset()
    rpcMock.mockReset()
    fromMock.mockImplementation((table: string) => buildFromChain(table))
  })

  it('renders without crashing and shows the gradient shell + identity header', async () => {
    renderPage()
    // Heading collapses to the email when no display name has been
    // set (brand-new account). The heading is `text-3xl` and lives
    // inside the polished identity header.
    expect(
      screen.getByRole('heading', { level: 1, name: /alex@example\.com/ }),
    ).toBeTruthy()
  })

  it('renders Profile, Security, Data & privacy, and Danger zone sections', () => {
    renderPage()
    expect(screen.getByText(/^profile$/i)).toBeTruthy()
    expect(screen.getByText(/^security$/i)).toBeTruthy()
    expect(screen.getByText(/data & privacy/i)).toBeTruthy()
    expect(screen.getByText(/danger zone/i)).toBeTruthy()
  })

  it('exposes the email via a read-only Input in the Profile section', () => {
    renderPage()
    const emailInput = screen.getByLabelText(/^email$/i) as HTMLInputElement
    expect(emailInput.value).toBe('alex@example.com')
    expect(emailInput.readOnly).toBe(true)
  })

  it('shows display-name field with placeholder', () => {
    renderPage()
    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement
    expect(nameInput).toBeTruthy()
    expect(nameInput.placeholder).toMatch(/teammates/i)
  })

  it('clicking Sign out triggers supabase.auth.signOut', async () => {
    renderPage()
    const signOutBtn = screen.getByRole('button', { name: /^sign out$/i })
    fireEvent.click(signOutBtn)
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))
  })

  it('opens the type-to-confirm dialog when the user clicks Delete account', async () => {
    renderPage()
    const deleteTrigger = screen.getByRole('button', { name: /delete account/i })
    fireEvent.click(deleteTrigger)
    // Dialog title is the role-dialog with the AlertTriangle icon.
    const dialog = await screen.findByRole('dialog', { name: /delete your account/i })
    expect(dialog).toBeTruthy()
    // The "Schedule deletion" button is disabled until the user types
    // the confirmation phrase.
    const scheduleBtn = screen.getByRole('button', { name: /schedule deletion/i })
    expect((scheduleBtn as HTMLButtonElement).disabled).toBe(true)
    // After typing, it enables.
    const confirmInput = screen.getByLabelText(/type delete my account/i)
    fireEvent.change(confirmInput, { target: { value: 'delete my account' } })
    expect((scheduleBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens the change-email info dialog from the Profile card', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /change email/i }))
    const dialog = await screen.findByRole('dialog', { name: /change your email/i })
    expect(dialog).toBeTruthy()
  })
})
