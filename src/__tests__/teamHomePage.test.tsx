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

// Supabase shim. `from('teams')` returns a simple single-row selector;
// `from('team_members')` supports the two shapes used by TeamHomePage:
//   (a) .select('role').eq().eq().maybeSingle()  — role lookup
//   (b) .select('user_id', { count, head: true }).eq()  — member-count
// Kept small on purpose — the test is about the page, not the repo.
const { fromMock } = vi.hoisted(() => {
  const impl = (table: string) => {
    if (table === 'teams') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }),
          }),
        }),
      }
    }
    if (table === 'team_members') {
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            return {
              eq: () => Promise.resolve({ count: 3, data: null, error: null }),
            }
          }
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { role: 'admin' }, error: null }),
              }),
            }),
          }
        },
      }
    }
    if (table === 'offices') {
      // Archived-count head query for the "Show archived (N)" chip.
      return {
        select: () => ({
          eq: () => ({
            not: () => Promise.resolve({ count: 0, data: null, error: null }),
          }),
        }),
      }
    }
    if (table === 'audit_events') {
      // TeamActivityFeed reads team-scoped events with a profiles
      // FK embed. Empty list is the right default — TeamActivityFeed
      // hides itself when there's no activity.
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }
    }
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }
  }
  return { fromMock: vi.fn<typeof impl>(impl) }
})
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
    createOffice.mockResolvedValue({ id: 'o2', slug: 'hq-2', name: 'New office 1' })
    render(
      <MemoryRouter initialEntries={['/t/acme']}>
        <Routes>
          <Route path="/t/:teamSlug" element={<TeamHomePage />} />
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<div>map-view</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('HQ')
    // Wave 21 (#180): the legacy `window.prompt()` flow was replaced
    // with `CreateOfficeModal`. Clicking "+ New office" now opens the
    // modal; submitting the modal form is what fires `createOffice`.
    fireEvent.click(screen.getByRole('button', { name: /^new office$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^create office$/i }))
    await waitFor(() => expect(createOffice).toHaveBeenCalled())
    expect(await screen.findByText('map-view')).toBeInTheDocument()
  })
})
