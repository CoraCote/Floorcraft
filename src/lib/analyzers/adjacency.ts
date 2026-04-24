import type { AnalyzerInput, Insight } from '../../types/insights'
import { isAssignableElement } from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

/**
 * Adjacency conflict analyzer — emits a `category: 'sensitivity'` warning
 * for every pair of employees that
 *
 *   1. share at least one free-text `sensitivityTag`,
 *   2. sit on the SAME floor (`employee.floorId`),
 *   3. are assigned to seats whose element centers are within
 *      `ADJACENCY_PX` of each other.
 *
 * The 200px threshold is a deliberate heuristic: a standard desk is 72px
 * wide in Floocraft's grid units (see `elements.ts`), so 200px covers the
 * "desk + aisle + desk" neighbour case without lighting up the entire
 * neighborhood. Anything farther surfaces via the department-proximity
 * analyzer instead.
 *
 * We do NOT enumerate the tag vocabulary — the user provides the signal
 * (`"audit"`, `"legal"`, `"compensation"`, `"insider-risk"`, `"founder"`,
 * …). Any semantic inference beyond shared-tag overlap lives outside
 * this module; if HR wants the "auditor vs finance dept" check, they
 * tag both sides.
 *
 * A pair with multiple shared tags produces ONE insight (keyed on the
 * employee pair + the sorted-joined tag list) — emitting one per tag
 * would spam the panel with near-duplicates.
 */

const ADJACENCY_PX = 200

interface SeatedEmployee {
  id: string
  name: string
  floorId: string
  cx: number
  cy: number
  seatId: string
  tags: Set<string>
}

function elementCenter(el: CanvasElement): { cx: number; cy: number } {
  return { cx: el.x + el.width / 2, cy: el.y + el.height / 2 }
}

function distance(a: SeatedEmployee, b: SeatedEmployee): number {
  const dx = a.cx - b.cx
  const dy = a.cy - b.cy
  return Math.sqrt(dx * dx + dy * dy)
}

function intersectTags(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = []
  for (const t of a) if (b.has(t)) out.push(t)
  out.sort()
  return out
}

export function analyzeAdjacency(input: AnalyzerInput): Insight[] {
  const elementsById = new Map<string, CanvasElement>()
  for (const el of input.elements) elementsById.set(el.id, el)

  // Reduce the employee set to the "seated with tags" projection exactly
  // once — the O(n²) pair-loop below already keeps the analyzer work
  // bounded, but computing centers / filtering per pair would quadruple
  // the array walks for no gain.
  const seated: SeatedEmployee[] = []
  for (const emp of input.employees) {
    if (!emp.sensitivityTags || emp.sensitivityTags.length === 0) continue
    if (!emp.seatId || !emp.floorId) continue
    const el = elementsById.get(emp.seatId)
    if (!el || !isAssignableElement(el)) continue
    const { cx, cy } = elementCenter(el)
    seated.push({
      id: emp.id,
      name: emp.name,
      floorId: emp.floorId,
      cx,
      cy,
      seatId: emp.seatId,
      tags: new Set(emp.sensitivityTags),
    })
  }

  const insights: Insight[] = []
  for (let i = 0; i < seated.length; i++) {
    for (let j = i + 1; j < seated.length; j++) {
      const a = seated[i]
      const b = seated[j]
      if (a.floorId !== b.floorId) continue
      if (distance(a, b) > ADJACENCY_PX) continue
      const shared = intersectTags(a.tags, b.tags)
      if (shared.length === 0) continue

      // Deterministic id — sort by employee id so (a,b) and (b,a) collapse,
      // and include the shared-tag list so an audit+legal pair and an
      // audit-only pair aren't mistaken for each other by the
      // deduplicator in `runAllAnalyzers`.
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a]
      const tagLabel = shared.length === 1 ? shared[0] : shared.join('/')
      const tagList = shared.join(', ')

      insights.push({
        id: `adjacency-${lo.id}-${hi.id}-${shared.join('+')}`,
        category: 'sensitivity',
        severity: 'warning',
        title:
          shared.length === 1
            ? `Two \`${tagLabel}\` tagged employees (${lo.name}, ${hi.name}) are seated adjacent — consider separating.`
            : `Adjacent employees share sensitivity tags ${tagList} (${lo.name}, ${hi.name}) — consider separating.`,
        narrative:
          `${lo.name} and ${hi.name} both carry the sensitivity tag` +
          `${shared.length === 1 ? '' : 's'} ${tagList} and are seated within ` +
          `${ADJACENCY_PX}px of each other on the same floor. Review whether ` +
          `their proximity is appropriate or reseat one of them.`,
        relatedElementIds: [lo.seatId, hi.seatId],
        relatedEmployeeIds: [lo.id, hi.id],
        actions: [
          {
            label: 'Highlight pair',
            type: 'highlight',
            payload: { employeeIds: [lo.id, hi.id] },
          },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  return insights
}
