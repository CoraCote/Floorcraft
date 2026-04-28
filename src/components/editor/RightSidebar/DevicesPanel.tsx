import { useMemo, useState } from 'react'
import {
  Wifi,
  Square,
  Monitor,
  Video,
  KeyRound,
  Plug,
  Search,
  Download,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useUIStore } from '../../../stores/uiStore'
import { useToastStore } from '../../../stores/toastStore'
import {
  isITDevice,
  itLayerOf,
  type CanvasElement,
  type ITLayer,
  type AccessPointElement,
  type NetworkJackElement,
  type DisplayElement,
  type VideoBarElement,
  type BadgeReaderElement,
  type OutletElement,
} from '../../../types/elements'
import { focusElements } from '../../../lib/focusElements'
import { emit } from '../../../lib/audit'
import { downloadCSV } from '../../../lib/employeeCsv'
import {
  buildITDeviceCSV,
  buildITDeviceCSVFilename,
} from '../../../lib/itDeviceCsv'
import { PanelHeader } from './PanelHeader'
import { PanelEmptyState } from './PanelEmptyState'

/**
 * # DevicesPanel
 *
 * Right-sidebar tab listing every IT device on the active floor — the
 * "asset inventory" view IT operators reach for when they need to find
 * "the broken AP near the kitchen" or "every cat6a jack on this floor".
 *
 * # Visual quality bar
 *
 * Mirrors PeoplePanel's structure (header → search → filter pills →
 * scrollable list → empty state). Reuses Wave 17D shared primitives
 * (`PanelHeader`, `PanelEmptyState`) for the cross-panel consistency
 * established in M2 of the sidebar polish wave.
 *
 * # Filters compose
 *
 * Layer pill (network/av/security/power/all) AND status pill
 * (live/installed/planned/broken/decommissioned/all) AND the search
 * query. Layer + status are stored as separate state fields rather than
 * a single composite key so resetting one doesn't disturb the other and
 * "All" is the explicit "no filter" sentinel rather than an absence-of-
 * value.
 *
 * # Sort order
 *
 * Status descending — broken first, then planned, then live, then
 * installed, then decommissioned — then alphabetical by label. The
 * status priority is hand-picked to match what an IT operator wants to
 * see top-of-list: "what's on fire right now?". Decommissioned is last
 * because it's already off the operator's plate.
 *
 * # Performance
 *
 * The element store is keyed by id so we re-render whenever any element
 * changes; downstream filtering is memoised against the store's
 * `elements` reference. Even at 500 IT devices (an order of magnitude
 * larger than a typical floor) this is sub-millisecond — no need for a
 * virtualised list.
 *
 * # Why ALL devices in the CSV, not the filtered set?
 *
 * Most IT operators want a complete dump for ServiceNow / Lansweeper
 * ingestion; if they want a subset they can filter the CSV downstream
 * in Excel. Exporting the filtered view would surprise the operator who
 * navigated away mid-filter, downloaded the file, and only later
 * realised the export was incomplete. The button's `title` attribute
 * documents the behaviour so the surprise window is zero.
 */

type LayerFilter = 'all' | ITLayer
type StatusFilter =
  | 'all'
  | 'live'
  | 'installed'
  | 'planned'
  | 'broken'
  | 'decommissioned'

const LAYER_PILLS: { id: LayerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'network', label: 'Network' },
  { id: 'av', label: 'AV' },
  { id: 'security', label: 'Security' },
  { id: 'power', label: 'Power' },
]

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'installed', label: 'Installed' },
  { id: 'planned', label: 'Planned' },
  { id: 'broken', label: 'Broken' },
  { id: 'decommissioned', label: 'Decom.' },
]

// Lower number sorts earlier. `broken` first because that's the
// operator's top concern; `decommissioned` last because it's
// already off the active radar.
const STATUS_PRIORITY: Record<string, number> = {
  broken: 0,
  planned: 1,
  live: 2,
  installed: 3,
  decommissioned: 4,
  '': 5, // missing/unset — sort to the bottom
}

