import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, Check, RotateCcw } from 'lucide-react'
import { useAnnotationsStore } from '../../../stores/annotationsStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useCan } from '../../../hooks/useCan'
import { focusElements } from '../../../lib/focusElements'
import { switchToFloor } from '../../../lib/seatAssignment'
import { formatRelative } from '../../../lib/time'
import type { Annotation } from '../../../types/annotations'
import { PanelHeader } from './PanelHeader'
import { PanelEmptyState } from './PanelEmptyState'

/**
 * Annotations section — lists open annotations with resolved ones tucked
 * under a collapsible. Click a row to focus the anchor on the canvas:
 *   - element anchors → reuse `focusElements` (selects + zooms to fit).
 *   - floor-position anchors → switch to the owning floor if needed and
 *     pan so the pin lands in the middle of the viewport.
 *
 * Wave 17D polish: moved to shared PanelHeader / PanelEmptyState so the
 * section visually matches Properties / People. The header now shows the
 * open count as a standard pill, and the empty state explains how to
 * create the first note rather than leaving a terse one-liner.
 *
 * Permissions:
 *   - View: everyone (roles without edit).
 *   - Resolve toggle: editRoster || editMap.
 */
export function AnnotationsPanel() {
  const annotations = useAnnotationsStore((s) => s.annotations)
  const setResolved = useAnnotationsStore((s) => s.setResolved)
  // Read both permissions unconditionally so the hook call order is stable —
  // `useCan('a') || useCan('b')` would short-circuit and violate the
  // rules-of-hooks lint rule.
  const canEditMap = useCan('editMap')
  const canEditRoster = useCan('editRoster')
  const canEdit = canEditMap || canEditRoster
  const [showResolved, setShowResolved] = useState(false)

  const { open, resolved } = useMemo(() => {
    const o: Annotation[] = []
    const r: Annotation[] = []
    for (const a of Object.values(annotations)) {
      if (a.resolvedAt) r.push(a)
      else o.push(a)
    }
    // Newest first on both lists — mirrors the mental model users have
    // when they scan Slack / Asana: latest activity at the top.
    o.sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    r.sort((x, y) => {
      const rx = y.resolvedAt ?? ''
      const ry = x.resolvedAt ?? ''
      return rx.localeCompare(ry)
    })
    return { open: o, resolved: r }
  }, [annotations])

  const hasAnything = open.length > 0 || resolved.length > 0

  return (
    <div className="flex flex-col">
      <PanelHeader title="Annotations" count={open.length} />

      {!hasAnything ? (
        <PanelEmptyState
          icon={MessageSquare}
          title="No annotations yet"
          body={
            <>
              Use the pin tool in the left sidebar to drop a note on the
              canvas. Notes can anchor to a specific element or to a point
              on the floor.
            </>
          }
          compact
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {open.map((a) => (
            <AnnotationRow
              key={a.id}
              a={a}
              canEdit={canEdit}
              onResolve={() =>
                setResolved(a.id, new Date().toISOString())
              }
            />
          ))}

          {resolved.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowResolved(!showResolved)}
                className="w-full flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                aria-expanded={showResolved}
              >
                {showResolved ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span className="tabular-nums">Resolved ({resolved.length})</span>
              </button>
              {showResolved && (
                <div className="mt-1 flex flex-col gap-1.5 opacity-70">
                  {resolved.map((a) => (
                    <AnnotationRow
                      key={a.id}
                      a={a}
                      canEdit={canEdit}
                      resolved
                      onResolve={() => setResolved(a.id, null)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  a: Annotation
  canEdit: boolean
  onResolve: () => void
  resolved?: boolean
}

function AnnotationRow({ a, canEdit, onResolve, resolved }: RowProps) {
  const handleClick = () => {
    if (a.anchor.type === 'element') {
      focusElements([a.anchor.elementId])
      return
    }
    // Floor-position anchor: switch to the right floor if we're not on
    // it, then pan the viewport so the pin sits near the canvas centre.
    // We compute the stage offset directly from `stageSize` — no helper
    // for this exact "pan to world point" call exists today.
    const targetFloor = a.anchor.floorId
    const floorStore = useFloorStore.getState()
    if (floorStore.activeFloorId !== targetFloor) {
      switchToFloor(targetFloor)
    }
    const cs = useCanvasStore.getState()
    const cx = cs.stageWidth / 2
    const cy = cs.stageHeight / 2
    cs.setStagePosition(cx - a.anchor.x * cs.stageScale, cy - a.anchor.y * cs.stageScale)
  }

  // Short body preview — full body is visible in the canvas popover.
  const preview =
    a.body.length > 90 ? `${a.body.slice(0, 87)}…` : a.body
  const relative = formatRelative(a.createdAt)

  return (
    <div
      className={`group flex flex-col gap-1 p-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
        resolved ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'
      }`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <div
        className="text-xs leading-snug whitespace-pre-wrap"
        style={{ textDecoration: resolved ? 'line-through' : 'none' }}
      >
        {preview}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 min-w-0">
          <span className="truncate max-w-[8rem]" title={a.authorName}>
            {a.authorName}
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{describeAnchor(a)}</span>
          {relative && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums" title={a.createdAt}>
                {relative}
              </span>
            </>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onResolve()
            }}
            title={resolved ? 'Reopen annotation' : 'Resolve annotation'}
            aria-label={resolved ? 'Reopen annotation' : 'Resolve annotation'}
            className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-800 hover:border-gray-300 flex-shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            {resolved ? <RotateCcw size={10} /> : <Check size={10} />}
            {resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>
    </div>
  )
}

function describeAnchor(a: Annotation): string {
  if (a.anchor.type === 'element') {
    const el = useElementsStore.getState().elements[a.anchor.elementId]
    if (!el) return 'orphaned'
    return el.label ? `on ${el.label}` : `on ${el.type}`
  }
  return 'on canvas'
}
