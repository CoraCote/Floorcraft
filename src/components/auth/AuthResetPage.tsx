import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'

export function AuthResetPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let error: unknown = null
    try {
      const res = await supabase.auth.updateUser({ password })
      error = res.error
    } catch (e) {
      error = e
    }
    setBusy(false)
    if (error) {
      setError(humanizeAuthError(error))
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
      <form onSubmit={onSubmit} className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">New password</span>
          <input
            type="password"
            required
            minLength={8}
            aria-describedby="reset-password-hint"
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span
            id="reset-password-hint"
            className="mt-1 block text-xs text-gray-500 dark:text-gray-400"
          >
            At least 8 characters.
          </span>
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
