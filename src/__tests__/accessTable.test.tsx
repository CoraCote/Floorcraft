import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccessTable } from '../components/editor/Share/AccessTable'

const { upsertPerm, removePerm } = vi.hoisted(() => ({
  upsertPerm: vi.fn(),
  removePerm: vi.fn(),
}))
vi.mock('../lib/offices/permissionsRepository', () => ({
  upsertPermission: (...a: unknown[]) => upsertPerm(...a),
  removePermission: (...a: unknown[]) => removePerm(...a),
}))

const rows = [
  { user_id: 'u1', email: 'alice@a.test', name: 'Alice', role: 'owner' as const, isSelf: true },
  { user_id: 'u2', email: 'bob@a.test', name: 'Bob', role: 'editor' as const, isSelf: false },
]

describe('AccessTable', () => {
  it('changes a teammate role to viewer', async () => {
    upsertPerm.mockResolvedValue(undefined)
    const onChange = vi.fn()
    render(<AccessTable officeId="o1" entries={rows} canEdit onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/bob@a.test role/i), { target: { value: 'viewer' } })
    await waitFor(() => expect(upsertPerm).toHaveBeenCalledWith('o1', 'u2', 'viewer'))
    expect(onChange).toHaveBeenCalled()
  })
})
