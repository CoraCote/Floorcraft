import { describe, it, expect } from 'vitest'
import { computeSeatPositions } from '../lib/seatLayout'

describe('computeSeatPositions — round tables', () => {
  it('returns exactly the requested number of seats for table-round', () => {
    const seats = computeSeatPositions('table-round', 6, 'around', 100, 100)
    expect(seats).toHaveLength(6)
  })

  it('distributes round-table seats evenly around the perimeter', () => {
    const seats = computeSeatPositions('table-round', 4, 'around', 100, 100)
    // 4 seats at cardinal points: each should be ~50 units from center
    for (const s of seats) {
      const dist = Math.sqrt(s.offsetX ** 2 + s.offsetY ** 2)
      expect(dist).toBeGreaterThan(45)
      expect(dist).toBeLessThan(60)
    }
  })

  it('points round-table seat rotations toward table center', () => {
    const seats = computeSeatPositions('table-round', 4, 'around', 100, 100)
    // A seat at the top of the table (offsetY negative) should face downward (rotation 180)
    const top = seats.reduce((a, b) => (a.offsetY < b.offsetY ? a : b))
    // Rotation tolerance 10deg for float math
    expect(Math.abs(((top.rotation % 360) + 360) % 360 - 180)).toBeLessThan(10)
  })
})

describe('computeSeatPositions — oval tables', () => {
  it('returns exactly the requested number of seats for table-oval', () => {
    const seats = computeSeatPositions('table-oval', 8, 'around', 140, 90)
    expect(seats).toHaveLength(8)
  })

  it('oval seats respect the ellipse axes (x range wider than y)', () => {
    const seats = computeSeatPositions('table-oval', 8, 'around', 140, 90)
    const maxX = Math.max(...seats.map((s) => Math.abs(s.offsetX)))
    const maxY = Math.max(...seats.map((s) => Math.abs(s.offsetY)))
    expect(maxX).toBeGreaterThan(maxY)
  })
})
