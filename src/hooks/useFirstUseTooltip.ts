import { useCallback, useEffect, useState } from 'react'

/**
 * First-use tooltip tracker. Mirrors the "rich on first hover, plain
 * afterwards" pattern used by drawing apps (Figma, Miro). Each tool the
 * user has already selected once is remembered in `localStorage.usedTools`
 * (a JSON array of keys). The next time that tool is hovered, the rich
 * tooltip stays suppressed — only the tool's plain `title` tooltip shows.
 *
 * The hook is deliberately tiny: it stores its own in-memory copy of the
 * used set so that consumers re-render when the set changes, and persists
 * to localStorage on every mutation. Failures to read/write storage
 * degrade silently (private-mode browsers, quota) so tooltip guidance
 * simply stops persisting rather than crashing.
 */
const STORAGE_KEY = 'usedTools'

function readUsedTools(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string')
    }
    return []
  } catch {
    return []
  }
}

function writeUsedTools(tools: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools))
  } catch {
    // Private mode / quota — silent.
  }
}

export interface FirstUseTooltipApi {
  /** Returns true when the tool has never been selected on this device. */
  showRichTooltip: (toolKey: string) => boolean
  /** Record that the user has now selected this tool — suppresses future rich tooltips. */
  markToolUsed: (toolKey: string) => void
}

export function useFirstUseTooltip(): FirstUseTooltipApi {
  const [used, setUsed] = useState<Set<string>>(() => new Set(readUsedTools()))

  // Keep the in-memory set in sync with localStorage mutations triggered
  // in other tabs/windows so tooltips don't re-appear after the user
  // "used" a tool in another tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setUsed(new Set(readUsedTools()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const showRichTooltip = useCallback(
    (toolKey: string) => !used.has(toolKey),
    [used],
  )

  const markToolUsed = useCallback((toolKey: string) => {
    setUsed((prev) => {
      if (prev.has(toolKey)) return prev
      const next = new Set(prev)
      next.add(toolKey)
      writeUsedTools(Array.from(next))
      return next
    })
  }, [])

  return { showRichTooltip, markToolUsed }
}
