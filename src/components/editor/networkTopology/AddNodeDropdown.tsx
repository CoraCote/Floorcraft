import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '../../ui'
import {
  TOPOLOGY_NODE_TYPES,
  type TopologyNodeType,
} from '../../../types/networkTopology'
import { NODE_META } from './topologyMeta'

/**
 * M6.1 — Add-node dropdown.
 *
 * Opens a small menu of the eight `TopologyNodeType` entries with
 * matching icon + friendly type name. Picking a type fires
 * `onSelect(type)`; the page wires that up to insert a node at the
 * canvas center (or at a non-overlapping position). Click-outside +
 * Escape close the menu, matching the View dropdown idiom in TopBar.
 */

interface Props {
  onSelect: (type: TopologyNodeType) => void
  /** Renders as a primary-button affordance when true; else a quiet
   *  secondary trigger that fits inline next to "Save". */
  variant?: 'primary' | 'secondary'
  label?: string
}

export function AddNodeDropdown({
  onSelect,
  variant = 'secondary',
  label = 'Add node',
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        variant={variant}
        leftIcon={<Plus size={14} aria-hidden="true" />}
        rightIcon={<ChevronDown size={14} aria-hidden="true" />}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg dark:bg-gray-900 dark:border-gray-700 dark:shadow-black/40 z-30 py-1"
        >
          {TOPOLOGY_NODE_TYPES.map((type) => {
            const { Icon, typeName, tile } = NODE_META[type]
            return (
              <button
                key={type}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSelect(type)
                }}
                className="flex items-center gap-2.5 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
                data-testid={`add-node-option-${type}`}
              >
                <span
                  className={[
                    'inline-flex items-center justify-center w-6 h-6 rounded',
                    tile,
                  ].join(' ')}
                >
                  <Icon size={14} aria-hidden="true" />
                </span>
                {typeName}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
