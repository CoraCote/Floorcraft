import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../supabase'
import type { SessionState } from '../../types/auth'

const SessionContext = createContext<SessionState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setState(
        data.session
          ? { status: 'authenticated', user: { id: data.session.user.id, email: data.session.user.email ?? '' } }
          : { status: 'unauthenticated' },
      )
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: 'authenticated', user: { id: session.user.id, email: session.user.email ?? '' } }
          : { status: 'unauthenticated' },
      )
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

// Co-located with the provider because callers always import both
// from the same module and the hook is trivial. Splitting into its
// own file would just churn imports for no runtime benefit.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionState {
  return useContext(SessionContext)
}