const TYPE_ICON: Record<string, LucideIcon> = {
  'access-point': Wifi,
  'network-jack': Square,
  display: Monitor,
  'video-bar': Video,
  'badge-reader': KeyRound,
  outlet: Plug,
}

export function DevicesPanel() {
  // Subscribe to the elements record itself — `useMemo` below derives
  // the device list from that single object reference, so we don't
  // re-run filter logic when an unrelated element (e.g. a wall) gets
  // moved.
  const elements = useElementsStore((s) => s.elements)
  const activeFloor = useFloorStore((s) => s.getActiveFloor())
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const pushToast = useToastStore((s) => s.push)

  const [searchQuery, setSearchQuery] = useState('')
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // All IT devices on the active floor, sorted by status-priority then
  // alphabetical. Reused for the per-layer counts in the stat strip and
  // as the input to the visible-list filter.
  const allDevices = useMemo(() => {
    const list: CanvasElement[] = []
    for (const el of Object.values(elements)) {
      if (isITDevice(el)) list.push(el)
    }
    list.sort((a, b) => {
      const aP = STATUS_PRIORITY[deviceStatusOf(a) ?? ''] ?? 99
      const bP = STATUS_PRIORITY[deviceStatusOf(b) ?? ''] ?? 99
      if (aP !== bP) return aP - bP
      const aLabel = displayName(a).toLowerCase()
      const bLabel = displayName(b).toLowerCase()
      return aLabel.localeCompare(bLabel)
    })
    return list
  }, [elements])

  // Per-layer counts for the stat strip — derived from `allDevices` so
  // the strip reflects unfiltered totals (the strip is informational,
  // not a filter readout).
  const layerCounts = useMemo(() => {
    const counts: Record<ITLayer, number> = {
      network: 0,
      av: 0,
      security: 0,
      power: 0,
    }
    for (const el of allDevices) {
      const layer = itLayerOf(el)
      if (layer) counts[layer]++
    }
    return counts
  }, [allDevices])

  // Compose layer + status + search. Search matches across every
  // type-specific text field (model / serial / mac / ip / vendor /
  // label / jackId) as a single big string union so a user can type
  // an IP, a MAC fragment, or a model number without picking which
  // field to search first.
  const visibleDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allDevices.filter((el) => {
      if (layerFilter !== 'all' && itLayerOf(el) !== layerFilter) return false
      if (statusFilter !== 'all' && deviceStatusOf(el) !== statusFilter) return false
      if (q && !matchesSearch(el, q)) return false
      return true
    })
  }, [allDevices, layerFilter, statusFilter, searchQuery])

  const handleRowClick = (id: string) => {
    // `focusElements` selects + pans + zooms via the registered Konva
    // stage. If the stage isn't mounted (e.g. in the unit-test render)
    // it still selects, which is the only side-effect a unit test can
    // observe — that's the contract.
    focusElements([id])
    setSelectedIds([id])
  }

  const handleExport = () => {
    // Always export ALL devices on the active floor, regardless of
    // current filter — see the panel doc comment for rationale.
    const floorName = activeFloor?.name ?? ''
    const csv = buildITDeviceCSV(allDevices, { floorName })
    const filename = buildITDeviceCSVFilename(floorName)
    const ok = downloadCSV(filename, csv)
    if (!ok) {
      pushToast({
        tone: 'error',
        title: 'Export failed',
        body: 'The browser refused the download. Check pop-up settings and retry.',
      })
      return
    }
    pushToast({
      tone: 'success',
      title: `Exported ${allDevices.length} device${allDevices.length === 1 ? '' : 's'}`,
    })
    // Fire-and-forget audit. The helper is `void` and never throws.
    void emit('it.export-csv', 'floor', activeFloor?.id ?? null, {
      count: allDevices.length,
      floorId: activeFloor?.id ?? null,
    })
  }

  const exportButton = (
    <button
      type="button"
      onClick={handleExport}
      disabled={allDevices.length === 0}
      title="Download all devices on this floor as CSV"
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-40 disabled:cursor-not-allowed"
      data-testid="devices-export-csv"
    >
      <Download size={12} aria-hidden="true" />
      <span>Export CSV</span>
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Devices"
        count={visibleDevices.length}
        actions={exportButton}
      />

      {allDevices.length === 0 ? (
        <PanelEmptyState
          icon={Wifi}
          title="No devices on this floor"
          body="Drop an access point, jack, display, or other infrastructure from the library to get started."
        />
      ) : (
        <>
          {/* Stat strip — totals per layer, unaffected by filters. */}
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-3 tabular-nums">
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                Network
              </span>{' '}
              {layerCounts.network}
            </span>
            <span aria-hidden>·</span>
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                AV
              </span>{' '}
              {layerCounts.av}
            </span>
            <span aria-hidden>·</span>
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                Security
              </span>{' '}
              {layerCounts.security}
            </span>
            <span aria-hidden>·</span>
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                Power
              </span>{' '}
              {layerCounts.power}
            </span>
          </div>

          {/* Search — focus ring matches the editor-wide standard so a
              keyboard user lands here from a tab cycle and gets a visible
              ring, not a 1px border-color shift that disappears against
              the dark-mode panel chrome. */}
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
              placeholder="Search by model, serial, MAC, or IP"
              aria-label="Search devices"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Layer pills */}
          <div
            className="flex gap-1.5 mb-2 flex-wrap"
            role="group"
            aria-label="Filter by layer"
          >
            {LAYER_PILLS.map((p) => {
              const active = layerFilter === p.id
              const count =
                p.id === 'all' ? allDevices.length : layerCounts[p.id]
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLayerFilter(p.id)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors tabular-nums ${
                    active
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Status pills */}
          <div
            className="flex gap-1 mb-3 flex-wrap"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_PILLS.map((p) => {
              const active = statusFilter === p.id
              const count =
                p.id === 'all'
                  ? allDevices.length
                  : allDevices.filter((el) => deviceStatusOf(el) === p.id).length
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(p.id)}
                  className={`px-2 py-0.5 text-[10px] rounded-full font-medium transition-colors tabular-nums ${
                    active
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                      : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {p.label} ({count})
                </button>
              )
            })}
          </div>

          {/* List */}
          <div
            className="flex-1 overflow-y-auto -mx-3 px-3"
            data-testid="devices-list"
          >
            {visibleDevices.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                No devices match your filters.
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {visibleDevices.map((el) => (
                  <DeviceRow
                    key={el.id}
                    element={el}
                    onClick={() => handleRowClick(el.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface DeviceRowProps {
  element: CanvasElement
  onClick: () => void
}

function DeviceRow({ element, onClick }: DeviceRowProps) {
  const Icon = TYPE_ICON[element.type] ?? Wifi
  const status = deviceStatusOf(element)
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={`device-row-${element.id}`}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 group text-left"
      >
        <span
          aria-hidden
          className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-500 dark:text-gray-400"
        >
          <Icon size={14} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {displayName(element)}
          </span>
          <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate tabular-nums">
            {summaryLine(element) || '—'}
          </span>
        </span>
        {status && <StatusPill status={status} />}
      </button>
    </li>
  )
}

function StatusPill({ status }: { status: string }) {
  // Color map matches the broader app's severity grammar: live=green
  // (good), installed=blue (neutral steady-state), planned=amber dashed
  // (forward-looking, not yet operational), broken=red filled (alarm),
  // decommissioned=gray (out of scope).
  const map: Record<string, string> = {
    live: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
    installed: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    planned:
      'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-dashed border-amber-300',
    broken: 'bg-red-500 text-white',
    decommissioned:
      'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  }
  const cls = map[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600'
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${cls}`}
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers — extract type-specific display fields without leaking the
// renderer-side type guards into the JSX above.
// ---------------------------------------------------------------------------

/** Pick the most informative display name. Falls back through the
 *  hierarchy `label > model > jackId > type` so every row has SOMETHING
 *  to read. */
function displayName(el: CanvasElement): string {
  if (el.label && el.label.trim() !== '') return el.label
  // type-narrowed reads via `in` so we don't import every interface
  if ('model' in el && typeof el.model === 'string' && el.model) return el.model
  if ('jackId' in el && typeof el.jackId === 'string' && el.jackId) return el.jackId
  return el.type
}

/** One-line summary used as the secondary text row. Shape varies per
 *  type to surface the most operationally-useful triplet. */
function summaryLine(el: CanvasElement): string {
  if (el.type === 'access-point') {
    const ap = el as AccessPointElement
    return [ap.model, ap.macAddress, ap.ipAddress].filter(Boolean).join(' · ')
  }
  if (el.type === 'network-jack') {
    const j = el as NetworkJackElement
    return [j.jackId, j.cableCategory].filter(Boolean).join(' · ')
  }
  if (el.type === 'display') {
    const d = el as DisplayElement
    const parts: string[] = []
    if (d.model) parts.push(d.model)
    if (d.screenSizeInches != null) parts.push(`${d.screenSizeInches}"`)
    if (d.connectedDevice) parts.push(d.connectedDevice)
    return parts.join(' · ')
  }
  if (el.type === 'video-bar') {
    const v = el as VideoBarElement
    return [v.model, v.platform, v.ipAddress].filter(Boolean).join(' · ')
  }
  if (el.type === 'badge-reader') {
    const b = el as BadgeReaderElement
    return [b.model, b.controlsDoorLabel].filter(Boolean).join(' · ')
  }
  if (el.type === 'outlet') {
    const o = el as OutletElement
    const parts: string[] = []
    if (o.outletType) parts.push(o.outletType)
    if (o.voltage != null) parts.push(`${o.voltage}V`)
    if (o.circuit) parts.push(o.circuit)
    return parts.join(' · ')
  }
  return ''
}

function deviceStatusOf(el: CanvasElement): string | null {
  if ('deviceStatus' in el && typeof el.deviceStatus === 'string') {
    return el.deviceStatus
  }
  return null
}

function matchesSearch(el: CanvasElement, q: string): boolean {
  // Concatenate every string-valued field worth searching into one
  // lower-cased haystack and substring-match. Faster than per-field
  // checks once the fan-out grows past a handful of fields, and the
  // O(N) cost is fine at our list sizes.
  const haystack: string[] = []
  if (el.label) haystack.push(el.label)
  if ('model' in el && typeof el.model === 'string') haystack.push(el.model)
  if ('serialNumber' in el && typeof el.serialNumber === 'string')
    haystack.push(el.serialNumber)
  if ('macAddress' in el && typeof el.macAddress === 'string')
    haystack.push(el.macAddress)
  if ('ipAddress' in el && typeof el.ipAddress === 'string')
    haystack.push(el.ipAddress)
  if ('vendor' in el && typeof el.vendor === 'string') haystack.push(el.vendor)
  if ('jackId' in el && typeof el.jackId === 'string') haystack.push(el.jackId)
  if ('connectedDevice' in el && typeof el.connectedDevice === 'string')
    haystack.push(el.connectedDevice)
  if ('upstreamSwitchLabel' in el && typeof el.upstreamSwitchLabel === 'string')
    haystack.push(el.upstreamSwitchLabel)
  if ('controlsDoorLabel' in el && typeof el.controlsDoorLabel === 'string')
    haystack.push(el.controlsDoorLabel)
  if ('platform' in el && typeof el.platform === 'string')
    haystack.push(el.platform)
  if ('circuit' in el && typeof el.circuit === 'string') haystack.push(el.circuit)
  return haystack.join(' ').toLowerCase().includes(q)
}
