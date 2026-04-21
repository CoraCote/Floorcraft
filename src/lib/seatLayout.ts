import type { SeatPosition, TableType } from '../types/elements'
import { nanoid } from 'nanoid'

function computeRoundSeats(seatCount: number, width: number, height: number): SeatPosition[] {
  // Inscribed circle: use min dimension / 2 plus a small offset for chair placement
  const r = Math.min(width, height) / 2 + 8
  const positions: SeatPosition[] = []
  for (let i = 0; i < seatCount; i++) {
    const angle = (i / seatCount) * Math.PI * 2 - Math.PI / 2
    const offsetX = Math.cos(angle) * r
    const offsetY = Math.sin(angle) * r
    // Rotation points from seat toward center (0 = up, increases clockwise in Konva)
    const rotation = ((angle * 180) / Math.PI + 90 + 180) % 360
    positions.push({
      id: `seat-${i}`,
      offsetX,
      offsetY,
      rotation,
      assignedGuestId: null,
    })
  }
  return positions
}

function computeOvalSeats(seatCount: number, width: number, height: number): SeatPosition[] {
  const rx = width / 2 + 10
  const ry = height / 2 + 10
  const positions: SeatPosition[] = []
  for (let i = 0; i < seatCount; i++) {
    const angle = (i / seatCount) * Math.PI * 2 - Math.PI / 2
    const offsetX = Math.cos(angle) * rx
    const offsetY = Math.sin(angle) * ry
    const rotation = ((angle * 180) / Math.PI + 90 + 180) % 360
    positions.push({
      id: `seat-${i}`,
      offsetX,
      offsetY,
      rotation,
      assignedGuestId: null,
    })
  }
  return positions
}

export function computeSeatPositions(
  tableType: TableType,
  seatCount: number,
  seatLayout: 'around' | 'one-side' | 'both-sides' | 'u-shape',
  tableWidth: number,
  tableHeight: number
): SeatPosition[] {
  if (tableType === 'table-round') return computeRoundSeats(seatCount, tableWidth, tableHeight)
  if (tableType === 'table-oval')  return computeOvalSeats(seatCount, tableWidth, tableHeight)

  switch (tableType) {
    case 'table-rect':
      return computeRectSeats(seatCount, seatLayout, tableWidth, tableHeight)
    case 'table-conference':
      return computeConferenceSeats(seatCount, tableWidth, tableHeight)
  }
}

function computeRectSeats(
  seatCount: number,
  layout: 'around' | 'one-side' | 'both-sides' | 'u-shape',
  width: number,
  height: number
): SeatPosition[] {
  const seats: SeatPosition[] = []
  const seatSpacing = 30
  const offset = 18 // distance from table edge

  if (layout === 'one-side') {
    const startX = -(seatCount - 1) * seatSpacing / 2
    for (let i = 0; i < seatCount; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX + i * seatSpacing,
        offsetY: height / 2 + offset,
        rotation: 0,
        assignedGuestId: null,
      })
    }
  } else if (layout === 'both-sides') {
    const perSide = Math.ceil(seatCount / 2)
    const startX = -(perSide - 1) * seatSpacing / 2
    for (let i = 0; i < perSide; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX + i * seatSpacing,
        offsetY: -(height / 2 + offset),
        rotation: 180,
        assignedGuestId: null,
      })
    }
    const bottomCount = seatCount - perSide
    const startX2 = -(bottomCount - 1) * seatSpacing / 2
    for (let i = 0; i < bottomCount; i++) {
      seats.push({
        id: nanoid(8),
        offsetX: startX2 + i * seatSpacing,
        offsetY: height / 2 + offset,
        rotation: 0,
        assignedGuestId: null,
      })
    }
  } else {
    // 'around' — distribute around all edges
    const perLongSide = Math.floor(seatCount * (width / (2 * width + 2 * height)))
    const perShortSide = Math.floor((seatCount - 2 * perLongSide) / 2)
    const remaining = seatCount - 2 * perLongSide - 2 * perShortSide
    let idx = 0

    // Top side
    const topCount = perLongSide + (remaining > 0 ? 1 : 0)
    const topStart = -(topCount - 1) * seatSpacing / 2
    for (let i = 0; i < topCount; i++) {
      seats.push({ id: nanoid(8), offsetX: topStart + i * seatSpacing, offsetY: -(height / 2 + offset), rotation: 180, assignedGuestId: null })
      idx++
    }
    // Right side
    const rightCount = perShortSide
    const rightStart = -(rightCount - 1) * seatSpacing / 2
    for (let i = 0; i < rightCount; i++) {
      seats.push({ id: nanoid(8), offsetX: width / 2 + offset, offsetY: rightStart + i * seatSpacing, rotation: 270, assignedGuestId: null })
      idx++
    }
    // Bottom side
    const bottomCount = perLongSide
    const bottomStart = (bottomCount - 1) * seatSpacing / 2
    for (let i = 0; i < bottomCount; i++) {
      seats.push({ id: nanoid(8), offsetX: bottomStart - i * seatSpacing, offsetY: height / 2 + offset, rotation: 0, assignedGuestId: null })
      idx++
    }
    // Left side
    const leftCount = seatCount - idx
    const leftStart = (leftCount - 1) * seatSpacing / 2
    for (let i = 0; i < leftCount; i++) {
      seats.push({ id: nanoid(8), offsetX: -(width / 2 + offset), offsetY: leftStart - i * seatSpacing, rotation: 90, assignedGuestId: null })
    }
  }

  return seats
}

function computeConferenceSeats(seatCount: number, width: number, height: number): SeatPosition[] {
  // Conference = seats around all 4 sides
  return computeRectSeats(seatCount, 'around', width, height)
}
