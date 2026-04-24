/**
 * Cross-office search — pure function used by the Cmd+K palette to find
 * employees, elements, neighborhoods, and offices across EVERY office in
 * the current team (not just the active one).
 *
 * Scoring is a cheap case-insensitive substring match with a character-
 * run-length bonus so exact-prefix hits outrank mid-label matches. No
 * fuzzy library — the palette is small, predictable, and the result set
 * is capped upstream by the caller.
 */

export type CrossOfficeKind = 'employee' | 'element' | 'neighborhood' | 'office'

export interface CrossOfficeResult {
  officeId: string
  officeSlug: string
  officeName: string
  kind: CrossOfficeKind
  id: string
  label: string
  sublabel: string
}

export interface SearchableOffice {
  officeId: string
  officeSlug: string
  officeName: string
  employees: { id: string; name: string; department?: string | null; title?: string | null }[]
  elements: { id: string; label: string; type: string; floorId: string | null }[]
  neighborhoods: { id: string; name: string; floorId: string | null }[]
}

/** Ordering tier per kind so ties in score break on semantic importance. */
const KIND_RANK: Record<CrossOfficeKind, number> = {
  office: 0,
  employee: 1,
  neighborhood: 2,
  element: 3,
}

function scoreMatch(label: string, query: string): number {
  const lab = label.toLowerCase()
  const q = query.toLowerCase()
  const idx = lab.indexOf(q)
  if (idx < 0) return -1
  // Prefix match gets the biggest boost; run-length (== query length) bonus
  // also favors a single contiguous hit over any fragmented alternative.
  const prefixBonus = idx === 0 ? 100 : 0
  const runBonus = q.length * 2
  // Shorter labels carrying the match rank higher — "Ana" beats "Anastasia".
  const densityBonus = Math.max(0, 40 - lab.length)
  return prefixBonus + runBonus + densityBonus - idx
}

export function searchAllOffices(
  query: string,
  allOffices: SearchableOffice[],
): CrossOfficeResult[] {
  const q = query.trim()
  if (q.length < 2) return []
  const out: { result: CrossOfficeResult; score: number }[] = []
  for (const o of allOffices) {
    const push = (kind: CrossOfficeKind, id: string, label: string, sublabel: string) => {
      const score = scoreMatch(label, q)
      if (score < 0) return
      out.push({
        result: { officeId: o.officeId, officeSlug: o.officeSlug, officeName: o.officeName, kind, id, label, sublabel },
        score,
      })
    }
    push('office', o.officeId, o.officeName, 'Office')
    for (const e of o.employees) push('employee', e.id, e.name, e.department || e.title || 'Employee')
    for (const n of o.neighborhoods) push('neighborhood', n.id, n.name, 'Neighborhood')
    for (const el of o.elements) {
      if (!el.label) continue
      push('element', el.id, el.label, el.type)
    }
  }
  out.sort((a, b) => b.score - a.score || KIND_RANK[a.result.kind] - KIND_RANK[b.result.kind] || a.result.label.localeCompare(b.result.label))
  return out.map((r) => r.result)
}
