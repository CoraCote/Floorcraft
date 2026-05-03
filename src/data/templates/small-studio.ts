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
 * Small Studio template — a 5-15 person startup space. The other
 * templates assume 30+ desks and a 1200×800 footprint; lots of new
 * teams have a single room that's a fraction of that. This one
 * fits a tighter 800×600 canvas, with one cluster of desks and the
 * minimum supporting rooms.
 *
 * Layout intent:
 *   - One 8-desk open cluster (2×4) along the west wall
 *   - A small conference room (capacity 6) on the east wall
 *   - One phone booth in the corner for 1:1s
 *   - A modest kitchen / lounge area at the south
 *
 * Sized so the whole thing reads as a single shared room rather
 * than separate departments — the visual story matches the team
 * size at this scale.
 */

function makeDesk(x: number, y: number, index: number, zIndex: number): DeskElement {
  return {
    id: nanoid(),
    type: 'desk',
    x,
    y,
    width: 72,
    height: 48,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex,
    label: 'Desk',
    visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 2, opacity: 1 },
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

export function createSmallStudioTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []
  let deskIndex = 1

  // --- Perimeter walls — 800×600 footprint (smaller than the
  // 1200×800 used by the other templates so the studio feels
  // appropriately compact).
  elements.push(makeWall(0, 0, 800, 8, [0, 0, 800, 0], 0, 'Wall Top'))
  elements.push(makeWall(0, 592, 800, 8, [0, 0, 800, 0], 0, 'Wall Bottom'))
  elements.push(makeWall(0, 0, 8, 600, [0, 0, 0, 600], 0, 'Wall Left'))
  elements.push(makeWall(792, 0, 8, 600, [0, 0, 0, 600], 0, 'Wall Right'))

  // --- One 2x4 desk cluster (8 desks) on the west side ---
  const clusterX = 80
  const clusterY = 80
  for (let row = 0; row < 4; row++) {
    elements.push(makeDesk(clusterX, clusterY + row * 56, deskIndex++, 2))
    elements.push(makeDesk(clusterX + 80, clusterY + row * 56, deskIndex++, 2))
  }

  // --- Conference room on the east wall, capacity 6 ---
  const conf: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 540,
    y: 80,
    width: 200,
    height: 140,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Conference Room',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Conference Room',
    capacity: 6,
  }
  elements.push(conf)

  // --- Single phone booth, NE corner ---
  const booth: PhoneBoothElement = {
    id: nanoid(),
    type: 'phone-booth',
    x: 720,
    y: 260,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Phone Booth',
    visible: true,
    style: { fill: '#F3E8FF', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  }
  elements.push(booth)

  // --- Kitchen / lounge along the south ---
  const lounge: CommonAreaElement = {
    id: nanoid(),
    type: 'common-area',
    x: 80,
    y: 420,
    width: 660,
    height: 140,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Kitchen & Lounge',
    visible: true,
    style: { fill: '#DCFCE7', stroke: '#16A34A', strokeWidth: 2, opacity: 1 },
    areaName: 'Kitchen & Lounge',
  }
  elements.push(lounge)

  return elements
}
