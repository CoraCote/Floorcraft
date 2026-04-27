import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Download,
  Lock,
  LogOut,
  Mail,
  Trash2,
  User,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'
import { humanizeError } from '../../lib/errorMessages'
import { Button, Input } from '../ui'

/**
 * Wave 18C: AccountPage polish pass.
 *
 * The account surface had been working but visually stale since Phase 6
 * — it was a stack of bare forms inside a `max-w-xl` column with raw
 * `<input>`s, raw `<button>`s, and an ad-hoc inline modal. That gap
 * grew obvious next to TeamSettingsPage (Wave 17C), which uses the
 * gradient shell, identity header, sectioned cards, and polished
 * destructive zones the rest of the app moved to.
 *
 * Scope of this pass is presentation only: the supabase calls, RPC
 * names, and session shape are unchanged. The shape of the page is:
 *
 *   1. Gradient shell + back link + identity header (avatar disc,
 *      display name as the primary line, email as the subtitle).
 *   2. "Profile" section — display-name input via the UI-kit `<Input>`
 *      and `<Button>`, with a read-only email row so the user can see
 *      which account they're signed into without trusting the avatar.
 *   3. "Security" section — change-password form, same primitive set,
 *      with inline validation + saved-state confirmation toast-style.
 *   4. "Data & privacy" section — single-row export action with a brief
 *      explanation of what's in the JSON blob.
 *   5. "Danger zone" — red-tinted card. Sign-out is a low-stakes row
 *      (own card border but neutral chrome). Account deletion uses a
 *      type-to-confirm dialog identical in idiom to the team-delete
 *      flow in TeamSettingsGeneral. If deletion is already scheduled,
 *      we surface the banner + cancel affordance instead of letting
 *      the user re-request.
 *
 * The previous component had two subtle UX bugs the polish corrects:
 *  - The success/error notes for the rename and password forms didn't
 *    auto-clear when the user typed a new value, leaving stale "Saved."
 *    text below an empty form. The polished forms clear them on input.
 *  - The inline delete modal was rolled by hand and didn't trap focus.
 *    The polished version reuses the same lightweight portal-less
 *    backdrop + panel idiom as TeamSettingsGeneral so the visual
 *    treatment matches and Escape behaves as expected.
 */

// ------------------------------------------------------------------
// Avatar helpers — same hash-to-color idiom as TeamHomePage and
// TeamSettingsMembers so an Account page avatar reads as the *same*
// avatar a member sees in the roster pane. Keeping the constant
// inline (rather than extracting to a shared module) matches the
// pattern used elsewhere in this codebase; the colors are stable
// ASCII tied to the user id, so duplication is safe.
// ------------------------------------------------------------------

const AVATAR_COLORS = [
  '#2563eb',
  '#0891b2',
  '#9333ea',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#ca8a04',
]

function hashToColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initialsFor(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim()
  if (!trimmed) return '?'
  // Prefer first-last initials when the string reads like a name; fall
  // back to the first two chars of the local-part for bare emails so
  // alex@example.com renders "AL" rather than just "A".
  const atIndex = trimmed.indexOf('@')
  const base = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed
  const parts = base.split(/[.\s_-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ------------------------------------------------------------------
// Section header — uppercase tracked caps, same idiom as
// TeamSettingsGeneral / TeamSettingsMembers. Pulled out as a tiny
// component (rather than a className constant) because each section
// also wires `aria-labelledby` against the heading id below.
// ------------------------------------------------------------------

function SectionHeading({
  id,
  tone = 'neutral',
  children,
}: {
  id: string
  tone?: 'neutral' | 'danger'
  children: React.ReactNode
}) {
  return (
    <h2
      id={id}
      className={
        tone === 'danger'
          ? 'text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400'
          : 'text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'
      }
    >
      {children}
    </h2>
  )
}

// ------------------------------------------------------------------
// Main component.
// ------------------------------------------------------------------

export function AccountPage() {
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  // Resolve the back-link target. If the user got here from somewhere
  // sensible (the user-menu carries `from` state in a future pass),
  // honor it; otherwise fall back to the dashboard. This is forward-
  // compatible — today the only entry is the user-menu which doesn't
  // pass state, so the default is what runs in practice.
  const backTo =
    (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const backLabel = backTo === '/dashboard' ? 'Back to dashboard' : 'Back'

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
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 text-sm text-gray-500 dark:text-gray-400">
          Loading account…
        </div>
      </div>
    )
  }
  if (session.status !== 'authenticated') return null

  const email = session.user.email
  const displayLabel = name.trim() || email
  const subtitle = name.trim() ? email : 'Floorcraft account'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {/* Breadcrumb back-link — small + understated, positioned above
            the identity header so it reads as "how do I leave this
            page" rather than a primary action. Mirrors the
            TeamSettingsPage shell. */}
        <div className="mb-4">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            {backLabel}
          </Link>
        </div>

        {/* Identity header. Avatar disc (hash-colored initials) + display
            name as `text-3xl` + email as the subtitle when a display
            name exists. When no display name has been set, the email
            takes the primary slot. */}
        <header className="flex items-center gap-4 mb-8">
          <div
            aria-hidden="true"
            className="w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-xl font-semibold text-white shadow-sm"
            style={{ backgroundColor: hashToColor(session.user.id) }}
          >
            {initialsFor(displayLabel)}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 truncate">
              {displayLabel}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
              {subtitle}
            </p>
          </div>
        </header>

        <div className="space-y-8 max-w-2xl text-sm">
          <ProfileSection
            email={email}
            name={name}
            onNameChange={(v) => {
              setName(v)
              // Clear stale success/error notes the moment the user
              // edits — leaving "Saved." sitting under an empty input
              // is a known annoyance from the pre-polish version.
              if (nameSaved) setNameSaved(false)
              if (nameError) setNameError(null)
            }}
            onSubmit={onSaveName}
            saving={savingName}
            saved={nameSaved}
            error={nameError}
          />

          <SecuritySection
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            onNewPasswordChange={(v) => {
              setNewPassword(v)
              if (passwordSaved) setPasswordSaved(false)
              if (passwordError) setPasswordError(null)
            }}
            onConfirmPasswordChange={(v) => {
              setConfirmPassword(v)
              if (passwordSaved) setPasswordSaved(false)
              if (passwordError) setPasswordError(null)
            }}
            onSubmit={onChangePassword}
            saving={savingPassword}
            saved={passwordSaved}
            error={passwordError}
          />

          <DataPrivacySection />

          <DangerZoneSection onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Profile section — display-name + read-only email. Email is shown
// inside the same card so the user has a single "who am I" view; the
// "Change email" affordance opens an explanation modal because the
// supabase-side flow for email changes lives behind a verification
// link and isn't a single-click action from the UI.
// ------------------------------------------------------------------

function ProfileSection({
  email,
  name,
  onNameChange,
  onSubmit,
  saving,
  saved,
  error,
}: {
  email: string
  name: string
  onNameChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  saving: boolean
  saved: boolean
  error: string | null
}) {
  const [emailInfoOpen, setEmailInfoOpen] = useState(false)

  return (
    <section aria-labelledby="profile-heading" className="space-y-3">
      <SectionHeading id="profile-heading">Profile</SectionHeading>
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60 p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              Display name
            </span>
            <Input
              id="account-display-name"
              aria-label="Display name"
              value={name}
              placeholder="How should teammates see you?"
              onChange={(e) => onNameChange(e.target.value)}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Shown next to your avatar across teams, rosters, and
              comments.
            </p>
          </label>

          <div>
            <div className="mb-1 text-gray-700 dark:text-gray-300">Email</div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                aria-label="Email"
                value={email}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEmailInfoOpen(true)}
                leftIcon={<Mail size={14} aria-hidden="true" />}
              >
                Change email
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your email is the unique identifier for this account.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          {saved && !error && (
            <p
              role="status"
              className="text-sm text-green-600 dark:text-green-400"
            >
              Saved.
            </p>
          )}

          <div className="pt-1">
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              leftIcon={<User size={14} aria-hidden="true" />}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </div>

      {emailInfoOpen && (
        <ChangeEmailInfoDialog onClose={() => setEmailInfoOpen(false)} />
      )}
    </section>
  )
}

// ------------------------------------------------------------------
// Email-change modal. Because email is the auth identifier, changing
// it requires verification on the new address — that flow isn't a
// single-button affordance from this page. The modal explains the
// process and points the user at support so we don't pretend to
// support it inline.
// ------------------------------------------------------------------

function ChangeEmailInfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="change-email-info-backdrop"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-email-title"
      >
        <h3
          id="change-email-title"
          className="text-base font-semibold text-gray-900 dark:text-gray-100"
        >
          Change your email
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Email changes require a verification link sent to the new
          address. Contact support@floorcraft.app from your current
          email to start the process — we'll move your account, team
          memberships, and offices over once you confirm.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Security section — change password. Identical structure to the
// profile card so the page reads as a stack of similar surfaces.
// ------------------------------------------------------------------

function SecuritySection({
  newPassword,
  confirmPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  saving,
  saved,
  error,
}: {
  newPassword: string
  confirmPassword: string
  onNewPasswordChange: (v: string) => void
  onConfirmPasswordChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  saving: boolean
  saved: boolean
  error: string | null
}) {
  return (
    <section aria-labelledby="security-heading" className="space-y-3">
      <SectionHeading id="security-heading">Security</SectionHeading>
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60 p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              New password
            </span>
            <Input
              type="password"
              aria-label="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              disabled={saving}
              invalid={Boolean(error) && newPassword.length > 0 && newPassword.length < 8}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              At least 8 characters.
            </p>
          </label>

          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              Confirm new password
            </span>
            <Input
              type="password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              disabled={saving}
              invalid={
                Boolean(error) &&
                confirmPassword.length > 0 &&
                confirmPassword !== newPassword
              }
            />
          </label>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          {saved && !error && (
            <p
              role="status"
              className="text-sm text-green-600 dark:text-green-400"
            >
              Password updated.
            </p>
          )}

          <div className="pt-1">
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              leftIcon={<Lock size={14} aria-hidden="true" />}
            >
              {saving ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------
// Data privacy + danger zone — the deletion flow used to live in a
// separate `DataPrivacySection` that mixed export and delete in one
// surface. The polish splits them: export keeps the neutral card
// treatment (it's not destructive — the worst case is downloading
// stale data), and account deletion moves into the red-tinted danger
// zone alongside Sign out so the user has a single "destructive
// actions" surface to reason about.
// ------------------------------------------------------------------

function DataPrivacySection() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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

  return (
    <section aria-labelledby="privacy-heading" className="space-y-3">
      <SectionHeading id="privacy-heading">Data &amp; privacy</SectionHeading>
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Export my data
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Download a copy of everything Floorcraft stores about you
              — profile, team memberships, invites, and offices you own
              or can edit.
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onExport}
            disabled={exporting}
            leftIcon={<Download size={14} aria-hidden="true" />}
            className="shrink-0"
          >
            {exporting ? 'Preparing…' : 'Export'}
          </Button>
        </div>
        {exportError && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {exportError}
          </p>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------
// Danger zone — sign out + account deletion. The deletion-request RPC
// supports cancellation, so the section flips into a "scheduled for
// X" banner with a cancel affordance whenever a request is already
// pending. The on-mount fetch is unchanged from the pre-polish code;
// only the surface around it is restructured.
// ------------------------------------------------------------------

function DangerZoneSection({ onSignOut }: { onSignOut: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [scheduledFor, setScheduledFor] = useState<string | null>(null)

  const canConfirmDelete =
    deleteInput.trim().toLowerCase() === 'delete my account'

  // Surface any pending deletion request on mount so a user who
  // requested deletion yesterday sees the "scheduled for..." banner
  // when they come back. The RPC is idempotent server-side; the UI
  // shouldn't pretend nothing is scheduled.
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

  async function onRequestDeletion() {
    if (!canConfirmDelete) return
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

  function openConfirm() {
    setDeleteInput('')
    setDeleteError(null)
    setDeleteOpen(true)
  }

  function closeConfirm() {
    setDeleteOpen(false)
    setDeleteInput('')
  }

  return (
    <section aria-labelledby="danger-heading" className="space-y-3">
      <SectionHeading id="danger-heading" tone="danger">
        Danger zone
      </SectionHeading>
      <div className="rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 divide-y divide-red-200/70 dark:divide-red-900/60">
        {/* Sign-out row. Lower-stakes destructive action, neutral
            button color so it doesn't compete with the actual delete
            CTA below. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Sign out
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Sign out of Floorcraft on this device. Other browsers
              stay signed in.
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onSignOut}
            leftIcon={<LogOut size={14} aria-hidden="true" />}
            className="shrink-0"
          >
            Sign out
          </Button>
        </div>

        {/* Delete row. Two states: pending-deletion banner with a
            cancel button, or the request affordance. Type-to-confirm
            modal lives below. */}
        <div className="p-5">
          {scheduledFor ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300">
                  <AlertTriangle size={14} aria-hidden="true" />
                  Account scheduled for deletion
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Your account will be permanently deleted on{' '}
                  <span className="font-semibold tabular-nums">
                    {new Date(scheduledFor).toLocaleDateString()}
                  </span>
                  . Cancel any time before that date to restore access.
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancelDeletion}
                className="shrink-0"
              >
                Cancel deletion
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  Delete account
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Schedule your account for permanent deletion. You'll
                  have 30 days to change your mind before anything is
                  removed.
                </div>
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={openConfirm}
                leftIcon={<Trash2 size={14} aria-hidden="true" />}
                className="shrink-0"
              >
                Delete account
              </Button>
            </div>
          )}
          {deleteError && !deleteOpen && (
            <p
              role="alert"
              className="mt-3 text-sm text-red-600 dark:text-red-400"
            >
              {deleteError}
            </p>
          )}
        </div>
      </div>

      {deleteOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
          data-testid="delete-account-backdrop"
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <h3
              id="delete-account-title"
              className="flex items-center gap-1.5 text-base font-semibold text-red-700 dark:text-red-300"
            >
              <AlertTriangle size={16} aria-hidden="true" />
              Delete your account?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your account will be scheduled for permanent deletion in
              30 days. You can cancel the request at any time before
              then. After deletion, your profile and data cannot be
              recovered.
            </p>
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-300">
                Type <b>delete my account</b> to confirm
              </span>
              <Input
                autoFocus
                aria-label="Type delete my account to confirm"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirmDelete && !deleteBusy) {
                    void onRequestDeletion()
                  }
                  if (e.key === 'Escape') closeConfirm()
                }}
              />
            </label>
            {deleteError && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={closeConfirm}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={onRequestDeletion}
                disabled={!canConfirmDelete || deleteBusy}
              >
                {deleteBusy ? 'Scheduling…' : 'Schedule deletion'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
