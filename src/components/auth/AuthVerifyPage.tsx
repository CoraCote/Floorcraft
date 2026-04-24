import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/**
 * Supabase redirects here after a user clicks the verification link. The SDK's
 * `detectSessionInUrl` has already established the session by the time this
 * component mounts. We just consume any pending invite and route the user home.
 */
export function AuthVerifyPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const pending = sessionStorage.getItem('pending_invite_token')
      if (pending) {
        sessionStorage.removeItem('pending_invite_token')
        const { error } = await supabase.rpc('accept_invite', { invite_token: pending })
        if (error) {
          setError(error.message)
          return
        }
      }
      navigate('/dashboard', { replace: true })
    }
    run()
  }, [navigate])

  if (error) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
  }
  return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Completing sign-in…</div>
}
