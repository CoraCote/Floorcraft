import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuditLogPage } from '../components/admin/AuditLogPage'
import { useProjectStore } from '../stores/projectStore'
import * as repo from '../lib/auditRepository'
import * as teamRepo from '../lib/teams/teamRepository'

vi.mock('../lib/auditRepository', () => ({
  listEvents: vi.fn(),
}))
vi.mock('../lib/teams/teamRepository', () => ({
  listTeamMembers: vi.fn(),
}))

beforeEach(() => {
  useProjectStore.setState({
    currentOfficeRole: 'owner',
    currentTeamId: 't1',
    currentUserId: 'u1',
  } as never)
  vi.mocked(repo.listEvents).mockResolvedValue([
    {
      id: 'a1',
      team_id: 't1',
      actor_id: 'u1',
      action: 'employee.create',
      target_type: 'employee',
      target_id: 'e1',
      metadata: {},
      created_at: '2026-04-20T10:00:00Z',
    },
    {
      id: 'a2',
      team_id: 't1',
      actor_id: 'u2',
      action: 'seat.assign',
      target_type: 'employee',
      target_id: 'e2',
      metadata: {},
      created_at: '2026-04-21T11:00:00Z',
    },
  ])
  vi.mocked(teamRepo.listTeamMembers).mockResolvedValue([])
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/audit']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/audit" element={<AuditLogPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuditLogPage', () => {
  it('renders events from repository', async () => {
    mount()
    // The action label appears both in the table cell pill AND in the
    // filter <select> options, so we scope to the table to disambiguate.
    await waitFor(() => {
      const table = screen.getByRole('table')
      expect(table).toHaveTextContent('employee.create')
      expect(table).toHaveTextContent('seat.assign')
    })
  })

  it('hides page for viewer role', async () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeInTheDocument())
  })

  it('renders the polished page header and subtitle', async () => {
    mount()
    expect(
      await screen.findByRole('heading', { level: 1, name: /audit log/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/last 200 events/i)).toBeInTheDocument()
  })
})
