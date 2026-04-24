import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'

/**
 * Keyboard shortcut reference.
 *
 * Source of truth is `src/hooks/useKeyboardShortcuts.ts`. Every entry
 * here has a corresponding binding in that hook (or, for canvas
 * gestures like marquee / drag-to-pan, in CanvasStage).
 *
 * The overlay supports a fuzzy filter (action substring + key combo
 * substring) so power users can type "undo", "cmd", or "zoom" and
 * narrow down to relevant entries quickly. The platform-aware label
 * helper (`formatKeys`) swaps `Cmd` for `⌘` on macOS so the rendered
 * pills match what's printed on the user's keyboard.
 */

type ShortcutRow = {
  /**
   * Canonical, platform-neutral form. Use `Cmd` for the meta/ctrl
   * modifier — `formatKeys` will translate to ⌘ on macOS and `Ctrl`
   * elsewhere. Use `+` between modifiers and the base key, and
   * `/` when there's a logical alternative (e.g. `Delete / Backspace`).
   */
  keys: string
  action: string
}
type ShortcutGroup = { title: string; rows: ShortcutRow[] }

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Editing',
    rows: [
      { keys: 'Cmd+Z', action: 'Undo' },
      { keys: 'Cmd+Shift+Z', action: 'Redo' },
      { keys: 'Delete / Backspace', action: 'Delete selected' },
      { keys: 'Cmd+D', action: 'Duplicate selection' },
      { keys: 'Cmd+A', action: 'Select all' },
      { keys: 'Cmd+G', action: 'Group selection' },
      { keys: 'Cmd+Shift+G', action: 'Ungroup' },
      { keys: 'Cmd+L', action: 'Lock / unlock' },
      { keys: 'Arrows', action: 'Nudge 1px (Shift = 10px)' },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { keys: 'Drag', action: 'Pan canvas (Select tool, empty space)' },
      { keys: 'Shift+Drag', action: 'Marquee-select on empty canvas' },
      { keys: 'Space+Drag', action: 'Pan canvas (hold Space)' },
      { keys: 'Middle-Click+Drag', action: 'Pan' },
      { keys: 'Two-finger Drag', action: 'Pan (trackpad)' },
      { keys: 'Shift+Wheel', action: 'Pan horizontally' },
      { keys: 'Arrows', action: 'Pan viewport (no selection)' },
      { keys: 'Cmd+F', action: 'Find on canvas' },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { keys: 'V', action: 'Select' },
      { keys: 'W', action: 'Wall' },
      { keys: 'Shift+R', action: 'Rectangle' },
      { keys: 'E', action: 'Ellipse' },
      { keys: 'L', action: 'Line' },
      { keys: 'A', action: 'Arrow' },
      { keys: 'T', action: 'Text' },
      { keys: 'Shift+D', action: 'Door' },
      { keys: 'Shift+N', action: 'Window' },
      { keys: 'Shift+G', action: 'Neighborhood' },
      { keys: 'Shift+M', action: 'Ruler / measure' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: 'Cmd+=', action: 'Zoom in' },
      { keys: 'Cmd+-', action: 'Zoom out' },
      { keys: 'Cmd+0', action: 'Reset zoom' },
      { keys: 'G', action: 'Toggle grid' },
      { keys: 'D', action: 'Toggle dimensions' },
      { keys: 'P', action: 'Presentation mode' },
      { keys: 'M', action: 'Jump to map view' },
      { keys: 'R', action: 'Jump to roster view' },
      { keys: 'O', action: 'Jump to org chart' },
    ],
  },
  {
    title: 'Command & search',
    rows: [
      { keys: 'Cmd+K', action: 'Command palette' },
      { keys: '/', action: 'Command palette' },
      { keys: 'Cmd+F', action: 'Find on canvas' },
      { keys: '?', action: 'Show this overlay' },
    ],
  },
  {
    title: 'General',
    rows: [
      { keys: 'Escape', action: 'Deselect / cancel / exit mode' },
      { keys: '?', action: 'Show keyboard shortcuts' },
    ],
  },
]

/**
 * macOS detection. Lives behind a function so tests can mock
 * `navigator.platform` (or `navigator.userAgent` on newer Safari /
 * iPad-as-Mac) and re-render. We check `userAgent` as a fallback
 * because `navigator.platform` is deprecated and increasingly
 * returns generic strings on modern browsers.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return true
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad|iPod/i.test(ua)
}

/**
 * Translate a canonical key combo (`Cmd+Shift+Z`) into an array of
 * per-keycap labels (`['⌘', 'Shift', 'Z']` on macOS, `['Ctrl',
 * 'Shift', 'Z']` elsewhere). Unhandled separators (`/`, ` or `, `+`)
 * are returned verbatim as their own tokens so the renderer can
 * place a non-keycap glue character between pills.
 */
