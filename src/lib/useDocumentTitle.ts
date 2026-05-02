import { useEffect } from 'react'

/**
 * Sets `document.title` while the calling component is mounted, then
 * restores whatever title was there before. Mirrors the small inline
 * effect in ProjectShell so the editor and the team/admin/account
 * pages all play by the same rules.
 *
 * `null` / `undefined` short-circuit — useful when the page is
 * still loading the data the title depends on, so the fall-through
 * default ("Floorcraft — …") in `index.html` shows until the real
 * title is known.
 *
 * Convention: pages append `" — Floorcraft"` so the suffix is the
 * stable bit users learn to scan for in their tab strip.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
