import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as repo from '../lib/auditRepository'
import { emit } from '../lib/audit'
import { useProjectStore } from '../stores/projectStore'

vi.mock('../lib/auditRepository', () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.mocked(repo.insertEvent).mockClear().mockResolvedValue(undefined)
  useProjectStore.setState({
    currentTeamId: 'team-1',
    currentUserId: 'user-1',
  } as never)
})

describe('audit.emit', () => {
  it('posts action + target with auto-filled team + actor', async () => {
    await emit('employee.create', 'employee', 'e1', { name: 'Alice' })
    expect(repo.insertEvent).toHaveBeenCalledWith({
      team_id: 'team-1',
      actor_id: 'user-1',
      action: 'employee.create',
      target_type: 'employee',
      target_id: 'e1',
      metadata: { name: 'Alice' },
    })
  })

  it('swallows insert failures (best-effort)', async () => {
    vi.mocked(repo.insertEvent).mockRejectedValueOnce(new Error('network'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(emit('employee.create', 'employee', 'e2', {})).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('skips when team or user is missing (pre-login)', async () => {
    useProjectStore.setState({ currentTeamId: null, currentUserId: null } as never)
    await emit('employee.create', 'employee', 'e3', {})
    expect(repo.insertEvent).not.toHaveBeenCalled()
  })
})
