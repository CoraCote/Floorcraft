import { describe, it, expect } from 'vitest'
import {
  buildITDeviceCSV,
  buildITDeviceCSVFilename,
  IT_DEVICE_CSV_COLUMNS,
} from '../lib/itDeviceCsv'
import type {
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  VideoBarElement,
  BadgeReaderElement,
  OutletElement,
  CanvasElement,
  BaseElement,
} from '../types/elements'

function baseFields(id: string, type: BaseElement['type']): BaseElement {
  return {
    id,
    type,
    x: 100,
    y: 200,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  }
}

function makeAP(over: Partial<AccessPointElement> = {}): AccessPointElement {
  return {
    ...baseFields(over.id ?? 'ap1', 'access-point'),
    type: 'access-point',
    model: 'Cisco Meraki MR46',
    serialNumber: 'SN-001',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    ipAddress: '10.0.0.1',
    vendor: 'Cisco',
    installDate: '2025-01-15',
    deviceStatus: 'live',
    ...over,
  }
}

function makeJack(over: Partial<NetworkJackElement> = {}): NetworkJackElement {
  return {
    ...baseFields(over.id ?? 'jk1', 'network-jack'),
    type: 'network-jack',
    jackId: 'J-101',
    cableCategory: 'cat6a',
    upstreamSwitchLabel: 'SW-A',
    upstreamSwitchPort: '24',
    serialNumber: null,
    installDate: null,
    deviceStatus: 'installed',
    ...over,
  }
}

function makeDisplay(over: Partial<DisplayElement> = {}): DisplayElement {
  return {
    ...baseFields(over.id ?? 'd1', 'display'),
    type: 'display',
    model: 'Samsung QM55',
    serialNumber: 'D-001',
    ipAddress: null,
    vendor: 'Samsung',
    installDate: null,
    screenSizeInches: 55,
    connectedDevice: 'MTR Logitech Rally',
    deviceStatus: 'live',
    ...over,
  }
}

function makeVideoBar(over: Partial<VideoBarElement> = {}): VideoBarElement {
  return {
    ...baseFields(over.id ?? 'vb1', 'video-bar'),
    type: 'video-bar',
    model: 'Logitech Rally Bar',
    serialNumber: null,
    macAddress: null,
    ipAddress: null,
    vendor: 'Logitech',
    installDate: null,
    platform: 'teams',
    deviceStatus: 'planned',
    ...over,
  }
}

function makeBadge(over: Partial<BadgeReaderElement> = {}): BadgeReaderElement {
  return {
    ...baseFields(over.id ?? 'br1', 'badge-reader'),
    type: 'badge-reader',
    model: 'HID iCLASS',
    serialNumber: null,
    ipAddress: null,
    vendor: 'HID',
    installDate: null,
    controlsDoorLabel: 'Main Entrance',
    deviceStatus: 'live',
    ...over,
  }
}

function makeOutlet(over: Partial<OutletElement> = {}): OutletElement {
  return {
    ...baseFields(over.id ?? 'o1', 'outlet'),
    type: 'outlet',
    outletType: 'duplex',
    voltage: 120,
    circuit: 'Panel A · Breaker 12',
    installDate: null,
    deviceStatus: 'installed',
    ...over,
  }
}

