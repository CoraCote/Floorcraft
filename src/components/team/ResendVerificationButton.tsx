import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const COOLDOWN_SEC = 30

/**
 * Reusable button that fires `supabase.auth.resend({ type: 'signup' })`
 * for the given email and then blocks further clicks for 30 seconds.
 * The cooldown is client-side only — Supabase enforces its own rate
 * limit on the server, and this component simply keeps the user from
 * mashing the button while waiting for the mail to arrive.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [remaining, setRemaining] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (remaining <= 0) return
    const t = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  async function onClick() {
    if (remaining > 0 || sending) return
    setSending(true)
    setLastError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setSending(false)
    if (error) {
      setLastError(error.message)
      return
    }
    setRemaining(COOLDOWN_SEC)
  }

  const label = sending
    ? 'Sending…'
    : remaining > 0
      ? `Resend available in ${remaining}s`
      : 'Resend verification email'

  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={remaining > 0 || sending}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 disabled:no-underline"
      >
        {label}
      </button>
      {lastError && <p className="text-xs text-red-600 dark:text-red-400">{lastError}</p>}
    </div>
  )
}
