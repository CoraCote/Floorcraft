import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamHomePage } from '../components/team/TeamHomePage'
import { addRecent, __clearRecentsForTests } from '../lib/recentOffices'

// Fixture offices. Counts are chosen to make sort / filter assertions
// unambiguous: HQ has more employees than Annex, Remote is empty
// (no employees), and Annex has unassigned employees.
const FIXTURE_OFFICES = [
  {
    id: 'o1',
    slug: 'hq',
    name: 'HQ',
    updated_at: '2026-04-22T00:00:00Z',
    is_private: false,
    payload: {
      floors: [{ elements: { e1: { x: 0, y: 0, width: 1, height: 1, type: 'desk' } } }],
      employees: {
        u1: { id: 'u1', name: 'Alice A' },
        u2: { id: 'u2', name: 'Bob B' },
        u3: { id: 'u3', name: 'Carol C' },
        u4: { id: 'u4', name: 'Dan D' },
        u5: { id: 'u5', name: 'Eve E' },
      },
      seats: { s1: { employeeId: 'u1' } },
    },
  },
  {
    id: 'o2',
    slug: 'annex',
    name: 'Annex',
    updated_at: '2026-04-20T00:00:00Z',
    is_private: false,
    payload: {
      floors: [
        {
          elements: {
            e1: { x: 0, y: 0, width: 1, height: 1, type: 'desk' },
            e2: { x: 2, y: 0, width: 1, height: 1, type: 'desk' },
          },
        },
      ],
      employees: {
        u10: { id: 'u10', name: 'Frank F' },
        u11: { id: 'u11', name: 'Gina G' },
      },
      // One desk, two employees → one is unassigned.
      seats: { s1: { employeeId: 'u10' } },
    },
  },
]

const { listOffices, createOffice } = vi.hoisted(() => ({
  listOffices: vi.fn(),
  createOffice: vi.fn(),
}))
vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: (...a: unknown[]) => listOffices(...a),
  createOffice: (...a: unknown[]) => createOffice(...a),
  deleteOffice: vi.fn(),
  saveOffice: vi.fn(),
}))

vi.mock('../lib/demo/createDemoOffice', () => ({
  buildDemoOfficePayload: () => ({ floors: [] }),
}))

// Same shim as teamHomePage.test.tsx — lets us control the role
// gate and the member-count headline per-test via a shared setter.
const { fromMock, setTeamData, setMemberRole, setMemberCount } = vi.hoisted(() => {
  let team: { id: string; slug: string; name: string } | null = {
    id: 't1',
    slug: 'acme',
    name: 'Acme',
  }
  let role: string | null = 'admin'
  let memberCount = 4
  const impl = (table: string) => {
    if (table === 'teams') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: team, error: null }),
          }),
        }),
      }
    }
    if (table === 'team_members') {
      return {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            return {
              eq: () => Promise.resolve({ count: memberCount, data: null, error: null }),
            }
          }
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: role ? { role } : null, error: null }),
              }),
            }),
          }
        },
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
  return {
    fromMock: vi.fn<typeof impl>(impl),
    setTeamData: (t: typeof team) => {
      team = t
    },
    setMemberRole: (r: string | null) => {
      role = r
    },
    setMemberCount: (n: number) => {
      memberCount = n
    },
  }
})
vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/t/acme']}>
      <Routes>
        <Route path="/t/:teamSlug" element={<TeamHomePage />} />
        <Route path="/t/:teamSlug/o/:officeSlug/map" element={<div>map-view</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setTeamData({ id: 't1', slug: 'acme', name: 'Acme' })
  setMemberRole('admin')
  setMemberCount(4)
  __clearRecentsForTests()
  listOffices.mockReset()
  createOffice.mockReset()
})

