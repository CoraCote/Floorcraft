import { nanoid } from 'nanoid'
import type {
  CanvasElement,
  CommonAreaElement,
  ConferenceRoomElement,
  DeskElement,
  PhoneBoothElement,
  WallElement,
} from '../../types/elements'

/**
 * Coworking Hub template — modern shared workspace with hot desks
 * (no permanent owner), several phone booths for focus calls, two
 * conference rooms, and a generous lounge. Sized for the same
 * 1200×800 canvas the other office templates use.
 *
 * Layout intent:
 *   - 6 clusters of 4 hot desks (24 total) — clearly drop-in seating
 *   - 4 phone booths along the north wall (high churn area)
 *   - 2 conference rooms on the south for booked meetings
 *   - Central lounge / coffee bar between desks and meeting rooms
 *
 * The hot-desks here use type='hot-desk' (not 'desk') so the
 * dashboard's stats correctly count them as bookable rather than
 * assigned. Helper makeHotDesk mirrors makeDesk but emits the
 * right element type.
 */

function makeHotDesk(x: number, y: number, index: number, zIndex: number): DeskElement {
  return {
    id: nanoid(),
    type: 'hot-desk',
    x,
    y,
    width: 64,
    height: 44,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex,
    label: 'Hot Desk',
    visible: true,
    // Coworking hot desks read as cooler / less personal than the
    // amber permanent-desk fill; cyan keeps the visual story.
    style: { fill: '#CFFAFE', stroke: '#0E7490', strokeWidth: 2, opacity: 1 },
    deskId: String(index),
    assignedEmployeeId: null,
    capacity: 1,
  }
}

function makeWall(
  x: number,
  y: number,
  width: number,
  height: number,
  points: number[],
  zIndex: number,
  label: string,
): WallElement {
  return {
    id: nanoid(),
    type: 'wall',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex,
    label,
    visible: true,
    style: { fill: '#9CA3AF', stroke: '#4B5563', strokeWidth: 2, opacity: 1 },
    points,
    thickness: 8,
    wallType: 'solid',
  }
}

function makePhoneBooth(x: number, y: number, label: string): PhoneBoothElement {
  return {
    id: nanoid(),
    type: 'phone-booth',
    x,
    y,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label,
    visible: true,
    style: { fill: '#F3E8FF', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  }
}

export function createCoworkingHubTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []
  let deskIndex = 1

  // --- Perimeter walls (1200×800, same as the office templates) ---
  elements.push(makeWall(0, 0, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Top'))
  elements.push(makeWall(0, 792, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Bottom'))
  elements.push(makeWall(0, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Left'))
  elements.push(makeWall(1192, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Right'))

  // --- 4 phone booths along the north wall (high focus-call area) ---
  const boothSpacing = 220
  for (let i = 0; i < 4; i++) {
    elements.push(makePhoneBooth(120 + i * boothSpacing, 30, `Booth ${i + 1}`))
  }

  // --- 6 clusters of 4 hot desks — center band of the room ---
  const clusterSlots: Array<[number, number]> = [
    [80, 180],
    [320, 180],
    [560, 180],
    [800, 180],
    [80, 340],
    [320, 340],
  ]
  for (const [cx, cy] of clusterSlots) {
    elements.push(makeHotDesk(cx, cy, deskIndex++, 2))
    elements.push(makeHotDesk(cx + 72, cy, deskIndex++, 2))
    elements.push(makeHotDesk(cx, cy + 52, deskIndex++, 2))
    elements.push(makeHotDesk(cx + 72, cy + 52, deskIndex++, 2))
  }

  // --- Lounge / coffee bar in the middle-east section ---
  const lounge: CommonAreaElement = {
    id: nanoid(),
    type: 'common-area',
    x: 560,
    y: 340,
    width: 540,
    height: 160,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Lounge & Coffee Bar',
    visible: true,
    style: { fill: '#DCFCE7', stroke: '#16A34A', strokeWidth: 2, opacity: 1 },
    areaName: 'Lounge & Coffee Bar',
  }
  elements.push(lounge)

  // --- 2 conference rooms on the south wall ---
  const confLeft: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 80,
    y: 580,
    width: 240,
    height: 160,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Meeting Room A',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Meeting Room A',
    capacity: 8,
  }
  const confRight: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 880,
    y: 580,
    width: 240,
    height: 160,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Meeting Room B',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Meeting Room B',
    capacity: 8,
  }
  elements.push(confLeft, confRight)

  return elements
}
