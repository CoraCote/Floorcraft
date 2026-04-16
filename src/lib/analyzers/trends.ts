import type { AnalyzerInput, Insight } from '../../types/insights'

// Trends analysis requires historical state snapshots.
// This is a placeholder that returns no insights until the history
// persistence layer is built (deferred to v2).
export function analyzeTrends(_input: AnalyzerInput): Insight[] {
  return []
}
