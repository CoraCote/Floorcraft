import type { CrossOfficeKind, CrossOfficeResult } from '../../../lib/crossOfficeSearch'
import { crossOfficeRowKey } from '../../../lib/crossOfficePaletteNav'

interface Props {
  results: CrossOfficeResult[]
  highlightedId: string | null
  onHover: (id: string) => void
  onPick: (result: CrossOfficeResult) => void
}

const KIND_ICON: Record<CrossOfficeKind, string> = {
  employee: '\u25CF', // bullet (person)
  element: '\u25A0', // filled square (furniture/desk)
  neighborhood: '\u25B2', // triangle (region)
  office: '\u2302', // house (office)
}

const KIND_LABEL: Record<CrossOfficeKind, string> = {
  employee: 'Person',
  element: 'Element',
  neighborhood: 'Neighborhood',
  office: 'Office',
}

/**
 * Cross-office section of the palette. Results already arrive pre-sorted
 * by score; we group them by `officeName` while preserving their order so
 * the top overall match appears first inside its office. Each row shows a
 * kind-icon + label + sublabel, with the office chip pinned to the right
 * so operators can tell at a glance which office a match lives in.
 */
export function CrossOfficeResultsGroup({ results, highlightedId, onHover, onPick }: Props) {
  if (results.length === 0) return null
  // Group by officeName while preserving score order *within* each group.
  // The first time we see an office defines its group position — scanning
  // the pre-sorted result list gives us "best-office-first" ordering
  // without a separate pass over the office list.
  const groupIndex = new Map<string, number>()
  const groups: { officeName: string; items: CrossOfficeResult[] }[] = []
  for (const r of results) {
    let idx = groupIndex.get(r.officeName)
    if (idx === undefined) {
      idx = groups.length
      groupIndex.set(r.officeName, idx)
      groups.push({ officeName: r.officeName, items: [] })
    }
    groups[idx].items.push(r)
  }
  return (
    <li data-testid="command-palette-cross-office">
      <div
        className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide"
        data-testid="command-palette-section-cross-office"
      >
        All offices
      </div>
      {groups.map((group) => (
        <div key={group.officeName}>
          <div
            className="px-4 pt-1 pb-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400"
            data-testid={`cross-office-group-${group.officeName}`}
          >
            {group.officeName}
          </div>
          <ul>
            {group.items.map((item) => {
              const rowKey = crossOfficeRowKey(item)
              const active = highlightedId === rowKey
              return (
                <li key={rowKey}>
                  <button
                    type="button"
                    data-testid={`cross-office-item-${item.kind}-${item.id}`}
                    data-active={active ? 'true' : 'false'}
                    onMouseEnter={() => onHover(rowKey)}
                    onClick={() => onPick(item)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                      active ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="text-xs text-gray-400 dark:text-gray-500 w-3 inline-block"
                      title={KIND_LABEL[item.kind]}
                    >
                      {KIND_ICON[item.kind]}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      <span>{item.label}</span>
                      {item.sublabel && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{item.sublabel}</span>
                      )}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {item.officeName}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </li>
  )
}
