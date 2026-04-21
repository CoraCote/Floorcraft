import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'

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
      setNameError(error.message)
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
      setPasswordError(error.message)
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
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }
  if (session.status !== 'authenticated') return null

  return (
    <div className="p-6 max-w-xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Account</h1>
        <Link to="/dashboard" className="text-sm text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </header>

      <form onSubmit={onSaveName} className="space-y-3 text-sm">
        <h2 className="font-semibold">Profile</h2>
        <label className="block">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            readOnly
            value={session.user.email}
            className="w-full border rounded px-2 py-1.5 bg-gray-50"
          />
        </label>
        <label className="block">
          <span className="block mb-1 text-gray-600">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
          />
        </label>
        {nameError && <p className="text-red-600">{nameError}</p>}
        {nameSaved && <p className="text-green-600">Saved.</p>}
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
          <span className="block mb-1 text-gray-600">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="block mb-1 text-gray-600">Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
            autoComplete="new-password"
          />
        </label>
        {passwordError && <p className="text-red-600">{passwordError}</p>}
        {passwordSaved && <p className="text-green-600">Password updated.</p>}
        <button
          disabled={savingPassword}
          className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {savingPassword ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <section className="space-y-2 text-sm border-t pt-6">
        <h2 className="font-semibold">Sign out</h2>
        <p className="text-gray-500">
          Sign out of Floocraft on this device. Other browsers stay signed in.
        </p>
        <button
          onClick={onSignOut}
          className="px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