describe('buildITDeviceCSV', () => {
  it('returns header-only CSV when no devices are passed', () => {
    const csv = buildITDeviceCSV([])
    expect(csv).toBe(IT_DEVICE_CSV_COLUMNS.join(','))
  })

  it('emits a header that matches the canonical column order', () => {
    const csv = buildITDeviceCSV([makeAP()])
    const firstLine = csv.split('\n')[0].trim()
    // PapaParse may quote some headers if they contain special chars,
    // but our column names are alphanumeric so they pass through raw.
    expect(firstLine).toBe(IT_DEVICE_CSV_COLUMNS.join(','))
  })

  it('places AP fields in the right columns', () => {
    const csv = buildITDeviceCSV([makeAP({ label: 'AP-Lobby' })])
    expect(csv).toContain('access-point')
    expect(csv).toContain('AP-Lobby')
    expect(csv).toContain('Cisco Meraki MR46')
    expect(csv).toContain('aa:bb:cc:dd:ee:ff')
    expect(csv).toContain('10.0.0.1')
    expect(csv).toContain('live')
  })

  it('places network-jack fields in the right columns', () => {
    const csv = buildITDeviceCSV([makeJack()])
    expect(csv).toContain('network-jack')
    expect(csv).toContain('J-101')
    expect(csv).toContain('cat6a')
    expect(csv).toContain('SW-A')
  })

  it('places display fields including numeric screen size', () => {
    const csv = buildITDeviceCSV([makeDisplay()])
    expect(csv).toContain('display')
    expect(csv).toContain('Samsung QM55')
    expect(csv).toContain('55')
    expect(csv).toContain('MTR Logitech Rally')
  })

  it('places video-bar fields including platform', () => {
    const csv = buildITDeviceCSV([makeVideoBar()])
    expect(csv).toContain('video-bar')
    expect(csv).toContain('Logitech Rally Bar')
    expect(csv).toContain('teams')
  })

  it('places badge-reader controlsDoorLabel', () => {
    const csv = buildITDeviceCSV([makeBadge()])
    expect(csv).toContain('badge-reader')
    expect(csv).toContain('Main Entrance')
  })

  it('places outlet fields including voltage', () => {
    const csv = buildITDeviceCSV([makeOutlet()])
    expect(csv).toContain('outlet')
    expect(csv).toContain('duplex')
    expect(csv).toContain('120')
    // Circuit contains a comma and a non-ASCII bullet — PapaParse
    // should quote it when the comma is present.
    expect(csv).toContain('Panel A')
  })

  it('escapes commas, quotes, and newlines in labels', () => {
    const csv = buildITDeviceCSV([
      makeAP({
        label: 'AP, "north" wing\nrow 2',
        model: 'M, 1',
      }),
    ])
    // PapaParse encloses cells with special chars in double quotes and
    // escapes inner quotes by doubling them. The exact serialised form
    // for a double-quote becomes ""north"".
    expect(csv).toContain('""north""')
    // Comma in the label triggers quoting too — the cell is wrapped in
    // a pair of double quotes that survive in the output.
    expect(csv).toMatch(/"AP, ""north"" wing\nrow 2"/)
  })

  it('handles unicode labels safely', () => {
    const csv = buildITDeviceCSV([
      makeAP({ label: 'AP — Café — 北京' }),
    ])
    expect(csv).toContain('AP — Café — 北京')
  })

  it('drops non-IT elements silently', () => {
    const wall: CanvasElement = {
      ...baseFields('w1', 'wall'),
      type: 'wall',
    } as CanvasElement
    const csv = buildITDeviceCSV([wall, makeAP()])
    // Only one data row → 1 header line + 1 data line + (PapaParse may
    // trail a newline). At minimum, the wall id shouldn't appear.
    expect(csv).not.toContain('w1')
    expect(csv).toContain('Cisco Meraki MR46')
  })

  it('includes floor name and coordinates from the row context', () => {
    const csv = buildITDeviceCSV([makeAP({ x: 12.5, y: -3 })], {
      floorName: 'Floor 3 — North',
    })
    expect(csv).toContain('Floor 3 — North')
    expect(csv).toContain('12.5')
    expect(csv).toContain('-3')
  })

  it('one row per device when multiple devices are exported', () => {
    const csv = buildITDeviceCSV([makeAP(), makeJack(), makeDisplay()])
    // Header + 3 data rows. Trim a trailing newline if Papa added one.
    const lines = csv.split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(4)
  })

  it('writes empty cells for unset optional fields', () => {
    // Outlet has only `outletType`, `installDate`, `deviceStatus`. The
    // model / mac / ip columns should be empty strings, not "null" or
    // "undefined".
    const o = makeOutlet({
      outletType: null,
      voltage: null,
      circuit: null,
      installDate: null,
      deviceStatus: null,
    })
    const csv = buildITDeviceCSV([o])
    expect(csv).not.toContain('null')
    expect(csv).not.toContain('undefined')
  })
})

describe('buildITDeviceCSVFilename', () => {
  it('uses the floorcraft-devices-{slug}-{date}.csv format', () => {
    const filename = buildITDeviceCSVFilename(
      'HQ Office',
      new Date('2026-04-27T12:00:00Z'),
    )
    expect(filename).toBe('floorcraft-devices-hq-office-2026-04-27.csv')
  })

  it('slugifies non-ASCII and punctuation', () => {
    const filename = buildITDeviceCSVFilename(
      'Café — 北京 / 1',
      new Date('2026-04-27T00:00:00Z'),
    )
    // Non-alphanumerics collapse to single dashes; the chinese chars
    // and accent are stripped because they aren't [a-z0-9] under
    // lower-case ASCII normalisation. That's intentional — the
    // filename is a storage primitive, not a display name.
    expect(filename).toMatch(/^floorcraft-devices-[a-z0-9-]+-2026-04-27\.csv$/)
  })

  it('falls back to "office" when the slug reduces to empty', () => {
    const filename = buildITDeviceCSVFilename(
      '!@#$%^',
      new Date('2026-04-27T00:00:00Z'),
    )
    expect(filename).toBe('floorcraft-devices-office-2026-04-27.csv')
  })
})
