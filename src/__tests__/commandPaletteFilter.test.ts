import { describe, it, expect } from 'vitest'
import {
  filterCommandItems,
  type CommandItem,
} from '../lib/commandPaletteFilter'

/**
 * Pure filter for the Cmd+K palette — case-insensitive substring match on
 * `label`, preserving the input order so callers can control section
 * grouping upstream. No fuzzy-matching library (YAGNI); a single contiguous
 * substring is plenty for a 4-section, ~20-item palette.
 */

function item(
  section: CommandItem['section'],
  label: string,
  id = label,
): CommandItem {
  return { id, section, label, run: () => {} }
}

describe('filterCommandItems', () => {
  it('returns every item when the query is empty', () => {
    const items = [item('navigate', 'Go to Map'), item('actions', 'Export PDF')]
    expect(filterCommandItems(items, '')).toHaveLength(2)
  })

  it('returns every item when the query is whitespace-only', () => {
    const items = [item('navigate', 'Go to Map')]
    expect(filterCommandItems(items, '   ')).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    const items = [item('navigate', 'Go to Map'), item('actions', 'Export PDF')]
    const result = filterCommandItems(items, 'MAP')
    expect(result.map((r) => r.label)).toEqual(['Go to Map'])
  })

  it('matches contiguous substrings anywhere in the label', () => {
    const items = [
      item('actions', 'Export PDF'),
      item('actions', 'Export PNG'),
      item('navigate', 'Go to Reports'),
    ]
    const result = filterCommandItems(items, 'port')
    // 'Export PDF', 'Export PNG', 'Reports' all contain 'port'.
    expect(result.map((r) => r.label)).toEqual([
      'Export PDF',
      'Export PNG',
      'Go to Reports',
    ])
  })

  it('preserves input order across sections', () => {
    const items = [
      item('actions', 'Export PNG'),
      item('people', 'Paul'),
      item('navigate', 'Go to Reports'),
    ]
    const result = filterCommandItems(items, 'p')
    expect(result.map((r) => r.id)).toEqual([
      'Export PNG',
      'Paul',
      'Go to Reports',
    ])
  })

  it('returns empty when nothing matches', () => {
    const items = [item('navigate', 'Go to Map')]
    expect(filterCommandItems(items, 'zzz')).toHaveLength(0)
  })

  it('does not fuzzy-match non-contiguous characters', () => {
    // "gtm" should NOT match "Go to Map" (no contiguous substring).
    const items = [item('navigate', 'Go to Map')]
    expect(filterCommandItems(items, 'gtm')).toHaveLength(0)
  })
})
