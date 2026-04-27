import { nanoid } from 'nanoid'
import type {
  CanvasElement,
  DeskElement,
  ConferenceRoomElement,
  PhoneBoothElement,
  CommonAreaElement,
  WallElement,
} from '../../types/elements'

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
    // Sequential "1", "2", "3"… — matches the per-floor scheme that
    // `nextSeatNumber` hands out for manually-added seats. Rendered in
    // the roster as "Floor 1 / 3".
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

export function createOpenPlanOfficeTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []
  let deskIndex = 1

  // --- Perimeter walls (zIndex: 0) ---
  // Top wall
  elements.push(makeWall(0, 0, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Top'))
  // Bottom wall
  elements.push(makeWall(0, 792, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Bottom'))
  // Left wall
  elements.push(makeWall(0, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Left'))
  // Right wall
  elements.push(makeWall(1192, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Right'))

  // --- Desk clusters (zIndex: 2) ---
  // 7 clusters of 4 desks (2x2)
  const clusters4: Array<[number, number]> = [
    [100, 100],
    [300, 100],
    [500, 100],
    [700, 100],
    [100, 300],
    [300, 300],
    [500, 300],
  ]

  for (const [cx, cy] of clusters4) {
    elements.push(makeDesk(cx, cy, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy, deskIndex++, 2))
    elements.push(makeDesk(cx, cy + 56, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy + 56, deskIndex++, 2))
  }

  // 2 clusters of 6 desks (2x3)
  const clusters6: Array<[number, number]> = [
    [700, 300],
    [900, 100],
  ]

  for (const [cx, cy] of clusters6) {
    elements.push(makeDesk(cx, cy, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy, deskIndex++, 2))
    elements.push(makeDesk(cx, cy + 56, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy + 56, deskIndex++, 2))
    elements.push(makeDesk(cx, cy + 112, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy + 112, deskIndex++, 2))
  }

  // --- Conference rooms (zIndex: 3) ---
  const confRoom1: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 50,
    y: 600,
    width: 200,
    height: 140,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Conference Room A',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Conference Room A',
    capacity: 10,
  }

  const confRoom2: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 800,
    y: 600,
    width: 200,
    height: 140,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Conference Room B',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Conference Room B',
    capacity: 10,
  }

  elements.push(confRoom1, confRoom2)

  // --- Phone booths (zIndex: 3) ---
  const phoneBooth1: PhoneBoothElement = {
    id: nanoid(),
    type: 'phone-booth',
    x: 50,
    y: 50,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Phone Booth 1',
    visible: true,
    style: { fill: '#F3E8FF', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  }

  const phoneBooth2: PhoneBoothElement = {
    id: nanoid(),
    type: 'phone-booth',
    x: 1100,
    y: 50,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Phone Booth 2',
    visible: true,
    style: { fill: '#F3E8FF', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  }

  elements.push(phoneBooth1, phoneBooth2)

  // --- Common area / kitchen (zIndex: 1) ---
  const kitchen: CommonAreaElement = {
    id: nanoid(),
    type: 'common-area',
    x: 500,
    y: 700,
    width: 160,
    height: 120,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Kitchen / Lounge',
    visible: true,
    style: { fill: '#D1FAE5', stroke: '#059669', strokeWidth: 2, opacity: 1 },
    areaName: 'Kitchen',
  }

  elements.push(kitchen)

  // --- Dividers and planters for aesthetics (zIndex: 1) ---
  elements.push({
    id: nanoid(),
    type: 'divider',
    x: 450,
    y: 90,
    width: 4,
    height: 200,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Divider',
    visible: true,
    style: { fill: '#D1D5DB', stroke: '#6B7280', strokeWidth: 1, opacity: 1 },
  })

  elements.push({
    id: nanoid(),
    type: 'divider',
    x: 650,
    y: 290,
    width: 4,
    height: 200,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Divider',
    visible: true,
    style: { fill: '#D1D5DB', stroke: '#6B7280', strokeWidth: 1, opacity: 1 },
  })

  elements.push({
    id: nanoid(),
    type: 'planter',
    x: 460,
    y: 500,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Planter',
    visible: true,
    style: { fill: '#BBF7D0', stroke: '#16A34A', strokeWidth: 1, opacity: 1 },
  })

  elements.push({
    id: nanoid(),
    type: 'planter',
    x: 900,
    y: 500,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Planter',
    visible: true,
    style: { fill: '#BBF7D0', stroke: '#16A34A', strokeWidth: 1, opacity: 1 },
  })

  return elements
}
