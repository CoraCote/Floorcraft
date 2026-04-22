import { Group, Text } from 'react-konva'
import type Konva from 'konva'
import type { FreeTextElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: FreeTextElement
}

/**
 * Konva-rendered text. Editing happens via an HTML <textarea> portal
 * (see FreeTextEditorOverlay) so the user gets native caret + IME
 * support — Konva doesn't expose these cheaply. We hide the konva text
 * while the overlay is active so the two don't stack visually.
 */
export function FreeTextRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const editingLabelId = useUIStore((s) => s.editingLabelId)
  const setEditingLabelId = useUIStore((s) => s.setEditingLabelId)
  const isSelected = selectedIds.includes(element.id)
  const isEditing = editingLabelId === element.id

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    setEditingLabelId(element.id)
  }

  return (
    <Group
      rotation={element.rotation}
      listening={!element.locked}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
    >
      <Text
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        text={element.text}
        fontSize={element.fontSize}
        fill={element.style.stroke}
        align="left"
        verticalAlign="middle"
        opacity={isEditing ? 0 : element.style.opacity}
        stroke={isSelected ? '#3B82F6' : undefined}
        strokeWidth={isSelected ? 0.25 : 0}
      />
    </Group>
  )
}
