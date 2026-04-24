import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolveShareToken } from '../../lib/shareTokens'
import { loadOfficeById } from '../../lib/offices/loadOfficeById'
import type { Employee } from '../../types/employee'

/**
 * Anonymous read-only surface for share-token URLs. The route is
 * `/shared/:projectId/:token` and is NOT behind the RequireAuth
 * wrapper — the RLS policies on `share_tokens` +
 * `offices_public_via_share_token` do all the gating on the server.
 *
 * Pilot scope: roster-only table view. The spec asks for "read-only
 * map + roster", but the Konva map renderer has more session plumbing
 * dependencies (floor store, canvas settings, insights store) than we
 * want to wire up for an anon page during pilot. A roster table is
 * the most frequently-requested artifact for exec reviews anyway.
 * Map sharing can land in a follow-up.
 */
export function SharedProjectView() {
  const { projectId, token } = useParams<{ projectId: string; token: string }>()
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>(
    projectId && token ? 'loading' : 'invalid',
  )
  const [employees, setEmployees] = useState<Employee[]>([])
  const [floorCount, setFloorCount] = useState(0)

  useEffect(() => {
    if (!projectId || !token) return
    let cancelled = false
    ;(async () => {
      const resolved = await resolveShareToken(token)
      if (!resolved || resolved.officeId !== projectId) {
        if (!cancelled) setStatus('invalid')
        return
      }
      const office = await loadOfficeById(projectId)
      if (!office) {
        if (!cancelled) setStatus('invalid')
        return
      }
      if (cancelled) return
      // Extract just the employee roster + floor count from the
      // payload. We deliberately don't hydrate the editor stores —
      // this surface has no editing capability and keeping it
      // isolated means an anon visitor can't poison the local store
      // state for an authenticated session in the same browser tab.
      const p = office.payload as {
        employees?: Record<string, Employee>
        floors?: unknown[]
      }
      const roster = Object.values(p.employees ?? {})
      setEmployees(roster)
      setFloorCount(Array.isArray(p.floors) ? p.floors.length : 0)
      setStatus('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, token])

  if (status === 'loading') return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading shared project…</div>
  if (status === 'invalid') return <div className="p-6 text-sm">This share link isn't valid.</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Shared read-only view</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {floorCount} floor{floorCount === 1 ? '' : 's'} · {employees.length} people
        </p>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-200 dark:border-gray-800">
            <th className="py-2">Name</th>
            <th>Department</th>
            <th>Title</th>
            <th>Seat</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1">{e.name}</td>
              <td className="py-1">{e.department ?? ''}</td>
              <td className="py-1">{e.title ?? ''}</td>
              <td className="py-1">{e.seatId ? 'assigned' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
