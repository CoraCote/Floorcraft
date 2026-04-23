import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SharedProjectView } from '../components/shared/SharedProjectView'
import * as shareTokens from '../lib/shareTokens'
import * as loadOffice from '../lib/offices/loadOfficeById'

vi.mock('../lib/shareTokens', () => ({
  resolveShareToken: vi.fn(),
}))
vi.mock('../lib/offices/loadOfficeById', () => ({
  loadOfficeById: vi.fn(),
}))

function mount() {
  return render(
    <MemoryRouter initialEntries={['/shared/office-1/token-abc']}>
      <Routes>
        <Route path="/shared/:projectId/:token" element={<SharedProjectView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(shareTokens.resolveShareToken).mockReset()
  vi.mocked(loadOffice.loadOfficeById).mockReset()
})

describe('SharedProjectView', () => {
  it('renders invalid message for a revoked token', async () => {
    vi.mocked(shareTokens.resolveShareToken).mockResolvedValue(null)
    mount()
    await waitFor(() =>
      expect(screen.getByText(/share link isn't valid/i)).toBeInTheDocument(),
    )
  })

  it('renders read-only shell for a live token', async () => {
    vi.mocked(shareTokens.resolveShareToken).mockResolvedValue({ officeId: 'office-1' })
    vi.mocked(loadOffice.loadOfficeById).mockResolvedValue({
      id: 'office-1',
      payload: {
        employees: {
          e1: { id: 'e1', name: 'Ada Lovelace', department: 'Eng', title: 'Engineer', seatId: 's1' },
        },
        floors: [{ id: 'f1' }],
      },
    } as never)
    mount()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /shared read-only view/i }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/1 floor · 1 people/)).toBeInTheDocument()
  })

  it('invalidates when token resolves to a different office id', async () => {
    vi.mocked(shareTokens.resolveShareToken).mockResolvedValue({ officeId: 'other' })
    mount()
    await waitFor(() =>
      expect(screen.getByText(/share link isn't valid/i)).toBeInTheDocument(),
    )
  })
})
