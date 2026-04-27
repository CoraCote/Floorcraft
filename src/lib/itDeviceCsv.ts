import Papa from 'papaparse'
import type {
  CanvasElement,
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  VideoBarElement,
  BadgeReaderElement,
  OutletElement,
} from '../types/elements'
import {
  isAccessPointElement,
  isNetworkJackElement,
  isDisplayElement,
  isVideoBarElement,
  isBadgeReaderElement,
  isOutletElement,
  isITDevice,
} from '../types/elements'

/**
 * # IT-device CSV export
 *
 * One row per IT device on the active floor, columns covering every
 * type-specific field across the six device interfaces (AP / jack /
 * display / video bar / badge reader / outlet). Empty cells are fine —
 * a column that doesn't apply to the row's device type stays blank.
 *
 * # Why a single wide table instead of one CSV per device type?
 *
 * Real-world CMDB importers (ServiceNow, Lansweeper, custom Notion
 * databases) prefer one input file. Splitting the export by device type
 * forces operators to merge our six files back together before they can
 * ingest. Wide-table-with-blanks costs us a few empty cells; one-file-
 * per-type costs the user a manual merge step every time they sync. The
 * cell math wins.
 *
 * # Why include `floorName`, `x`, `y` at all?
 *
 * Downstream tooling slots devices into rooms or "places" in the CMDB
 * graph. Without a floor + coordinate the operator has to look the
 * device up in Floorcraft to remember where it lives. The floor name is
 * human-readable; the x/y are canvas-native units (post-M1 they're not
 * lat/long, but a CMDB doesn't need geo precision — it needs "this AP is
 * in the southwest corner of Floor 3" and (x, y) on a known canvas
 * scale gets us there).
 *
 * # Round-trip
 *
 * This export is NOT designed for re-import. The library spawn flow (M2)
 * is the source of truth for device placement; CSV editing flows back
 * through that. Keeping export one-way means we don't have to define a
 * stable ID column or handle stale-ID resolution on import — concerns
 * that weren't load-bearing for the M3 milestone.
 *
 * # Special-character escaping
 *
 * PapaParse handles quoting, comma escaping, and embedded-newline
 * escaping for us. We rely on that rather than rolling our own — the
 * employee CSV pipeline does the same, and we share its `downloadCSV`
 * helper so behaviour stays identical.
 */

/** Canonical column order. Centralised so both the unparser and the
 *  test that asserts the header row read from one source. */
export const IT_DEVICE_CSV_COLUMNS = [
  'type',
  'label',
  'model',
  'serialNumber',
  'macAddress',
  'ipAddress',
  'vendor',
  'installDate',
  'deviceStatus',
  // Network-jack-specific
  'jackId',
  'cableCategory',
  'upstreamSwitchLabel',
  'upstreamSwitchPort',
  // Display-specific
  'screenSizeInches',
  'connectedDevice',
  // Video-bar-specific
  'platform',
  // Badge-reader-specific
  'controlsDoorLabel',
  // Outlet-specific
  'outletType',
  'voltage',
  'circuit',
  // Locator
  'floorName',
  'x',
  'y',
] as const

export type ITDeviceCSVColumn = (typeof IT_DEVICE_CSV_COLUMNS)[number]

export interface ITDeviceCSVRowContext {
  /** Active floor's display name. Empty string if unknown. */
  floorName: string
}

/**
 * Build the CSV body. `devices` should already be filtered to IT
 * devices; non-IT entries are silently dropped (defensive — callers can
 * pass a raw element list and we'll do the right thing).
 *
 * Returns a header-only CSV when no devices are passed, so an empty
 * export still downloads a file the user can recognise as "the column
 * shape Floorcraft expects".
 */
export function buildITDeviceCSV(
  devices: CanvasElement[],
  ctx: ITDeviceCSVRowContext = { floorName: '' },
): string {
  const rows = devices
    .filter(isITDevice)
    .map((el) => deviceToRow(el, ctx))

  if (rows.length === 0) {
    // PapaParse drops the header row when there's no data, even with
    // `columns:` set. Emit it ourselves so an empty floor still produces
    // a usable CSV (downstream importers parse the header to validate
    // the column shape before complaining about zero rows).
    return IT_DEVICE_CSV_COLUMNS.join(',')
  }

  return Papa.unparse(rows, {
    header: true,
    columns: [...IT_DEVICE_CSV_COLUMNS],
  })
}

/**
 * Project one element into the row shape. Each branch handles its own
 * type-specific fields; shared fields (`label`, `x`, `y`,
 * `installDate`, `deviceStatus`) are pulled at the top.
 *
 * `null` and `undefined` collapse to '' so PapaParse doesn't emit a
 * literal "null" or "undefined" string. Numbers (`screenSizeInches`,
 * `voltage`, `x`, `y`) are stringified by `String()` rather than left as
 * numbers because PapaParse's `columns` mode coerces values via the
 * Object's own toString anyway, and explicit conversion makes the test
 * matchers cleaner.
 */
