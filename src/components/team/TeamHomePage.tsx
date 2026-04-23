import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import {
  listOffices,
  createOffice,
  deleteOffice,
  saveOffice,
  type OfficeListItem,
} from '../../lib/offices/officeRepository'
import { buildDemoOfficePayload } from '../../lib/demo/createDemoOffice'
import { formatRelative } from '../../lib/time'
import { ConfirmDialog } from '../editor/ConfirmDialog'
import type { Team } from '../../types/team'

export function TeamHomePage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [offices, setOffices] = useState<OfficeListItem[]>([])
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  // Hold the office the user clicked "Delete" on so the ConfirmDialog
  // can name it in the body. `null` means no dialog — any truthy value
  // means the dialog is up and this office is the target.
  const [pendingDelete, setPendingDelete] = useState<OfficeListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
      if (!t) return
      setTeam(t as Team)
      setOffices(await listOffices((t as Team).id))
    }
    load()
  }, [teamSlug])

  async function onNew() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    const created = await createOffice(team.id, 'Untitled office')
    navigate(`/t/${team.slug}/o/${created.slug}/map`)
  }

  // "Demo office" is a quick-start that seeds a fully populated payload —
  // ~18 employees across 4 departments, manager links, a seated-but-
  // departed person (exercises the unassign cascade), a duplicate
  // name+dept pair (exercises the "rehire?" badge), and a handful of
  // end-dates inside the "Ending soon" window. Creates the row in
  // Supabase, then saves the seeded payload as the very first version so
  // the user can open it and see a live roster immediately.
  async function onNewDemo() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    try {
      const created = await createOffice(team.id, 'Demo office')
      const payload = buildDemoOfficePayload()
      // `created.updated_at` is the version stamp the initial INSERT
      // returned. Passing it back to `saveOffice` just makes the optimistic
      // lock happy — there's no concurrent writer for a brand-new row.
      const res = await saveOffice(
        created.id,
        payload as unknown as Record<string, unknown>,
        created.updated_at,
      )
      if (!res.ok) {
        // Swallow and navigate anyway — an empty office is still usable,
        // and the autosave will retry from the editor. Logging so the
        // failure doesn't vanish silently in dev.
        console.warn('Demo office: initial seed save failed', res)
      }
      navigate(`/t/${team.slug}/o/${created.slug}/roster`)
    } finally {
      setCreating(false)
    }
  }

  // Fire after the user confirms in the dialog. Splits the optimistic
  // list update from the server call so the card disappears instantly,
  // then rolls back if the delete errors out — avoids a stuck "deleting"
  // state on flaky connections.
  async function performDelete(office: OfficeListItem) {
    setDeleting(true)
    const prev = offices
    setOffices((os) => os.filter((o) => o.id !== office.id))
    try {
      await deleteOffice(office.id)
    } catch (err) {
      console.warn('Delete office failed; restoring card', err)
      setOffices(prev)
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading\u2026</div>
  const visible = offices.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{team.name}</h1>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search offices\u2026"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-56"
          />
          <button
            onClick={onNew}
            disabled={creating}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            New office
          </button>
          <Link
            to={`/t/${team.slug}/settings`}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            Settings
          </Link>
          <Link
            to="/help"
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 text-gray-700"
            title="User guide and FAQ"
          >
            Help
          </Link>
        </div>
      </header>
      {/*
        Demo office moved out of the primary CTA row and into a
        disclosure. New-to-Floorcraft operators usually want a blank
        workspace to load their own data into — the demo was confusing
        as a same-weight peer of "New office". Still one click away for
        anyone who actually wants to explore the feature surface.
      */}
      <details className="mb-4 text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
          Or start from a template
        </summary>
        <div className="mt-2 ml-2">
          <button
            onClick={onNewDemo}
            disabled={creating}
            className="text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
            title="Pre-populated with ~18 demo employees to exercise the roster features"
          >
            Sample office · ~18 employees
          </button>
        </div>
      </details>
      {visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500">
          {q ? (
            'No matches.'
          ) : (
            <>
              No offices yet \u2014{' '}
              <button className="text-blue-600 hover:underline" onClick={onNew}>
                create your first
              </button>
              .
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((o) => (
            <li key={o.id} className="relative group">
              {/*
                Card is a link to the map view. The delete button sits
                absolutely inside it with its own onClick that stops
                propagation, so clicking the trash icon doesn't also
                navigate to the office we're about to remove.
              */}
              <Link
                to={`/t/${team.slug}/o/${o.slug}/map`}
                className="block border rounded-lg p-4 pr-10 hover:shadow hover:border-blue-300 bg-white"
              >
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-gray-500 mt-1">Updated {formatRelative(o.updated_at)}</div>
                {o.is_private && <div className="text-xs mt-2 text-amber-700">Private</div>}
              </Link>
              <button
                type="button"
                aria-label={`Delete ${o.name}`}
                title="Delete office"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setPendingDelete(o)
                }}
                // Always visible (muted) so it's actually discoverable —
                // the previous hover-to-reveal was slick but invisible
                // until you knew to hover. Red-tints on hover/focus so
                // the destructive intent is obvious.
                className="absolute top-2 right-2 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400 focus:text-red-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body={
            <div className="space-y-2">
              <p>
                This removes the floor plan, roster, and every saved edit
                for this office. It cannot be undone.
              </p>
              <p className="text-xs text-gray-500">
                Team members with a link will lose access immediately.
              </p>
            </div>
          }
          confirmLabel={deleting ? 'Deleting…' : 'Delete office'}
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={() => {
            if (deleting) return
            void performDelete(pendingDelete)
          }}
          onCancel={() => {
            if (deleting) return
            setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}