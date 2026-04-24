import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { loadOffice, saveOffice, saveOfficeForce, fromMock } = vi.hoisted(() => ({
  loadOffice: vi.fn(),
  saveOffice: vi.fn(),
  saveOfficeForce: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../lib/offices/officeRepository', () => ({
  loadOffice: (...a: unknown[]) => loadOffice(...a),
  saveOffice: (...a: unknown[]) => saveOffice(...a),
  saveOfficeForce: (...a: unknown[]) => saveOfficeForce(...a),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

// Stub out editor-internal pieces that pull Konva and keyboard shortcuts —
// the loader test only cares about the routing + 404 path.
vi.mock('../components/editor/TopBar', () => ({ TopBar: () => null }))
vi.mock('../components/editor/ContextMenu', () => ({ ContextMenu: () => null }))
vi.mock('../components/editor/KeyboardShortcutsOverlay', () => ({ KeyboardShortcutsOverlay: () => null }))
vi.mock('../components/editor/RightSidebar/CSVImportDialog', () => ({ CSVImportDialog: () => null }))
vi.mock('../components/editor/ExportDialog', () => ({ ExportDialog: () => null }))
vi.mock('../components/dashboard/NewProjectModal', () => ({ NewProjectModal: () => null }))
vi.mock('../components/editor/ShareModal', () => ({ ShareModal: () => null }))
vi.mock('../components/reports/EmployeeDirectory', () => ({ EmployeeDirectory: () => null }))
vi.mock('../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('../lib/offices/useOfficeSync', () => ({ useOfficeSync: () => ({ overwrite: () => {} }) }))

import { ProjectShell } from '../components/editor/ProjectShell'

describe('ProjectShell loader', () => {
  beforeEach(() => {
    loadOffice.mockReset()
    fromMock.mockReset()
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }),
        }),
      }),
    }))
  })

  it('shows 404 when the office is not accessible', async () => {
    loadOffice.mockResolvedValue(null)
    render(
      <MemoryRouter initialEntries={['/t/acme/o/missing/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<ProjectShell />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/office not found/i)).toBeInTheDocument())
  })

  it('shows 404 when the team slug is not accessible', async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }))
    render(
      <MemoryRouter initialEntries={['/t/does-not-exist/o/whatever/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<ProjectShell />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/office not found/i)).toBeInTheDocument())
    expect(loadOffice).not.toHaveBeenCalled()
  })

  it('renders a skip-to-main link that targets a main landmark', async () => {
    // Resolve the loader so the shell reaches the "ready" branch and
    // renders the skip link + <main> wrapper (both live past the loading
    // guard). Any non-empty payload works; the skip-link assertion does
    // not depend on the store contents.
    loadOffice.mockResolvedValue({
      id: 'o1',
      team_id: 't1',
      name: 'HQ',
      slug: 'hq',
      is_private: false,
      updated_at: '2026-04-20T00:00:00Z',
      payload: {},
    })
    // Once the shell is "ready" it fires a fire-and-forget
    // currentUserOfficeRole(...) chain; give the mock a two-level .eq()
    // shape so that Promise resolves cleanly and doesn't surface as a
    // vitest unhandled rejection.
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          single: () => Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }),
        }),
      }),
    }))
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<ProjectShell />}>
            <Route path="map" element={<div>outlet-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const skipLink = await screen.findByRole('link', { name: /skip to main content/i })
    expect(skipLink).toHaveAttribute('href', '#main-content')
    // The <main> landmark exists, is focusable via tabIndex=-1, and
    // carries the matching id so the anchor jumps onto it.
    const main = await screen.findByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
  })
})