function deviceToRow(
  el: CanvasElement,
  ctx: ITDeviceCSVRowContext,
): Record<ITDeviceCSVColumn, string> {
  const row: Record<ITDeviceCSVColumn, string> = {
    type: el.type,
    label: el.label ?? '',
    model: '',
    serialNumber: '',
    macAddress: '',
    ipAddress: '',
    vendor: '',
    installDate: '',
    deviceStatus: '',
    jackId: '',
    cableCategory: '',
    upstreamSwitchLabel: '',
    upstreamSwitchPort: '',
    screenSizeInches: '',
    connectedDevice: '',
    platform: '',
    controlsDoorLabel: '',
    outletType: '',
    voltage: '',
    circuit: '',
    floorName: ctx.floorName,
    x: String(el.x ?? ''),
    y: String(el.y ?? ''),
  }

  if (isAccessPointElement(el)) {
    fillAccessPoint(row, el)
  } else if (isNetworkJackElement(el)) {
    fillNetworkJack(row, el)
  } else if (isDisplayElement(el)) {
    fillDisplay(row, el)
  } else if (isVideoBarElement(el)) {
    fillVideoBar(row, el)
  } else if (isBadgeReaderElement(el)) {
    fillBadgeReader(row, el)
  } else if (isOutletElement(el)) {
    fillOutlet(row, el)
  }

  return row
}

function fillAccessPoint(
  row: Record<ITDeviceCSVColumn, string>,
  el: AccessPointElement,
): void {
  row.model = el.model ?? ''
  row.serialNumber = el.serialNumber ?? ''
  row.macAddress = el.macAddress ?? ''
  row.ipAddress = el.ipAddress ?? ''
  row.vendor = el.vendor ?? ''
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
}

function fillNetworkJack(
  row: Record<ITDeviceCSVColumn, string>,
  el: NetworkJackElement,
): void {
  row.serialNumber = el.serialNumber ?? ''
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
  row.jackId = el.jackId ?? ''
  row.cableCategory = el.cableCategory ?? ''
  row.upstreamSwitchLabel = el.upstreamSwitchLabel ?? ''
  row.upstreamSwitchPort = el.upstreamSwitchPort ?? ''
}

function fillDisplay(
  row: Record<ITDeviceCSVColumn, string>,
  el: DisplayElement,
): void {
  row.model = el.model ?? ''
  row.serialNumber = el.serialNumber ?? ''
  row.ipAddress = el.ipAddress ?? ''
  row.vendor = el.vendor ?? ''
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
  row.screenSizeInches =
    el.screenSizeInches !== undefined && el.screenSizeInches !== null
      ? String(el.screenSizeInches)
      : ''
  row.connectedDevice = el.connectedDevice ?? ''
}

function fillVideoBar(
  row: Record<ITDeviceCSVColumn, string>,
  el: VideoBarElement,
): void {
  row.model = el.model ?? ''
  row.serialNumber = el.serialNumber ?? ''
  row.macAddress = el.macAddress ?? ''
  row.ipAddress = el.ipAddress ?? ''
  row.vendor = el.vendor ?? ''
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
  row.platform = el.platform ?? ''
}

function fillBadgeReader(
  row: Record<ITDeviceCSVColumn, string>,
  el: BadgeReaderElement,
): void {
  row.model = el.model ?? ''
  row.serialNumber = el.serialNumber ?? ''
  row.ipAddress = el.ipAddress ?? ''
  row.vendor = el.vendor ?? ''
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
  row.controlsDoorLabel = el.controlsDoorLabel ?? ''
}

function fillOutlet(
  row: Record<ITDeviceCSVColumn, string>,
  el: OutletElement,
): void {
  row.installDate = el.installDate ?? ''
  row.deviceStatus = el.deviceStatus ?? ''
  row.outletType = el.outletType ?? ''
  row.voltage =
    el.voltage !== undefined && el.voltage !== null
      ? String(el.voltage)
      : ''
  row.circuit = el.circuit ?? ''
}

/**
 * Build the canonical filename for a devices CSV download. Pattern:
 *
 *   floorcraft-devices-{slug}-{YYYY-MM-DD}.csv
 *
 * `slug` is a URL-safe rendering of the office (or fallback floor) name
 * — lowercase, spaces collapsed to `-`, every other non-alphanumeric
 * stripped. Matches the visual idiom of the existing employee CSV
 * filename so users have one mental model for "Floorcraft data export".
 *
 * If `slug` reduces to the empty string (e.g. the office name was only
 * punctuation) we substitute `office` so the filename never collapses
 * to two adjacent dashes.
 */
export function buildITDeviceCSVFilename(
  officeOrFloorName: string,
  date: Date = new Date(),
): string {
  const slug = slugify(officeOrFloorName) || 'office'
  const ymd = date.toISOString().slice(0, 10)
  return `floorcraft-devices-${slug}-${ymd}.csv`
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
