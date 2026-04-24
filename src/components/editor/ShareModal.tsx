import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSession } from '../../lib/auth/session'
import { VisibilityRadio, type Visibility } from './Share/VisibilityRadio'
import { AccessTable } from './Share/AccessTable'
import { ShareLinkSection } from './Share/ShareLinkSection'
import {
  listPermissions,
  setOfficePrivate,
  type OfficePermEntry,
} from '../../lib/offices/permissionsRepository'
import { Button, Modal, ModalBody } from '../ui'

/**
 * ShareModal v2 — account-aware share sheet.
 *
 * The previous version wrote a single `sharePermission` string onto the
 * project store; this version talks directly to the `offices` +
 * `office_permissions` tables. Visibility is tri-state (team-edit /
 * team-view / private) and per-user overrides live in `AccessTable`.
 *
 * The shareable URL is built from `useParams()` rather than the project
 * facade because the modal always renders inside a `/t/:teamSlug/o/:officeSlug`
 * route and the params are the source of truth during navigation.
 */
export function ShareModal() {
  const open = useUIStore((s) => s.shareModalOpen)
  const setOpen = useUIStore((s) => s.setShareModalOpen)
  const officeId = useProjectStore((s) => s.officeId)
  const project = useProjectStore((s) => s.currentProject) as
    | (null | { id?: string; slug?: string; isPrivate?: boolean; teamId?: string })
  const session = useSession()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  const [visibility, setVisibility] = useState<Visibility>(
    project?.isPrivate ? 'private' : 'team-edit',
  )
  const [entries, setEntries] = useState<OfficePermEntry[]>([])

  async function refresh() {
    if (!officeId || !project?.teamId || session.status !== 'authenticated') return
    setEntries(await listPermissions(officeId, session.user.id, project.teamId))
  }
  useEffect(() => {
    if (open) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, officeId])

  async function onVisibilityChange(v: Visibility) {
    setVisibility(v)
    if (officeId) await setOfficePrivate(officeId, v === 'private')
  }

  const canEdit = entries.some((e) => e.isSelf && e.role === 'owner')
  const link =
    teamSlug && officeSlug
      ? `${window.location.origin}/t/${teamSlug}/o/${officeSlug}/map`
      : window.location.href

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Share office"
      size="lg"
    >
      <ModalBody className="max-h-[70vh] overflow-y-auto space-y-6">
        <section>
          <h3 className="text-sm font-medium mb-2">Visibility</h3>
          <VisibilityRadio value={visibility} onChange={onVisibilityChange} />
        </section>
        <section>
          <h3 className="text-sm font-medium mb-2">Access</h3>
          {officeId ? (
            <AccessTable
              officeId={officeId}
              entries={entries}
              canEdit={canEdit}
              onChange={() => {
                void refresh()
              }}
            />
          ) : null}
        </section>
        <section>
          <h3 className="text-sm font-medium mb-2">Link</h3>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 border rounded px-2 py-1.5 text-xs"
              aria-label="Share link"
            />
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(link)}
            >
              Copy
            </Button>
          </div>
        </section>
        <ShareLinkSection />
      </ModalBody>
    </Modal>
  )
}
