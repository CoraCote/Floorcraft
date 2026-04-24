import type { AnalyzerInput, Insight } from '../../types/insights'
import type {
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../../types/elements'
import {
  isAssignableElement,
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { Neighborhood } from '../../types/neighborhood'
import { elementInNeighborhood } from '../neighborhoodContainment'

/**
 * Analyzer: department cross-check on neighborhoods.
 *
 * If a neighborhood has a `department` set and seats inside it are
 * assigned to people whose department doesn't match, emit a single
 * "N seats in <NAME> assigned to <OTHER>" insight per offending
 * department. That's the minimum useful signal without restructuring
 * the existing `runAllAnalyzers` pipeline (which doesn't currently
 * take neighborhoods as an argument — see the `neighborhoods` param
 * below for how we thread them in).
 *
 * We keep this analyzer standalone (not part of the default
 * `runAllAnalyzers` output) because it needs the neighborhood list in
 * addition to the standard analyzer input. Callers (the insights
 * panel) invoke it alongside `runAllAnalyzers` and merge the
 * resulting arrays.
 */
export function analyzeNeighborhoodDepartments(
  input: AnalyzerInput,
  neighborhoods: Neighborhood[],
  employeeById: Map<string, { department: string | null }>,
): Insight[] {
  const insights: Insight[] = []

  for (const n of neighborhoods) {
    const nbDept = n.department?.trim() || null
    if (!nbDept) continue

    // Collect assigned employee ids whose seat overlaps the neighborhood.
    // A workstation / private-office can hold multiple employees; a desk
    // at most one. We route through `isAssignableElement` so we don't
    // iterate tables / walls / annotations.
    const mismatchByDept = new Map<string, string[]>()
    for (const el of input.elements) {
      if (!isAssignableElement(el)) continue
      if (!elementInNeighborhood(el, n)) continue
      const assignedIds = getAssignedIds(el)
      for (const empId of assignedIds) {
        const emp = employeeById.get(empId)
        const empDept = emp?.department?.trim() || null
        if (!empDept) continue
        if (empDept === nbDept) continue
        if (!mismatchByDept.has(empDept)) mismatchByDept.set(empDept, [])
        mismatchByDept.get(empDept)!.push(empId)
      }
    }

    for (const [otherDept, empIds] of mismatchByDept) {
      const count = empIds.length
      insights.push({
        id: `neighborhood-dept-mismatch-${n.id}-${otherDept}`,
        category: 'proximity',
        severity: 'warning',
        title: `${count} ${count === 1 ? 'seat' : 'seats'} in ${n.name} assigned to ${otherDept}`,
        narrative: `${n.name} is marked as ${nbDept} but ${count} ${
          count === 1 ? 'person is' : 'people are'
        } assigned here from ${otherDept}.`,
        relatedElementIds: [],
        relatedEmployeeIds: empIds,
        actions: [
          {
            label: 'Highlight people',
            type: 'highlight',
            payload: { employeeIds: empIds },
          },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  return insights
}

function getAssignedIds(
  el: DeskElement | WorkstationElement | PrivateOfficeElement,
): string[] {
  if (isDeskElement(el)) {
    return el.assignedEmployeeId ? [el.assignedEmployeeId] : []
  }
  if (isWorkstationElement(el)) return el.assignedEmployeeIds
  if (isPrivateOfficeElement(el)) return el.assignedEmployeeIds
  return []
}
