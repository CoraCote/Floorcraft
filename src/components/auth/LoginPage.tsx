import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/dashboard'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Log in to Floorcraft</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            type="email"
            required
            className="w-full border rounded px-2 py-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Password</span>
          <input
            type="password"
            required
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Log in'}
        </button>
        <div className="flex justify-between text-xs text-gray-500">
          <Link to="/forgot" className="hover:underline">Forgot password?</Link>
          <Link to="/signup" className="hover:underline">Create an account</Link>
        </div>
      </form>
    </div>
  )
}
