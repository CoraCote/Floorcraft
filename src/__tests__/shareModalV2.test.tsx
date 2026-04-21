import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ShareModal } from '../components/editor/ShareModal'

const { listPerms, setOfficePrivate, upsertPermission, removePermission } = vi.hoisted(() => ({
  listPerms: vi.fn(),
  setOfficePrivate: vi.fn(),
  upsertPermission: vi.fn(),
  removePermission: vi.fn(),
}))
vi.mock('../lib/offices/permissionsRepository', () => ({
  listPermissions: (...a: unknown[]) => listPerms(...a),
  setOfficePrivate: (...a: unknown[]) => setOfficePrivate(...a),
  upsertPermission: (...a: unknown[]) => upsertPermission(...a),
  removePermission: (...a: unknown[]) => removePermission(...a),
}))
vi.mock('../stores/uiStore', () => ({
  useUIStore: (sel: (s: { shareModalOpen: boolean; setShareModalOpen: () => void }) => unknown) => sel({ shareModalOpen: true, setShareModalOpen: () => {} }),
}))
vi.mock('../stores/projectStore', () => ({
  useProjectStore: (sel: (s: { officeId: string; currentProject: { id: string; slug: string; isPrivate: boolean; teamId: string } }) => unknown) =>
    sel({
      officeId: 'o1',
      currentProject: { id: 'o1', slug: 'hq', isPrivate: false, teamId: 't1' },
    }),
}))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

describe('ShareModal v2', () => {
  it('changes visibility to private', async () => {
    listPerms.mockResolvedValue([])
    setOfficePrivate.mockResolvedValue(undefined)
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<ShareModal />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByLabelText(/private/i))
    await waitFor(() => expect(setOfficePrivate).toHaveBeenCalledWith('o1', true))
  })
})
