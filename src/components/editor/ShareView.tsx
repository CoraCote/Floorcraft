import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { parseShareToken } from '../../lib/shareLinkUrl'
import { useShareLinksStore } from '../../stores/shareLinksStore'
import { useProjectStore } from '../../stores/projectStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
import { redactEmployeeMap } from '../../lib/redactEmployee'
import type { Employee } from '../../types/employee'

/**
 * Public route `/share/:officeSlug?t=<token>`. Validates the token via the
 * client `shareLinksStore`; on success flips the viewer's effective role
 * to `shareViewer` (which grants only `viewMap` and denies `viewPII` so
 * every mutating surface and every PII cell stays hidden) and renders a
 * read-only projection of the current office payload.
 *
 * This surface explicitly does not fetch from Supabase — D6's pilot scope
 * uses the in-payload `shareLinks` record for validation and relies on
 * the ProjectShell-driven hydration of the editor stores. A full-anon
 * variant would need a server-side resolver that bypasses auth; that's
 * deferred to a follow-up alongside the existing `share_tokens` table.
 */
export function ShareView() {
  const { officeSlug } = useParams<{ officeSlug: string }>()
  const [searchParams] = useSearchParams()
  const token = parseShareToken(searchParams)

  // Subscribe to `links` so the component re-renders when store contents
  // change (e.g. a concurrent revoke); the derivation below reads the
  // current snapshot via `isTokenValid`.
  const links = useShareLinksStore((s) => s.links)
  const isTokenValid = useShareLinksStore((s) => s.isTokenValid)
  void links
  const employees = useEmployeeStore((s) => s.employees)
  const floors = useFloorStore((s) => s.floors)
  const elements = useElementsStore((s) => s.elements)

  // Derive validity directly from the token + store instead of routing it
  // through `useState` + an effect. That keeps the render pure and avoids
  // the `set-state-in-effect` lint (per the codebase precedent in
  // `AnnotationPopover`: compute on render, re-subscribe to inputs via the
  // `links` selector so store updates re-run the derivation).
  const validity: 'valid' | 'invalid' = useMemo(() => {
    if (!token) return 'invalid'
    return isTokenValid(token) ? 'valid' : 'invalid'
  }, [token, isTokenValid])

  // Install the `shareViewer` role on successful validation — every
  // `useCan(...)` gate downstream then denies writes and PII. We also
  // clear any lingering impersonation so an editor who follows their own
  // share link still sees the redacted read-only shell.
  useEffect(() => {
    if (validity !== 'valid') return
    const prev = useProjectStore.getState().currentOfficeRole
    useProjectStore.setState({
      currentOfficeRole: 'shareViewer',
      impersonatedRole: null,
    })
    return () => {
      // Only restore the previous role if nobody else has overwritten it
      // in the meantime (e.g. a concurrent ProjectShell load).
      if (useProjectStore.getState().currentOfficeRole === 'shareViewer') {
        useProjectStore.setState({ currentOfficeRole: prev })
      }
    }
  }, [validity])

  const redacted = useMemo(() => redactEmployeeMap(employees), [employees])

  if (validity === 'invalid') {
    return (
      <div className="p-6 text-sm" role="alert">
        Link expired or invalid
      </div>
    )
  }

  const peopleList: Employee[] = Object.values(redacted)
  const floorCount = floors.length
  const elementCount = Object.keys(elements).length

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Shared read-only map</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Office: {officeSlug} · {floorCount} floor{floorCount === 1 ? '' : 's'} ·{' '}
          {elementCount} element{elementCount === 1 ? '' : 's'} ·{' '}
          {peopleList.length} people
        </p>
      </header>

      <section aria-label="Map" className="border border-gray-200 dark:border-gray-800 rounded p-4 bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Map</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Read-only view. Editing is disabled on shared links.
        </p>
      </section>

      <section aria-label="People">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">People (redacted)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-800">
              <th className="py-2">Initials</th>
              <th>Department</th>
              <th>Title</th>
              <th>Seat</th>
            </tr>
          </thead>
          <tbody>
            {peopleList.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1">{e.name}</td>
                <td className="py-1">{e.department ?? ''}</td>
                <td className="py-1">{e.title ?? ''}</td>
                <td className="py-1">{e.seatId ? 'assigned' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
