import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuditLogPage } from '../components/admin/AuditLogPage'
import { useProjectStore } from '../stores/projectStore'
import * as repo from '../lib/auditRepository'

vi.mock('../lib/auditRepository', () => ({
  listEvents: vi.fn(),
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
    await waitFor(() => expect(screen.getByText('employee.create')).toBeInTheDocument())
    expect(screen.getByText('seat.assign')).toBeInTheDocument()
  })

  it('hides page for viewer role', async () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeInTheDocument())
  })
})
