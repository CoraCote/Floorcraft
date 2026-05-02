/**
 * Helper used by both SignupsTrendCard and TeamActivityCard. Lives
 * in its own file because the React Fast Refresh rule requires
 * component files (Sparkline.tsx) to export only components.
 */

export interface SparklinePoint {
  day: string // YYYY-MM-DD
  count: number
}

export function summarizeSeries(points: SparklinePoint[]): {
  total: number
  max: number
  delta: number
} | null {
  if (!points || points.length === 0) return null
  const total = points.reduce((acc, p) => acc + p.count, 0)
  const max = Math.max(...points.map((p) => p.count), 1)
  const half = Math.floor(points.length / 2)
  const recent = points.slice(half).reduce((a, p) => a + p.count, 0)
  const earlier = points.slice(0, half).reduce((a, p) => a + p.count, 0)
  const delta = recent - earlier
  return { total, max, delta }
}
