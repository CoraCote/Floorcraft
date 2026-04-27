import { Group, Rect, Text } from 'react-konva'
import type { ConferenceRoomElement, PhoneBoothElement, CommonAreaElement } from '../../../types/elements'
import { isConferenceRoomElement, isCommonAreaElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { RoomBookingBadge } from './RoomBookingBadge'

type RoomElement = ConferenceRoomElement | PhoneBoothElement | CommonAreaElement

interface RoomRendererProps {
  element: RoomElement
}

export function RoomRenderer({ element }: RoomRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  if (isConferenceRoomElement(element)) {
    return <ConferenceRoomRenderer element={element} isSelected={isSelected} />
  }

  if (isCommonAreaElement(element)) {
    return <CommonAreaRenderer element={element} isSelected={isSelected} />
  }

  return <PhoneBoothRenderer element={element as PhoneBoothElement} isSelected={isSelected} />
}

// --- Conference Room ---

interface ConferenceRoomRendererProps {
  element: ConferenceRoomElement
  isSelected: boolean
}

function ConferenceRoomRenderer({ element, isSelected }: ConferenceRoomRendererProps) {
  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill="#FEF3C7"
        stroke={isSelected ? '#3B82F6' : '#F59E0B'}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={6}
        opacity={element.style.opacity}
      />

      {/* Room name */}
      <Text
        text={element.roomName}
        x={-element.width / 2 + 4}
        y={-8}
        width={element.width - 8}
        align="center"
        fontSize={13}
        fontStyle="bold"
        fill="#92400E"
        listening={false}
      />

      {/* Capacity */}
      <Text
        text={`${element.capacity} seats`}
        x={-element.width / 2 + 4}
        y={8}
        width={element.width - 8}
        align="center"
        fontSize={10}
        fill="#B45309"
        listening={false}
      />

      <RoomBookingBadge elementId={element.id} width={element.width} height={element.height} />
    </Group>
  )
}

// --- Phone Booth ---

interface PhoneBoothRendererProps {
  element: PhoneBoothElement
  isSelected: boolean
}

function PhoneBoothRenderer({ element, isSelected }: PhoneBoothRendererProps) {
  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill="#F0FDF4"
        stroke={isSelected ? '#3B82F6' : '#16A34A'}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={4}
        opacity={element.style.opacity}
      />

      {/* Phone-icon glyph as the always-visible identity cue. The
       * booth's label (e.g. "Booth 1", "Quiet pod", or whatever the
       * user named it) renders below — falling back to a short
       * "Booth" if the label is empty so the chrome reads cleanly on
       * a default-named booth. The previous renderer hardcoded
       * "Phone Booth" and ignored `element.label` entirely, which
       * meant any user-customised name was silently dropped on the
       * canvas (it still shows in the Properties panel and roster). */}
      <Text
        text={'☎'}
        x={-element.width / 2}
        y={-element.height / 2 + 8}
        width={element.width}
        align="center"
        fontSize={16}
        fill="#16A34A"
        listening={false}
      />
      <Text
        text={element.label?.trim() || 'Booth'}
        x={-element.width / 2 + 2}
        y={element.height / 2 - 16}
        width={element.width - 4}
        align="center"
        fontSize={9}
        fontStyle="bold"
        fill="#166534"
        listening={false}
      />

      <RoomBookingBadge elementId={element.id} width={element.width} height={element.height} />
    </Group>
  )
}

// --- Common Area ---

interface CommonAreaRendererProps {
  element: CommonAreaElement
  isSelected: boolean
}

function CommonAreaRenderer({ element, isSelected }: CommonAreaRendererProps) {
  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill="#DCFCE7"
        stroke={isSelected ? '#3B82F6' : '#16A34A'}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={6}
        opacity={element.style.opacity}
      />

      <Text
        text={element.areaName}
        x={-element.width / 2 + 4}
        y={-5}
        width={element.width - 8}
        align="center"
        fontSize={13}
        fontStyle="bold"
        fill="#166534"
        listening={false}
      />

      <RoomBookingBadge elementId={element.id} width={element.width} height={element.height} />
    </Group>
  )
}
