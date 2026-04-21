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
})
