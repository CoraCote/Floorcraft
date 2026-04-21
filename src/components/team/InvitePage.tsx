import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const session = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) return <div className="p-6 text-sm">Invalid invite link.</div>

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }

  if (session.status === 'unauthenticated') {
    return <Navigate to={`/signup?invite=${encodeURIComponent(token)}`} replace />
  }

  async function accept() {
    setBusy(true)
    setError(null)
    const { data: teamId, error: rpcError } = await supabase.rpc('accept_invite', { invite_token: token })
    if (rpcError) {
      setError(rpcError.message)
      setBusy(false)
      return
    }
    const { data: team } = await supabase.from('teams').select('slug').eq('id', teamId).single()
    navigate(`/t/${team?.slug ?? ''}`, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-6 rounded-lg shadow max-w-sm space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Join the team</h1>
        <p className="text-gray-600">You've been invited to a team on Floorcraft. Click below to accept.</p>
        {error && <p className="text-red-600">{error}</p>}
        <button
          onClick={accept}
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
      </div>
    </div>
  )
}
