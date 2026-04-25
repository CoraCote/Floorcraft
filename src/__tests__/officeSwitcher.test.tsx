import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams, useLocation } from 'react-router-dom'
import { OfficeSwitcher } from '../components/team/OfficeSwitcher'
import type { OfficeListItem } from '../lib/offices/officeRepository'
import { __resetAllOfficesCacheForTests } from '../lib/offices/allOfficesCache'

/**
 * Wave 15D — OfficeSwitcher coverage.
 *
 * Mocks the office repository so the component reads a controlled
 * fixture instead of hitting Supabase, and stubs the supabase client's
 * `teams.select(...).eq(...).maybeSingle()` chain that resolves the
 * teamSlug → teamId on mount.
 */

const { listOfficesMock, fromMock } = vi.hoisted(() => ({
  listOfficesMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: (...a: unknown[]) => listOfficesMock(...a),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}))

const mkOffice = (slug: string, name: string, ts = '2026-04-20T00:00:00Z'): OfficeListItem => ({
  id: `id-${slug}`,
  slug,
  name,
  updated_at: ts,
  is_private: false,
})

/**
 * Test harness: routes the OfficeSwitcher under a parameterised path
 * so it picks up `teamSlug`/`officeSlug` from `useParams` rather than
 * hard-coded props. A captured-location helper lets us assert the
 * navigate destination.
 */
function Harness({
  onLocation,
  initialName = 'HQ Office',
}: {
  onLocation?: (path: string) => void
  initialName?: string
}) {
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const location = useLocation()
  if (onLocation) onLocation(location.pathname + (location.search || ''))
  return (
    <OfficeSwitcher
      teamSlug={teamSlug}
      officeSlug={officeSlug}
      officeName={initialName}
      onRenameCurrent={() => {
        /* no-op for tests; the test just asserts the row is reachable */
      }}
    />
  )
}

function renderAt(initialPath: string, opts?: { onLocation?: (p: string) => void }) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/*"
          element={<Harness onLocation={opts?.onLocation} />}
        />
        {/* Bare team-slug route — destination of "Manage offices" + the
            "+ New office" footer. The element isn't important; we
            just need the router to match the path so the harness's
            onLocation callback can capture it. */}
        <Route
          path="/t/:teamSlug"
          element={<Harness onLocation={opts?.onLocation} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OfficeSwitcher', () => {
  beforeEach(() => {
    listOfficesMock.mockReset()
    fromMock.mockReset()
    __resetAllOfficesCacheForTests()
    // Default: teams resolution returns a sensible team id.
    fromMock.mockImplementation((table: string) => {
      if (table === 'teams') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'team-1' }, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('renders the current office name on the trigger', () => {
    listOfficesMock.mockResolvedValue([])
    renderAt('/t/acme/o/hq/map')
    expect(screen.getByTestId('office-switcher-trigger').textContent).toMatch(/HQ Office/)
  })

  it('opens the dropdown and lists every office in the team', async () => {
    listOfficesMock.mockResolvedValue([
      mkOffice('hq', 'HQ Office'),
      mkOffice('lab', 'Lab Office'),
      mkOffice('annex', 'Annex'),
    ])
    renderAt('/t/acme/o/hq/map')
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    expect(screen.getByTestId('office-switcher-panel')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTestId('office-switcher-office-hq')).toBeTruthy()
    })
    expect(screen.getByTestId('office-switcher-office-lab')).toBeTruthy()
    expect(screen.getByTestId('office-switcher-office-annex')).toBeTruthy()
  })

  it('marks the current office row with aria-current="page" and a check', async () => {
    listOfficesMock.mockResolvedValue([
      mkOffice('hq', 'HQ Office'),
      mkOffice('lab', 'Lab Office'),
    ])
    renderAt('/t/acme/o/hq/map')
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    const hqRow = await screen.findByTestId('office-switcher-office-hq')
    expect(hqRow.getAttribute('aria-current')).toBe('page')
    const labRow = screen.getByTestId('office-switcher-office-lab')
    expect(labRow.getAttribute('aria-current')).toBeNull()
  })

  it('navigates to the selected office when a non-current row is clicked', async () => {
    listOfficesMock.mockResolvedValue([
      mkOffice('hq', 'HQ Office'),
      mkOffice('lab', 'Lab Office'),
    ])
    let lastPath = ''
    renderAt('/t/acme/o/hq/map', {
      onLocation: (p) => {
        lastPath = p
      },
    })
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    const labRow = await screen.findByTestId('office-switcher-office-lab')
    fireEvent.click(labRow)
    await waitFor(() => {
      expect(lastPath).toBe('/t/acme/o/lab/map')
    })
  })

  it('does not render a search input when fewer than 9 offices', async () => {
    listOfficesMock.mockResolvedValue([
      mkOffice('hq', 'HQ Office'),
      mkOffice('lab', 'Lab Office'),
    ])
    renderAt('/t/acme/o/hq/map')
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    await screen.findByTestId('office-switcher-office-hq')
    expect(screen.queryByTestId('office-switcher-search')).toBeNull()
  })

  it('renders a search input when 9+ offices and filters the list', async () => {
    const big = Array.from({ length: 10 }, (_, i) =>
      mkOffice(`o-${i}`, i === 5 ? 'Zebra Outpost' : `Office ${i}`),
    )
    listOfficesMock.mockResolvedValue(big)
    renderAt('/t/acme/o/o-0/map')
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    const search = (await screen.findByTestId('office-switcher-search')) as HTMLInputElement
    expect(search).toBeTruthy()
    act(() => {
      fireEvent.change(search, { target: { value: 'zeb' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('office-switcher-office-o-5')).toBeTruthy()
    })
    expect(screen.queryByTestId('office-switcher-office-o-0')).toBeNull()
  })

  it('exposes a "+ New office" footer that links to TeamHome with ?create=1', async () => {
    listOfficesMock.mockResolvedValue([mkOffice('hq', 'HQ Office')])
    let lastPath = ''
    renderAt('/t/acme/o/hq/map', {
      onLocation: (p) => {
        lastPath = p
      },
    })
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    const create = await screen.findByTestId('office-switcher-create')
    fireEvent.click(create)
    await waitFor(() => {
      expect(lastPath).toBe('/t/acme?create=1')
    })
  })

  it('rename row calls the onRenameCurrent handler', async () => {
    listOfficesMock.mockResolvedValue([mkOffice('hq', 'HQ Office')])
    const onRenameCurrent = vi.fn()
    function H() {
      const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
      return (
        <OfficeSwitcher
          teamSlug={teamSlug}
          officeSlug={officeSlug}
          officeName="HQ Office"
          onRenameCurrent={onRenameCurrent}
        />
      )
    }
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<H />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('office-switcher-trigger'))
    const rename = await screen.findByTestId('office-switcher-rename')
    fireEvent.click(rename)
    expect(onRenameCurrent).toHaveBeenCalledTimes(1)
  })
})
