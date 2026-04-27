import { nanoid } from 'nanoid'
import type {
  CanvasElement,
  DeskElement,
  PrivateOfficeElement,
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
    deskId: `D-${String(index).padStart(3, '0')}`,
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

export function createMixedOfficeTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []
  let deskIndex = 1

  // --- Perimeter walls (zIndex: 0) ---
  elements.push(makeWall(0, 0, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Top'))
  elements.push(makeWall(0, 792, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Bottom'))
  elements.push(makeWall(0, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Left'))
  elements.push(makeWall(1192, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Right'))

  // --- 6 Private offices along top edge (zIndex: 3) ---
  const officeXPositions = [50, 200, 350, 500, 650, 800]

  for (let i = 0; i < 6; i++) {
    const office: PrivateOfficeElement = {
      id: nanoid(),
      type: 'private-office',
      x: officeXPositions[i],
      y: 50,
      width: 120,
      height: 100,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 3,
      label: `Office ${i + 1}`,
      visible: true,
      style: { fill: '#FEF9C3', stroke: '#CA8A04', strokeWidth: 2, opacity: 1 },
      deskId: `PO-${String(i + 1).padStart(3, '0')}`,
      capacity: 1,
      assignedEmployeeIds: [],
    }
    elements.push(office)
  }

  // --- Open desks in center area (zIndex: 2) ---
  // 5 clusters of 4 desks (2x2)
  const clusters4: Array<[number, number]> = [
    [100, 250],
    [300, 250],
    [500, 250],
    [700, 250],
    [900, 250],
  ]

  for (const [cx, cy] of clusters4) {
    elements.push(makeDesk(cx, cy, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy, deskIndex++, 2))
    elements.push(makeDesk(cx, cy + 56, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy + 56, deskIndex++, 2))
  }

  // 2 clusters of 4 desks lower down
  const clusters4Lower: Array<[number, number]> = [
    [100, 420],
    [300, 420],
  ]

  for (const [cx, cy] of clusters4Lower) {
    elements.push(makeDesk(cx, cy, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy, deskIndex++, 2))
    elements.push(makeDesk(cx, cy + 56, deskIndex++, 2))
    elements.push(makeDesk(cx + 80, cy + 56, deskIndex++, 2))
  }

  // 1 cluster of 2 desks to reach ~30
  elements.push(makeDesk(500, 420, deskIndex++, 2))
  elements.push(makeDesk(580, 420, deskIndex++, 2))

  // --- Conference rooms at bottom (zIndex: 3) ---
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
    x: 350,
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
    x: 1000,
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

  // --- Reception / Lobby common area (zIndex: 1) ---
  const reception: CommonAreaElement = {
    id: nanoid(),
    type: 'common-area',
    x: 700,
    y: 600,
    width: 200,
    height: 140,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Reception / Lobby',
    visible: true,
    style: { fill: '#D1FAE5', stroke: '#059669', strokeWidth: 2, opacity: 1 },
    areaName: 'Reception',
  }

  elements.push(reception)

  return elements
}
