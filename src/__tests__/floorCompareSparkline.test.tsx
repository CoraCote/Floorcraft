import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FloorCompareSparkline } from '../components/editor/reports/FloorCompareSparkline'

describe('FloorCompareSparkline', () => {
  it('renders an em-dash placeholder for an empty series', () => {
    const { container } = render(<FloorCompareSparkline series={[]} />)
    const empty = container.querySelector('[data-sparkline-empty]')
    expect(empty).not.toBeNull()
    expect(empty?.textContent).toBe('—')
    // No polyline should be drawn in the empty state.
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('renders a single centered dot for a one-point series', () => {
    const { container } = render(
      <FloorCompareSparkline series={[{ date: '2026-04-24', value: 3 }]} width={60} height={20} />,
    )
    const svg = container.querySelector('[data-sparkline-single]')
    expect(svg).not.toBeNull()
    const circle = svg!.querySelector('circle')
    expect(circle).not.toBeNull()
    // Dot is in the middle of the viewBox.
    expect(circle!.getAttribute('cx')).toBe('30')
    expect(circle!.getAttribute('cy')).toBe('10')
  })

  it('renders a polyline with exactly N points for an N-point series', () => {
    const series = [
      { date: '2026-04-22', value: 0 },
      { date: '2026-04-23', value: 3 },
      { date: '2026-04-24', value: 1 },
    ]
    const { container } = render(<FloorCompareSparkline series={series} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    // `points` attr is whitespace-separated "x,y" pairs — one per data point.
    const pointPairs = polyline!.getAttribute('points')!.trim().split(/\s+/)
    expect(pointPairs).toHaveLength(series.length)
    // N data points → the resulting path has N-1 connecting segments, which
    // is exactly what a polyline with N vertices renders.
    expect(pointPairs.length - 1).toBe(series.length - 1)
  })

  it('draws a flat baseline for an all-zero series (does not crash on zero range)', () => {
    const series = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(11 + i).padStart(2, '0')}`,
      value: 0,
    }))
    const { container } = render(<FloorCompareSparkline series={series} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    const ys = polyline!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[1]))
    // Every Y coord should be identical (flat line).
    const uniqueYs = new Set(ys)
    expect(uniqueYs.size).toBe(1)
  })
})
