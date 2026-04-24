import { beforeEach, describe, expect, it } from 'vitest'
import {
  FILTER_PRESETS_STORAGE_KEY,
  MAX_FILTER_PRESETS,
  addFilterPreset,
  deleteFilterPreset,
  loadFilterPresets,
  renameFilterPreset,
  resolveUniquePresetName,
  saveFilterPresets,
} from '../lib/filterPresetsStorage'

/**
 * The filter-preset storage helper is the trust boundary between whatever
 * the user mashes into the "Save as" prompt and the dropdown we render.
 * The rules are small but load-bearing:
 *   - round-trip JSON without losing fields or ordering,
 *   - tolerate corrupt / non-array / wrong-shape localStorage without
 *     crashing the roster page on boot,
 *   - enforce the 20-preset cap by purging the oldest (by createdAt).
 * These tests lock each of those in.
 */

beforeEach(() => {
  localStorage.clear()
})

describe('filterPresetsStorage — round-trip', () => {
  it('returns [] when key is absent', () => {
    expect(loadFilterPresets()).toEqual([])
  })

  it('saves and reloads a list in the same order', () => {
    const presets = [
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'Beta', query: 'dept=Eng', createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    saveFilterPresets(presets)
    expect(loadFilterPresets()).toEqual(presets)
  })

  it('persists under the documented localStorage key', () => {
    saveFilterPresets([
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    const raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toHaveLength(1)
  })
})

describe('filterPresetsStorage — corruption recovery', () => {
  it('returns [] and resets storage when JSON is malformed', () => {
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, '{not json')
    expect(loadFilterPresets()).toEqual([])
    // After a read, storage should no longer hold garbage so subsequent
    // writes don't have to fight it. We assert the slot is either empty
    // or an empty array — both are acceptable "clean" states.
    const raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
    expect(raw === null || raw === '[]').toBe(true)
  })

  it('returns [] when parsed value is not an array', () => {
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, '{"foo":"bar"}')
    expect(loadFilterPresets()).toEqual([])
  })

  it('skips entries missing required fields', () => {
    localStorage.setItem(
      FILTER_PRESETS_STORAGE_KEY,
      JSON.stringify([
        { id: 'ok', name: 'Good', query: '', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'bad' }, // missing name/query/createdAt
        null,
        'garbage',
      ]),
    )
    const out = loadFilterPresets()
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('ok')
  })
})

describe('filterPresetsStorage — addFilterPreset cap', () => {
  it('appends to the end when under the cap', () => {
    const seed = [
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    const { presets, purged } = addFilterPreset(seed, {
      id: 'b',
      name: 'Beta',
      query: 'dept=Eng',
      createdAt: '2026-01-02T00:00:00.000Z',
    })
    expect(purged).toBeNull()
    expect(presets.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('purges the oldest by createdAt when the cap is hit', () => {
    // Fill to the cap with monotonically increasing createdAt so "oldest"
    // is unambiguous.
    const seed = Array.from({ length: MAX_FILTER_PRESETS }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      query: `q=${i}`,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }))
    const { presets, purged } = addFilterPreset(seed, {
      id: 'new',
      name: 'New',
      query: 'q=new',
      createdAt: new Date(2026, 5, 1).toISOString(),
    })
    expect(purged?.id).toBe('p0')
    expect(presets).toHaveLength(MAX_FILTER_PRESETS)
    expect(presets.find((p) => p.id === 'new')).toBeTruthy()
    expect(presets.find((p) => p.id === 'p0')).toBeFalsy()
  })
})

describe('filterPresetsStorage — deleteFilterPreset', () => {
  it('removes by id and leaves others untouched', () => {
    const seed = [
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'Beta', query: 'q=b', createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    expect(deleteFilterPreset(seed, 'a')).toEqual([seed[1]])
  })

  it('is a no-op when id is unknown', () => {
    const seed = [
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    expect(deleteFilterPreset(seed, 'zzz')).toEqual(seed)
  })
})

describe('filterPresetsStorage — renameFilterPreset', () => {
  it('updates name for matching id only', () => {
    const seed = [
      { id: 'a', name: 'Alpha', query: 'q=a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'Beta', query: 'q=b', createdAt: '2026-01-02T00:00:00.000Z' },
    ]
    const out = renameFilterPreset(seed, 'a', 'Alpha renamed')
    expect(out[0].name).toBe('Alpha renamed')
    expect(out[1]).toEqual(seed[1])
  })
})

describe('filterPresetsStorage — resolveUniquePresetName', () => {
  it('returns the raw name when no collision', () => {
    expect(resolveUniquePresetName([], 'New preset')).toBe('New preset')
  })

  it('appends "(2)" on first collision', () => {
    const existing = [
      { id: 'a', name: 'Daily', query: '', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    expect(resolveUniquePresetName(existing, 'Daily')).toBe('Daily (2)')
  })

  it('keeps counting until unique', () => {
    const existing = [
      { id: 'a', name: 'Daily', query: '', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'Daily (2)', query: '', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'c', name: 'Daily (3)', query: '', createdAt: '2026-01-03T00:00:00.000Z' },
    ]
    expect(resolveUniquePresetName(existing, 'Daily')).toBe('Daily (4)')
  })
})
