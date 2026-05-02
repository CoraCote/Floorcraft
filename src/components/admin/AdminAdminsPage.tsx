import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, ShieldOff, UserPlus } from 'lucide-react'
import {
  findUserByEmail,
  grantPlatformAdmin,
  listPlatformAdmins,
  revokePlatformAdmin,
  type PlatformAdminRow,
} from '../../lib/platformAdmin'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Manage the set of platform admins. Lists current admins; lets an
 * existing admin grant the role to another user (by email) or
 * revoke from a peer.
 *
 * The migration's `revoke_platform_admin` RPC enforces the lockout
 * rule (last admin can't be removed); we surface that as an inline
 * error here without trying to predict it client-side, so the
 * server stays the source of truth.
 */
export function AdminAdminsPage() {
  useDocumentTitle('Admins · Admin — Floorcraft')
  const [admins, setAdmins] = useState<PlatformAdminRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  // Promote-by-email form state
  const [emailInput, setEmailInput] = useState('')
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await listPlatformAdmins()
      if (cancelled) return
      if (list === null) {
        setError('Could not load admin list.')
        setAdmins([])
        return
      }
      setError(null)
      setAdmins(list)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  async function onPromote(e: FormEvent) {
    e.preventDefault()
    if (!emailInput.trim() || busy) return
    setBusy(true)
    setPromoteError(null)
    const lookup = await findUserByEmail(emailInput.trim())
    if (!lookup) {
      setBusy(false)
      setPromoteError('No user found with that email. They need to sign up first.')
      return
    }
    if (lookup.is_platform_admin) {
      setBusy(false)
      setPromoteError(`${lookup.email} is already an admin.`)
      return
    }
    const result = await grantPlatformAdmin(lookup.id)
    setBusy(false)
    if (result.kind === 'error') {
      setPromoteError(result.message)
      return
    }
    setEmailInput('')
    setRefreshNonce((n) => n + 1)
  }

  async function onRevoke(userId: string) {
    const result = await revokePlatformAdmin(userId)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    setError(null)
    setRefreshNonce((n) => n + 1)
  }

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Platform admins</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Anyone with this role can see every team and (in Phase 3) manage billing.
          The last remaining admin can&rsquo;t be revoked — granting the role to a
          teammate first prevents lockout.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <UserPlus size={14} aria-hidden="true" /> Promote a user
        </h2>
        <form onSubmit={onPromote} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
              User email
            </span>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="teammate@example.com"
              disabled={busy}
              className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !emailInput.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded bg-[color:var(--color-blueprint-strong)] text-white hover:bg-[color:var(--color-blueprint)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Granting…' : 'Grant admin'}
          </button>
        </form>
        {promoteError && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
            {promoteError}
          </p>
        )}
      </section>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <ShieldCheck size={14} aria-hidden="true" /> Current admins
      </h2>
      {admins === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No admins. (How are you here?)</p>
      ) : (
        <ul className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                  {a.name?.trim() || a.email}
                </div>
                {a.name?.trim() && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {a.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRevoke(a.id)}
                className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 py-1 rounded"
                title="Revoke admin"
              >
                <ShieldOff size={12} aria-hidden="true" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
