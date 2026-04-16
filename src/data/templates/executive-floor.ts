import { nanoid } from 'nanoid'
import type {
  CanvasElement,
  DeskElement,
  PrivateOfficeElement,
  ConferenceRoomElement,
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
    connectedWallIds: [],
  }
}

export function createExecutiveFloorTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  // --- Perimeter walls (zIndex: 0) ---
  elements.push(makeWall(0, 0, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Top'))
  elements.push(makeWall(0, 792, 1200, 8, [0, 0, 1200, 0], 0, 'Wall Bottom'))
  elements.push(makeWall(0, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Left'))
  elements.push(makeWall(1192, 0, 8, 800, [0, 0, 0, 800], 0, 'Wall Right'))

  // --- 12 private offices (zIndex: 3) ---
  // 6 along top edge
  const topOfficeXPositions = [50, 210, 370, 530, 690, 850]
  for (let i = 0; i < 6; i++) {
    const office: PrivateOfficeElement = {
      id: nanoid(),
      type: 'private-office',
      x: topOfficeXPositions[i],
      y: 50,
      width: 140,
      height: 120,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 3,
      label: `Executive Office ${i + 1}`,
      visible: true,
      style: { fill: '#FEF9C3', stroke: '#CA8A04', strokeWidth: 2, opacity: 1 },
      deskId: `EO-${String(i + 1).padStart(3, '0')}`,
      capacity: 1,
      assignedEmployeeIds: [],
    }
    elements.push(office)
  }

  // 6 along left and right edges (3 per side)
  const sideOfficeYPositions = [220, 370, 520]
  for (let i = 0; i < 3; i++) {
    // Left side
    const leftOffice: PrivateOfficeElement = {
      id: nanoid(),
      type: 'private-office',
      x: 50,
      y: sideOfficeYPositions[i],
      width: 140,
      height: 120,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 3,
      label: `Executive Office ${7 + i}`,
      visible: true,
      style: { fill: '#FEF9C3', stroke: '#CA8A04', strokeWidth: 2, opacity: 1 },
      deskId: `EO-${String(7 + i).padStart(3, '0')}`,
      capacity: 1,
      assignedEmployeeIds: [],
    }
    elements.push(leftOffice)

    // Right side
    const rightOffice: PrivateOfficeElement = {
      id: nanoid(),
      type: 'private-office',
      x: 1010,
      y: sideOfficeYPositions[i],
      width: 140,
      height: 120,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 3,
      label: `Executive Office ${10 + i}`,
      visible: true,
      style: { fill: '#FEF9C3', stroke: '#CA8A04', strokeWidth: 2, opacity: 1 },
      deskId: `EO-${String(10 + i).padStart(3, '0')}`,
      capacity: 1,
      assignedEmployeeIds: [],
    }
    elements.push(rightOffice)
  }

  // --- Boardroom (zIndex: 3) ---
  const boardroom: ConferenceRoomElement = {
    id: nanoid(),
    type: 'conference-room',
    x: 450,
    y: 550,
    width: 300,
    height: 200,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Boardroom',
    visible: true,
    style: { fill: '#DBEAFE', stroke: '#2563EB', strokeWidth: 2, opacity: 1 },
    roomName: 'Boardroom',
    capacity: 16,
  }
  elements.push(boardroom)

  // --- Executive lounge (zIndex: 1) ---
  const lounge: CommonAreaElement = {
    id: nanoid(),
    type: 'common-area',
    x: 800,
    y: 600,
    width: 200,
    height: 150,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Executive Lounge',
    visible: true,
    style: { fill: '#D1FAE5', stroke: '#059669', strokeWidth: 2, opacity: 1 },
    areaName: 'Executive Lounge',
  }
  elements.push(lounge)

  // --- Admin desk cluster of 8 (zIndex: 2) ---
  // 2x4 grid in center area
  let deskIndex = 1
  const adminClusterX = 400
  const adminClusterY = 250

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      elements.push(
        makeDesk(
          adminClusterX + col * 80,
          adminClusterY + row * 56,
          deskIndex++,
          2,
        ),
      )
    }
  }

  return elements
}
