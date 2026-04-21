import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamHomePage } from '../components/team/TeamHomePage'

const { listOffices, createOffice } = vi.hoisted(() => ({
  listOffices: vi.fn(),
  createOffice: vi.fn(),
}))
vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: (...a: unknown[]) => listOffices(...a),
  createOffice: (...a: unknown[]) => createOffice(...a),
}))
const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn((_table?: string) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }),
      }),
    }),
  })),
}))
vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

describe('TeamHomePage', () => {
  it('lists offices and creates a new one', async () => {
    listOffices.mockResolvedValue([
      { id: 'o1', slug: 'hq', name: 'HQ', updated_at: '2026-04-20T00:00:00Z', is_private: false },
    ])
    createOffice.mockResolvedValue({ id: 'o2', slug: 'hq-2', name: 'Untitled office' })
    render(
      <MemoryRouter initialEntries={['/t/acme']}>
        <Routes>
          <Route path="/t/:teamSlug" element={<TeamHomePage />} />
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<div>map-view</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('HQ')
    fireEvent.click(screen.getByRole('button', { name: /new office/i }))
    await waitFor(() => expect(createOffice).toHaveBeenCalled())
    expect(await screen.findByText('map-view')).toBeInTheDocument()
  })
})
