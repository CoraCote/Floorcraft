import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Pencil, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useToastStore } from '../../stores/toastStore'
import {
  MAX_FILTER_PRESETS,
  addFilterPreset,
  deleteFilterPreset,
  loadFilterPresets,
  renameFilterPreset,
  resolveUniquePresetName,
  saveFilterPresets,
  type FilterPreset,
} from '../../lib/filterPresetsStorage'

interface Props {
  /**
   * The *current* URL search string (including leading "?" or empty).
   * We persist `search.replace(/^\?/, '')` so round-tripping through
   * `URLSearchParams` is symmetric with how filter deep-links are
   * already formed in RosterPage.
   */
  currentSearch: string
  /** Whether *any* roster filter is currently active. Gates "Save". */
  hasAnyFilter: boolean
  /** Called with the raw query string ("status=on-leave&dept=Sales"). */
  onApplyPreset: (query: string) => void
}

/**
 * "Saved filters" dropdown above the roster filter bar.
 *
 * Behaviour rules (from the spec):
 *   - Save is disabled when no filters are active (no point).
 *   - Save prompts for a name; duplicates are allowed but renamed
 *     "Name (2)"/"(3)" so two identical-looking entries never collide.
 *   - Clicking a preset rewrites the URL search — the rest of the roster
 *     UI reads from `useSearchParams`, so filters just react.
 *   - 20 preset cap. The oldest is purged on overflow with a toast
 *     naming what got dropped so the user can recreate it if needed.
 *   - Per-preset edit (rename) and delete via inline controls.
 *   - localStorage corruption is handled in the storage layer; here we
 *     just trust `loadFilterPresets()` to return [] on anything sketchy.
 */
export function RosterFilterPresetsMenu({
  currentSearch,
  hasAnyFilter,
  onApplyPreset,
}: Props) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadFilterPresets())
  const toastPush = useToastStore((s) => s.push)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Click-outside + Escape to close. Matches the rest of the editor's
  // popovers (ConfirmDialog, RosterBulkEditPopover) which also mount ad
  // hoc keydown listeners rather than pulling in Radix.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const persist = useCallback((next: FilterPreset[]) => {
    setPresets(next)
    saveFilterPresets(next)
  }, [])

  const handleSave = useCallback(() => {
    if (!hasAnyFilter) return
    // `window.prompt` is crude but it's what the spec asks for, it
    // doesn't pull in a modal, and — crucially — it's what the entire
    // codebase already uses for one-off name-entry moments.
    const raw = window.prompt('Name this saved filter')
    if (raw === null) return // Cancel
    const trimmed = raw.trim()
    if (!trimmed) return
    const name = resolveUniquePresetName(presets, trimmed)
    const preset: FilterPreset = {
      id: nanoid(),
      name,
      query: currentSearch.replace(/^\?/, ''),
      createdAt: new Date().toISOString(),
    }
    const { presets: next, purged } = addFilterPreset(presets, preset)
    persist(next)
    if (purged) {
      toastPush({
        tone: 'warning',
        title: `Removed oldest preset "${purged.name}"`,
        body: `Saved filters are capped at ${MAX_FILTER_PRESETS}.`,
      })
    }
  }, [currentSearch, hasAnyFilter, persist, presets, toastPush])

  const handleDelete = useCallback(
    (id: string, name: string) => {
      // Keep the confirmation here rather than in the storage helper:
      // the helper is a pure data transform, and wiring `confirm` into
      // it would make tests awkward. A plain confirm() matches how the
      // roster page deletes rows too.
      if (!window.confirm(`Delete saved filter "${name}"?`)) return
      persist(deleteFilterPreset(presets, id))
    },
    [persist, presets],
  )

  const handleRename = useCallback(
    (id: string, currentName: string) => {
      const raw = window.prompt('Rename saved filter', currentName)
      if (raw === null) return
      const trimmed = raw.trim()
      if (!trimmed || trimmed === currentName) return
      // Rename also respects uniqueness — otherwise the dropdown would
      // happily render two entries with the same label.
      const others = presets.filter((p) => p.id !== id)
      const name = resolveUniquePresetName(others, trimmed)
      persist(renameFilterPreset(presets, id, name))
    },
    [persist, presets],
  )

  const handleApply = useCallback(
    (preset: FilterPreset) => {
      onApplyPreset(preset.query)
      setOpen(false)
    },
    [onApplyPreset],
  )

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Saved filters"
      >
        <Bookmark size={14} />
        Saved filters
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Saved filter presets"
          className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl w-80 overflow-hidden"
        >
          <div className="max-h-72 overflow-y-auto">
            {presets.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                No saved filters yet. Set up a filter below and hit "Save
                current filters as…" to stash it here.
              </div>
            ) : (
              <ul className="py-1">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <button
                      type="button"
                      onClick={() => handleApply(p)}
                      className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 truncate"
                      aria-label={`Apply preset ${p.name}`}
                      title={p.query || '(no filters)'}
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRename(p.id, p.name)}
                      aria-label={`Rename preset ${p.name}`}
                      title="Rename"
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      aria-label={`Delete preset ${p.name}`}
                      title="Delete"
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasAnyFilter}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={
                hasAnyFilter
                  ? 'Save the current filters as a reusable preset'
                  : 'Set at least one filter first'
              }
            >
              <Bookmark size={14} />
              Save current filters as…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
