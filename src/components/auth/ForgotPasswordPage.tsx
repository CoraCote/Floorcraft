import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let error: unknown = null
    try {
      const res = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      })
      error = res.error
    } catch (e) {
      error = e
    }
    setBusy(false)
    if (error) {
      setError(humanizeAuthError(error))
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 p-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow max-w-sm text-sm space-y-2">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-gray-600 dark:text-gray-300">If an account exists for {email}, a reset link is on its way.</p>
          <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">Back to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
      <form onSubmit={onSubmit} className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600 dark:text-gray-300">Email</span>
          <input
            type="email"
            required
            className="w-full border rounded px-2 py-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'forgot-form-error' : undefined}
          />
        </label>
        {error && (
          <p
            id="forgot-form-error"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 mt-1"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  )
}
