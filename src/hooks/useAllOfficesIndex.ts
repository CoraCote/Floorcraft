import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getCachedOffices,
  primeAllOffices,
  type AllOfficePayload,
} from '../lib/offices/allOfficesCache'
import type { SearchableOffice } from '../lib/crossOfficeSearch'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'
import type { CanvasElement } from '../types/elements'

/**
 * Flattens every office in the current team into a memoized searchable
 * index: employees by name, elements by label, neighborhoods by name,
 * and the office itself. The hook primes an in-memory cache on mount
 * (see `allOfficesCache`), then derives the index from whatever is
 * currently cached.
 *
 * The index is memoized on the payload array identity — because the
 * cache stores one stable array reference per team, re-renders of the
 * consumer (e.g. on every keystroke in the palette) do NOT rebuild the
 * index until the cache actually changes.
 */
export function useAllOfficesIndex(teamSlug: string | undefined): SearchableOffice[] {
  const [version, setVersion] = useState(0)
  const [teamId, setTeamId] = useState<string | null>(null)

  // Resolve team slug → id (the cache is keyed by id so multiple tabs with
  // the same team share a single hydration).
  useEffect(() => {
    if (!teamSlug) return
    let cancelled = false
    void supabase
      .from('teams')
      .select('id')
      .eq('slug', teamSlug)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setTeamId((data as { id: string }).id)
      })
    return () => {
      cancelled = true
    }
  }, [teamSlug])

  // Kick the cache. Uses `version` to re-render once the data lands.
  useEffect(() => {
    if (!teamId || !teamSlug) return
    let cancelled = false
    void primeAllOffices(teamId, teamSlug).then(() => {
      if (!cancelled) setVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [teamId, teamSlug])

  return useMemo(() => {
    if (!teamId) return []
    const cached = getCachedOffices(teamId)
    if (!cached) return []
    return cached.map((o) => flatten(o))
    // `version` bumps on hydrate so the memo recomputes once the cache lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, version])
}

/**
 * Extract the searchable entities out of an office payload. Payload
 * shape mirrors what `useOfficeSync.buildCurrentPayload` persists — we
 * defensively `.` through each key so a malformed legacy row just
 * contributes zero entities instead of throwing.
 */
function flatten(office: AllOfficePayload): SearchableOffice {
  const payload = (office.payload ?? {}) as Record<string, unknown>

  const employeeMap = (payload.employees ?? {}) as Record<string, Employee>
  const employees = Object.values(employeeMap).map((e) => ({
    id: e.id,
    name: e.name,
    department: e.department ?? null,
    title: e.title ?? null,
  }))

  const floors = (payload.floors ?? []) as { id: string; elements: Record<string, CanvasElement> }[]
  const elements: SearchableOffice['elements'] = []
  for (const f of floors) {
    const floorElements = (f.elements ?? {}) as Record<string, CanvasElement>
    for (const el of Object.values(floorElements)) {
      if (!el.label) continue
      elements.push({ id: el.id, label: el.label, type: el.type, floorId: f.id })
    }
  }

  const neighborhoodMap = (payload.neighborhoods ?? {}) as Record<string, Neighborhood>
  const neighborhoods = Object.values(neighborhoodMap).map((n) => ({
    id: n.id,
    name: n.name,
    floorId: n.floorId,
  }))

  return {
    officeId: office.id,
    officeSlug: office.slug,
    officeName: office.name,
    employees,
    elements,
    neighborhoods,
  }
}
