import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User as UserIcon } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'

/**
 * Account dropdown — right-hand side of the TopBar.
 *
 * Renders nothing when the session is still loading or unauthenticated.
 * The signup/login flow doesn't mount this component (office routes sit
 * behind `<RequireAuth>`), but the defensive short-circuit keeps
 * accidental mounts from rendering a stray avatar with no email in it.
 *
 * "Log out" clears the Supabase session then routes to `/login` rather
 * than leaving the user on an authenticated-only URL — if we stayed put,
 * `<RequireAuth>` would immediately redirect anyway but the user would
 * see a flash of "Loading…" which looks broken.
 */
export function UserMenu() {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (session.status !== 'authenticated') return null

  const initial = session.user.email[0]?.toUpperCase() ?? '?'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-semibold hover:bg-gray-300"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 bg-white border rounded shadow z-30"
        >
          <div className="px-3 py-2 text-xs text-gray-500 truncate" title={session.user.email}>
            {session.user.email}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/account')
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <UserIcon size={14} /> Account
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await supabase.auth.signOut()
              navigate('/login')
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