describe('TeamHomePage (Wave 14A polish)', () => {
  it('renders the team name as an h1', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    renderPage()
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Acme')
  })

  it('stat strip shows totals aggregated across offices', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    setMemberCount(7)
    renderPage()
    await screen.findByText('HQ')
    const statStrip = screen.getByLabelText('Team summary')
    // 2 offices, 5+2 = 7 employees, 1+2 = 3 seats, 7 members
    expect(within(statStrip).getByText('Offices')).toBeInTheDocument()
    // Two "2"s could collide; use the StatCard structure (label + value
    // paired in the same card) to pin the expected values.
    const labelValue = (label: string) => {
      const lbl = within(statStrip).getByText(label)
      // value is the next sibling div
      const card = lbl.parentElement!
      return within(card).getByText(/^[0-9]+%?$/).textContent
    }
    expect(labelValue('Offices')).toBe('2')
    expect(labelValue('Employees')).toBe('7')
    expect(labelValue('Seats')).toBe('3')
    expect(labelValue('Members')).toBe('7')
  })

  it('search filters cards by name', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    renderPage()
    await screen.findByText('HQ')
    expect(screen.getByText('Annex')).toBeInTheDocument()
    const input = screen.getByLabelText('Search offices')
    fireEvent.change(input, { target: { value: 'hq' } })
    await waitFor(() => {
      expect(screen.queryByText('Annex')).not.toBeInTheDocument()
    })
    expect(screen.getByText('HQ')).toBeInTheDocument()
  })

  it('sort dropdown reorders cards — Name vs Most employees', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    renderPage()
    await screen.findByText('HQ')

    const sortSelect = screen.getByLabelText('Sort offices')

    // Sort by name → Annex (A) before HQ (H).
    fireEvent.change(sortSelect, { target: { value: 'name' } })
    await waitFor(() => {
      const cards = screen.getAllByRole('heading', { level: 3 })
      expect(cards.map((c) => c.textContent)).toEqual(['Annex', 'HQ'])
    })

    // Sort by most employees → HQ (5) before Annex (2).
    fireEvent.change(sortSelect, { target: { value: 'employees' } })
    await waitFor(() => {
      const cards = screen.getAllByRole('heading', { level: 3 })
      expect(cards.map((c) => c.textContent)).toEqual(['HQ', 'Annex'])
    })
  })

  it('renders the welcome empty state when the team has zero offices', async () => {
    listOffices.mockResolvedValue([])
    renderPage()
    expect(
      await screen.findByRole('heading', { name: /welcome to floorcraft/i, level: 2 }),
    ).toBeInTheDocument()
    // A real button, focusable.
    const btn = screen.getByRole('button', { name: /create office/i })
    expect(btn).toBeInTheDocument()
    btn.focus()
    expect(btn).toHaveFocus()
  })

  it('renders a distinct "no matches" empty state when search returns nothing', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    renderPage()
    await screen.findByText('HQ')
    const input = screen.getByLabelText('Search offices')
    fireEvent.change(input, { target: { value: 'zzz-nothing-matches' } })
    await waitFor(() => {
      expect(screen.getByText(/no offices match/i)).toBeInTheDocument()
    })
    // Not the welcome card.
    expect(screen.queryByText(/welcome to floorcraft/i)).not.toBeInTheDocument()
    // Clear button restores the grid.
    fireEvent.click(screen.getByRole('button', { name: /clear search & filters/i }))
    await waitFor(() => {
      expect(screen.getByText('HQ')).toBeInTheDocument()
    })
  })

  it('Recent section is hidden with no recents and shown after addRecent', async () => {
    listOffices.mockResolvedValue(FIXTURE_OFFICES)
    const { unmount } = renderPage()
    await screen.findByText('HQ')
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    unmount()

    // Seed a recent and re-mount; the page reads from localStorage at mount.
    addRecent('hq')
    renderPage()
    // Wait for both the Recent label and the All offices label to appear.
    await screen.findAllByText('HQ')
    expect(await screen.findByRole('heading', { name: 'Recent' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All offices' })).toBeInTheDocument()
  })
})
