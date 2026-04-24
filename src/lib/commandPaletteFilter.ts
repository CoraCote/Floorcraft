/**
 * Command-palette data model + pure filter function.
 *
 * A palette item is identity-stable (`id`), belongs to a single visible
 * `section`, renders with `label`, and fires `run()` when the user hits
 * Enter or clicks. An optional `subtitle` provides secondary context
 * (e.g. department on a person row).
 *
 * The filter itself is deliberately unsophisticated: case-insensitive
 * substring match on `label`, preserving caller-supplied input order so
 * upstream grouping (Navigate → People → Floors → Actions) survives the
 * filter pass. No fuzzy-matching library — the palette is small and
 * predictable; substring search is the cheapest thing that works.
 */

export type CommandSection = 'navigate' | 'people' | 'floors' | 'actions'

export interface CommandItem {
  /** Stable id — used as the React key and to track the highlight. */
  id: string
  section: CommandSection
  label: string
  /** Optional secondary line (department, title, etc). */
  subtitle?: string
  run: () => void
}

/**
 * Case-insensitive substring filter. Empty / whitespace-only query returns
 * the full list unchanged.
 */
export function filterCommandItems(
  items: CommandItem[],
  query: string,
): CommandItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return items
  return items.filter((item) => item.label.toLowerCase().includes(q))
}

/**
 * Human label for a section header in the palette. Kept alongside the
 * filter so the renderer and any test helper agree on the vocabulary.
 */
export const SECTION_LABELS: Record<CommandSection, string> = {
  navigate: 'Navigate',
  people: 'People',
  floors: 'Floors',
  actions: 'Actions',
}

/** Render order for sections — matches the product spec. */
export const SECTION_ORDER: readonly CommandSection[] = [
  'navigate',
  'people',
  'floors',
  'actions',
] as const
