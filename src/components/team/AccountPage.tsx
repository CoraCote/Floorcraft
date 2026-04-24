import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'
import { humanizeError } from '../../lib/errorMessages'

/**
 * Personal account settings. This page lives at `/account` and is the
 * only place outside of `/t/:teamSlug/...` that a signed-in user can
 * reach — think "User → Account" from the TopBar UserMenu.
 *
 * Keep the scope tight: display name + password + sign-out. Anything
 * team-scoped belongs in `TeamSettingsPage`; anything membership-related
 * (e.g. "leave team") could go here later but isn't part of Phase 6.
 */
export function AccountPage() {
  const session = useSession()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  useEffect(() => {
    if (session.status !== 'authenticated') return
    void supabase
      .from('profiles')
      .select('name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        // Profiles row may not exist yet for brand-new accounts; start
        // with an empty string rather than forcing the user to see an
        // error the first time they open the page.
        setName((data as { name?: string | null } | null)?.name ?? '')
      })
  }, [session])

  async function onSaveName(e: FormEvent) {
    e.preventDefault()
    if (session.status !== 'authenticated') return
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    // Upsert so a brand-new account without a `profiles` row still works
    // on first save. `id` is the FK to `auth.users.id`; the `name`
    // column is the only mutable field on this table.
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: session.user.id, name }, { onConflict: 'id' })
    setSavingName(false)
    if (error) {
      setNameError(humanizeError(error))
      return
    }
    setNameSaved(true)
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSaved(false)
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordError(humanizeError(error))
      return
    }
    setPasswordSaved(true)
    setNewPassword('')
    setConfirmPassword('')
  }

  async function onSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
  }
  if (session.status !== 'authenticated') return null

  return (
    <div className="p-6 max-w-xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Account</h1>
        <Link to="/dashboard" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Back to dashboard
        </Link>
      </header>

      <form onSubmit={onSaveName} className="space-y-3 text-sm">
        <h2 className="font-semibold">Profile</h2>
        <label className="block">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">Email</span>
          <input
            readOnly
            value={session.user.email}
            className="w-full border rounded px-2 py-1.5 bg-gray-50 dark:bg-gray-800/50"
          />
        </label>
        <label className="block">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
          />
        </label>
        {nameError && <p className="text-red-600 dark:text-red-400">{nameError}</p>}
        {nameSaved && <p className="text-green-600 dark:text-green-400">Saved.</p>}
        <button
          disabled={savingName}
          className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {savingName ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form onSubmit={onChangePassword} className="space-y-3 text-sm">
        <h2 className="font-semibold">Change password</h2>
        <label className="block">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
            autoComplete="new-password"
          />
        </label>
        {passwordError && <p className="text-red-600 dark:text-red-400">{passwordError}</p>}
        {passwordSaved && <p className="text-green-600 dark:text-green-400">Password updated.</p>}
        <button
          disabled={savingPassword}
          className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {savingPassword ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <section className="space-y-2 text-sm border-t pt-6">
        <h2 className="font-semibold">Sign out</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Sign out of Floorcraft on this device. Other browsers stay signed in.
        </p>
        <button
          onClick={onSignOut}
          className="px-3 py-1.5 border rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          Sign out
        </button>
      </section>

      <DataPrivacySection />
    </div>
  )
}

/**
 * GDPR surface. Split out as its own component so the data-export and
 * deletion-request flows don't bloat `AccountPage` further — they have
 * their own local state (busy flags, confirmation typing, success
 * messages) that's unrelated to the profile/password forms.
 *
 * Both actions are fire-and-forget on the server side:
 *
 *   - `export_user_data()` returns a single JSON blob the user can save
 *     locally. No email, no async job — it's fast enough at current
 *     scale to do inline.
 *   - `request_account_deletion()` writes a row to
 *     `account_deletion_requests` with a 30-day `scheduled_for`. The
 *     user can cancel any time before the scheduled date; the actual
 *     hard-delete is out-of-band (ops script / scheduled job).
 */
function DataPrivacySection() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [scheduledFor, setScheduledFor] = useState<string | null>(null)

  // Surface any pending deletion request on mount so a user who
  // requested deletion yesterday sees the "scheduled for..." banner when
  // they come back, not an empty form where they could re-request and
  // double-write the row (the RPC handles this idempotently, but the UI
  // shouldn't pretend nothing is scheduled).
  useEffect(() => {
    void supabase
      .from('account_deletion_requests')
      .select('scheduled_for, cancelled_at, completed_at')
      .maybeSingle()
      .then(({ data }) => {
        const row = data as
          | {
              scheduled_for: string
              cancelled_at: string | null
              completed_at: string | null
            }
          | null
        if (row && !row.cancelled_at && !row.completed_at) {
          setScheduledFor(row.scheduled_for)
        }
      })
  }, [])

  async function onExport() {
    setExporting(true)
    setExportError(null)
    try {
      const { data, error } = await supabase.rpc('export_user_data')
      if (error) throw error
      // Build a same-origin blob URL instead of a data: URL because
      // Chrome blocks data: navigations on top-level frames for
      // anti-phishing reasons. Revoke after a tick so the browser has
      // time to start the download.
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `floorcraft-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setExportError(humanizeError(e))
    }
    setExporting(false)
  }

  async function onRequestDeletion() {
    if (deleteInput.trim().toLowerCase() !== 'delete my account') return
    setDeleteBusy(true)
    setDeleteError(null)
    const { data, error } = await supabase.rpc('request_account_deletion')
    setDeleteBusy(false)
    if (error) {
      setDeleteError(humanizeError(error))
      return
    }
    setScheduledFor(typeof data === 'string' ? data : String(data))
    setDeleteOpen(false)
    setDeleteInput('')
  }

  async function onCancelDeletion() {
    const { error } = await supabase.rpc('cancel_account_deletion')
    if (error) {
      setDeleteError(humanizeError(error))
      return
    }
    setScheduledFor(null)
  }

  return (
    <section className="space-y-3 text-sm border-t pt-6">
      <h2 className="font-semibold">Data &amp; privacy</h2>

      <div className="space-y-2">
        <p className="text-gray-600 dark:text-gray-300">
          Download a copy of everything Floorcraft stores about you —
          profile, team memberships, invites, offices you own or can
          edit.
        </p>
        <button
          onClick={onExport}
          disabled={exporting}
          className="px-3 py-1.5 border rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
        >
          {exporting ? 'Preparing…' : 'Export my data'}
        </button>
        {exportError && <p className="text-red-600 dark:text-red-400">{exportError}</p>}
      </div>

      <div className="space-y-2 pt-3 border-t">
        <h3 className="font-semibold text-red-700 dark:text-red-300">Delete my account</h3>
        {scheduledFor ? (
          <>
            <p className="text-gray-600 dark:text-gray-300">
              Your account is scheduled for permanent deletion on{' '}
              <b>{new Date(scheduledFor).toLocaleDateString()}</b>. Cancel
              any time before that date to restore access.
            </p>
            <button
              onClick={onCancelDeletion}
              className="px-3 py-1.5 border rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              Cancel deletion request
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600 dark:text-gray-300">
              Schedule your account for permanent deletion. You'll have
              30 days to change your mind before anything is removed.
            </p>
            <button
              onClick={() => {
                setDeleteOpen(true)
                setDeleteInput('')
                setDeleteError(null)
              }}
              className="px-3 py-1.5 border border-red-300 text-red-700 dark:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Request account deletion
            </button>
          </>
        )}
        {deleteError && <p className="text-red-600 dark:text-red-400">{deleteError}</p>}
      </div>

      {deleteOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-red-700 dark:text-red-300">
              Request account deletion
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your account will be scheduled for permanent deletion in 30
              days. You can cancel the request at any time before then.
              After deletion, your profile and data cannot be recovered.
            </p>
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-300">
                Type <b>delete my account</b> to confirm
              </span>
              <input
                autoFocus
                className="w-full border rounded px-2 py-1.5"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setDeleteOpen(false)
                }}
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleteBusy}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={onRequestDeletion}
                disabled={
                  deleteBusy ||
                  deleteInput.trim().toLowerCase() !== 'delete my account'
                }
                className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-40"
              >
                {deleteBusy ? 'Scheduling…' : 'Schedule deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
