import { useMemo } from 'react'
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useCan } from '../../../hooks/useCan'
import { alignElements, distributeElements } from '../../../lib/alignment'
import { unionBounds } from '../../../lib/elementBounds'

/**
 * Floating align/distribute pill that hovers above the multi-selection
 * bounding box. Same UX pattern as Figma / Miro / Linear — surfaces the
 * helpers that already live in PropertiesPanel so layout work doesn't
 * require travelling to the right sidebar.
 *
 * The wrapper is `pointer-events-none absolute inset-0` so empty stage
 * area still receives pan / marquee events; only the pill itself opts
 * into pointer events.
 */

const PILL_HEIGHT_GUESS = 36
const VIEWPORT_TOP_BUFFER = 56

interface AlignButtonProps {
  label: string
  icon: LucideIcon
  onClick: () => void
}

function AlignButton({ label, icon: Icon, onClick }: AlignButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      // 28px square. `flex items-center justify-center` keeps the icon
      // visually centred regardless of its intrinsic baseline.
      className="w-7 h-7 flex items-center justify-center rounded text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}

function Separator() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-700"
    />
  )
}

export function AlignDistributeToolbar() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const canEdit = useCan('editMap')

  // Compute the AABB of selected elements via the shared helper. Walls in
  // the selection are still included in the AABB even though they're
  // skipped by `alignElements` / `distributeElements`; treating the union
  // box as "what the operator pointed at" feels right for placement of a
  // floating control even when the math underneath ignores some members.
  const aabb = useMemo(() => {
    if (selectedIds.length < 2) return null
    const els = selectedIds.map((id) => elements[id]).filter((e): e is NonNullable<typeof e> => Boolean(e))
    if (els.length < 2) return null
    return unionBounds(els)
  }, [selectedIds, elements])

  if (!canEdit) return null
  if (presentationMode) return null
  if (!aabb) return null

  // World → screen transform for the AABB top-centre. Konva applies the
  // stage transform as `screen = world * scale + offset`, matching the
  // formulas in `Minimap`'s viewport indicator.
  const screenLeft = (aabb.x + aabb.width / 2) * stageScale + stageX
  const screenTopEdge = aabb.y * stageScale + stageY
  const screenBottomEdge = (aabb.y + aabb.height) * stageScale + stageY

  // 8 px gap between the pill's bottom edge and the AABB's top edge. If
  // the AABB top is too close to the viewport top, anchor below the AABB
  // instead so the pill never gets clipped off the screen.
  const anchorAbove = screenTopEdge >= VIEWPORT_TOP_BUFFER
  const top = anchorAbove ? screenTopEdge - 8 : screenBottomEdge + 8 + PILL_HEIGHT_GUESS
  // `translate(-50%, -100%)` pins the pill so the (left, top) anchor is
  // its bottom-centre. When anchored below we offset `top` upward by the
  // pill height guess so the same translate keeps the top edge 8 px
  // beneath the AABB.
  const transform = 'translate(-50%, -100%)'

  const showDistribute = selectedIds.length >= 3

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        data-testid="align-distribute-toolbar"
        role="toolbar"
        aria-label="Align and distribute selection"
        className="pointer-events-auto absolute flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-1 shadow-md"
        style={{ left: screenLeft, top, transform }}
      >
        <AlignButton
          label="Align left"
          icon={AlignHorizontalJustifyStart}
          onClick={() => alignElements(selectedIds, 'left')}
        />
        <AlignButton
          label="Align horizontal center"
          icon={AlignHorizontalJustifyCenter}
          onClick={() => alignElements(selectedIds, 'h-center')}
        />
        <AlignButton
          label="Align right"
          icon={AlignHorizontalJustifyEnd}
          onClick={() => alignElements(selectedIds, 'right')}
        />
        <Separator />
        <AlignButton
          label="Align top"
          icon={AlignVerticalJustifyStart}
          onClick={() => alignElements(selectedIds, 'top')}
        />
        <AlignButton
          label="Align vertical center"
          icon={AlignVerticalJustifyCenter}
          onClick={() => alignElements(selectedIds, 'v-center')}
        />
        <AlignButton
          label="Align bottom"
          icon={AlignVerticalJustifyEnd}
          onClick={() => alignElements(selectedIds, 'bottom')}
        />
        {showDistribute && (
          <>
            <Separator />
            <AlignButton
              label="Distribute horizontally"
              icon={AlignHorizontalSpaceAround}
              onClick={() => distributeElements(selectedIds, 'horizontal')}
            />
            <AlignButton
              label="Distribute vertically"
              icon={AlignVerticalSpaceAround}
              onClick={() => distributeElements(selectedIds, 'vertical')}
            />
          </>
        )}
      </div>
    </div>
  )
}
