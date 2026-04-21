import { useEffect, useState } from 'react'
import { X as XIcon } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSession } from '../../lib/auth/session'
import { VisibilityRadio, type Visibility } from './Share/VisibilityRadio'
import { AccessTable } from './Share/AccessTable'
import {
  listPermissions,
  setOfficePrivate,
  type OfficePermEntry,
} from '../../lib/offices/permissionsRepository'

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

  // Escape-to-close matches the previous ShareModal so keyboard users
  // don't regress.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, setOpen])

  if (!open) return null

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
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-lg shadow w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold">Share office</h2>
          <button
            aria-label="Close share modal"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <XIcon size={16} />
          </button>
        </header>
        <div className="p-4 space-y-6">
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
              <button
                onClick={() => navigator.clipboard?.writeText(link)}
                className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
