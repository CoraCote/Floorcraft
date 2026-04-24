import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChurnHeatmap } from '../components/reports/ChurnHeatmap'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'
import type { SeatHistoryEntry } from '../types/seatHistory'

function addEntry(e: Partial<SeatHistoryEntry> & { timestamp: string; id: string }) {
  useSeatHistoryStore.setState((s) => ({
    entries: {
      ...s.entries,
      [e.id]: {
        id: e.id,
        seatId: e.seatId ?? 's1',
        elementId: e.elementId ?? 's1',
        employeeId: e.employeeId ?? 'e1',
        previousEmployeeId: e.previousEmployeeId ?? null,
        action: e.action ?? 'assign',
        timestamp: e.timestamp,
        actorUserId: e.actorUserId ?? null,
        note: e.note ?? null,
      },
    },
  }))
}

beforeEach(() => {
  useSeatHistoryStore.getState().clear()
})

describe('ChurnHeatmap', () => {
  it('renders exactly 91 tiles (13 weeks * 7 days) when any events exist', () => {
    const today = new Date(2025, 5, 30, 12, 0, 0)
    addEntry({ id: 'a', timestamp: new Date(2025, 5, 30, 9, 0, 0).toISOString() })
    const { container } = render(<ChurnHeatmap today={today} />)
    const tiles = container.querySelectorAll('[data-churn-tile]')
    expect(tiles.length).toBe(91)
  })

  it('shows empty state when no events in the window', () => {
    const today = new Date(2025, 5, 30, 12, 0, 0)
    // One event, but it's well outside the 13-week window.
    addEntry({ id: 'a', timestamp: new Date(2024, 0, 1, 0, 0, 0).toISOString() })
    render(<ChurnHeatmap today={today} />)
    expect(screen.getByText(/no seat changes in the last 13 weeks/i)).toBeInTheDocument()
  })

  it('renders tiles with hover title when events exist in window', () => {
    const today = new Date(2025, 5, 30, 12, 0, 0)
    addEntry({ id: 'a', timestamp: new Date(2025, 5, 30, 9, 0, 0).toISOString() })
    addEntry({ id: 'b', timestamp: new Date(2025, 5, 30, 10, 0, 0).toISOString() })
    addEntry({ id: 'c', timestamp: new Date(2025, 5, 30, 11, 0, 0).toISOString() })
    const { container } = render(<ChurnHeatmap today={today} />)
    // The "today" tile should have a title tooltip announcing the count.
    const tiles = container.querySelectorAll('[data-churn-tile]')
    const todayTile = tiles[tiles.length - 1]
    const titleEl = todayTile.querySelector('title')
    expect(titleEl?.textContent).toMatch(/3 events/i)
    expect(titleEl?.textContent).toMatch(/Jun 30/)
    // Empty state should NOT be shown.
    expect(screen.queryByText(/no seat changes/i)).not.toBeInTheDocument()
  })

  it('singular "1 event" in tooltip', () => {
    const today = new Date(2025, 5, 30, 12, 0, 0)
    addEntry({ id: 'a', timestamp: new Date(2025, 5, 30, 9, 0, 0).toISOString() })
    const { container } = render(<ChurnHeatmap today={today} />)
    const tiles = container.querySelectorAll('[data-churn-tile]')
    const todayTile = tiles[tiles.length - 1]
    expect(todayTile.querySelector('title')?.textContent).toMatch(/\b1 event\b/)
  })
})