function formatKeys(combo: string, mac: boolean): Array<{ kind: 'key' | 'sep'; text: string }> {
  // Normalize an alternative-separator (`/`, ` or `, `,`) into a single
  // token type; the splitter below preserves both keycap segments
  // around it so the UI can render "Delete or Backspace" with two
  // pills and a glue word between.
  const tokens: Array<{ kind: 'key' | 'sep'; text: string }> = []
  // Split on `+`, `/`, ` or `, and `,` — keeping the separators so we
  // can stamp them back into the output as glue between pills.
  const parts = combo.split(/(\s*\+\s*|\s*\/\s*|\s+or\s+|\s*,\s*)/)
  for (const raw of parts) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (trimmed === '+') {
      tokens.push({ kind: 'sep', text: '+' })
      continue
    }
    if (trimmed === '/' || trimmed === 'or' || trimmed === ',') {
      tokens.push({ kind: 'sep', text: trimmed === ',' ? ',' : trimmed === 'or' ? 'or' : '/' })
      continue
    }
    if (trimmed === '') continue
    // Translate the canonical `Cmd` to the platform glyph. Other
    // tokens are passed through unchanged — `Shift`, `Alt`, `Enter`,
    // letters, arrow symbols, etc. are already platform-neutral.
    const label = trimmed === 'Cmd' ? (mac ? '\u2318' : 'Ctrl') : trimmed
    tokens.push({ kind: 'key', text: label })
  }
  return tokens
}

function matchesQuery(row: ShortcutRow, mac: boolean, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase().trim()
  if (!q) return true
  if (row.action.toLowerCase().includes(q)) return true
  if (row.keys.toLowerCase().includes(q)) return true
  // Also let the user search by the rendered platform label
  // ("⌘", "ctrl") so typing "ctrl" still works on a Mac and
  // typing "cmd" still works on Linux/Windows.
  const rendered = formatKeys(row.keys, mac)
    .map((t) => t.text)
    .join(' ')
    .toLowerCase()
  return rendered.includes(q)
}

function KeyCombo({ combo, mac }: { combo: string; mac: boolean }) {
  const tokens = formatKeys(combo, mac)
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {tokens.map((t, i) =>
        t.kind === 'key' ? (
          <kbd
            key={`${i}-${t.text}`}
            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-[11px] font-medium font-mono text-gray-700 dark:text-gray-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05),inset_0_-1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.4),inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
          >
            {t.text}
          </kbd>
        ) : (
          <span
            key={`sep-${i}`}
            className="text-[11px] text-gray-400 dark:text-gray-500 select-none"
            aria-hidden="true"
          >
            {t.text}
          </span>
        ),
      )}
    </span>
  )
}

export function KeyboardShortcutsOverlay() {
  const open = useUIStore((s) => s.shortcutsOverlayOpen)
  const setOpen = useUIStore((s) => s.setShortcutsOverlayOpen)
  // Mount the inner content lazily so query state is fresh on each
  // open without needing a setState-in-effect to reset it. Closing
  // the overlay unmounts the inner component, garbage-collecting
  // the search query alongside it.
  if (!open) return null
  return <OverlayContent setOpen={setOpen} />
}

function OverlayContent({ setOpen }: { setOpen: (open: boolean) => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Detected per render. Cheap (a single regex on a short string),
  // and computing it on every render means tests that mock
  // `navigator.platform` after mount still see the swap on the next
  // re-render rather than being stuck with whatever platform the
  // very first render saw.
  const mac = isMacPlatform()

  // Auto-focus the search input on mount. requestAnimationFrame so
  // the input exists in the DOM by the time we focus — useEffect
  // runs after commit but jsdom + React 18 occasionally lose focus
  // calls fired during the same tick.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Escape handler. The global `useKeyboardShortcuts` hook stands
  // down while a modal is open, so we own dismissal here. Bound to
  // window so it fires even if focus has moved off the input (e.g.
  // user clicked a kbd row).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions)
  }, [setOpen])

  // Filter every group through the query, dropping any that have no
  // surviving rows so the layout stays tight.
  const filteredGroups = useMemo(() => {
    return shortcutGroups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => matchesQuery(r, mac, query)) }))
      .filter((g) => g.rows.length > 0)
  }, [query, mac])

  const totalCount = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.rows.length, 0),
    [filteredGroups],
  )

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-heading"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="shortcuts-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close shortcuts overlay"
          >
            &times;
          </button>
        </div>

        <form
          // Enter inside the search field would otherwise submit and
          // (with no action) close / reload — capture and noop so the
          // overlay stays open while users refine their query.
          onSubmit={(e) => e.preventDefault()}
          className="mb-4"
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts (e.g. undo, cmd, zoom)"
            aria-label="Search keyboard shortcuts"
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </form>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3" aria-live="polite">
          {totalCount === 0 ? 'No shortcuts match' : `${totalCount} shortcut${totalCount === 1 ? '' : 's'}`}
          {' '}
          <span className="text-gray-400 dark:text-gray-500">·</span>
          {' '}
          <span>Single-letter tool keys only fire when no input is focused.</span>
        </p>

        {filteredGroups.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No shortcuts match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {filteredGroups.map((group) => (
              <section key={group.title}>
                <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {group.rows.map((row) => (
                    <li
                      key={`${group.title}-${row.keys}-${row.action}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-200">{row.action}</span>
                      <KeyCombo combo={row.keys} mac={mac} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default KeyboardShortcutsOverlay
