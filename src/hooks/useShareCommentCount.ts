import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Lightweight count of share-comments for an office. Used by the
 * RightSidebar to render a badge on the Insights → Comments section
 * header without forcing the panel itself to load. The query uses
 * `head: true` so we only get the count, not the rows; the
 * `share_comments_owner_read` policy from migration 0014 gates this
 * to authorised viewers and returns 0 for everyone else.
 *
 * Re-fetches on `officeId` change. Real-time updates are out of
 * scope; for now the badge reflects state at sidebar mount, refresh
 * via the panel's refresh button (or a navigation) brings it back
 * in sync.
 */
export function useShareCommentCount(
  officeId: string | null,
): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!officeId) {
        setCount(0)
        return
      }
      const { count: result, error } = await supabase
        .from('share_comments')
        .select('*', { count: 'exact', head: true })
        .eq('office_id', officeId)
      if (cancelled) return
      if (error) {
        setCount(0)
        return
      }
      setCount(result ?? 0)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [officeId])
  return count
}
