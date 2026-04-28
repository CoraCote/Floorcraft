import type {
  MerakiDevice,
  MerakiDeviceStatus,
  MerakiNetwork,
  MerakiOrganization,
  MerakiSnapshot,
} from './types'

/**
 * M4 Phase A — Sample Meraki organization snapshot.
 *
 * Hand-crafted to look like a realistic mid-size SaaS office: 1
 * organization, 2 sites, 14 devices spread across MX (firewall), MS
 * (switches), and MR (wireless APs). Serials follow the Meraki
 * convention `QXXX-XXXX-XXXX` so the reconcile output reads naturally
 * and a user copy-pasting one into a search bar gets a recognisable
 * shape.
 *
 * The numbers approximate the Aircall Bellevue branch the topology
 * page is modelled after — close enough that a sync against a topology
 * built from the reference PDF lands a believable number of "matched"
 * rows when the user pre-populates serials.
 *
 * # Why hand-crafted (not recorded from a real call)
 *
 * Phase A doesn't talk to the live Dashboard API (Meraki blocks
 * browser CORS), so a recorded payload would just be noise. A curated
 * fixture also lets us deliberately seed a few interesting reconcile
 * scenarios in one snapshot (online + alerting + offline; one device
 * missing a name; tags the IT reader will recognise).
 */

const SAMPLE_ORG: MerakiOrganization = {
  id: 'org-1',
  name: 'Aircall Sample Org',
  url: 'https://n149.meraki.com/o/sample',
}

const SAMPLE_NETWORKS: MerakiNetwork[] = [
  {
    id: 'net-bellevue',
    organizationId: 'org-1',
    name: 'Bellevue HQ',
    tags: ['hq', 'production'],
    notes: 'Primary office network',
  },
  {
    id: 'net-paris',
    organizationId: 'org-1',
    name: 'Paris Branch',
    tags: ['branch'],
    notes: null,
  },
]

const SAMPLE_DEVICES: MerakiDevice[] = [
  // Bellevue HQ — MX firewall, two MS switches, four MR APs.
  {
    serial: 'Q2XX-AAAA-0001',
    name: 'BEL-MX-01',
    model: 'MX450',
    productType: 'appliance',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:01',
    firmware: 'wired-19-1-4',
    lanIp: '10.10.10.1',
    tags: ['hq', 'edge'],
  },
  {
    serial: 'Q2XX-BBBB-0002',
    name: 'BEL-CORE-01',
    model: 'MS150-24MP-4X',
    productType: 'switch',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:02',
    firmware: 'switch-19-1-2',
    lanIp: '10.10.10.2',
    tags: ['hq', 'core'],
  },
  {
    serial: 'Q2XX-BBBB-0003',
    name: 'BEL-EDGE-01',
    model: 'MS130-24X',
    productType: 'switch',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:03',
    firmware: 'switch-19-1-2',
    lanIp: '10.10.10.3',
    tags: ['hq', 'edge'],
  },
  {
    serial: 'Q2XX-CCCC-0004',
    name: 'BEL-AP-LOFT-01',
    model: 'CW9176I',
    productType: 'wireless',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:04',
    firmware: 'wireless-30-13-1',
    lanIp: '10.10.20.4',
    tags: ['hq', 'engineering'],
  },
  {
    serial: 'Q2XX-CCCC-0005',
    name: 'BEL-AP-LOFT-02',
    model: 'CW9176I',
    productType: 'wireless',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:05',
    firmware: 'wireless-30-13-1',
    lanIp: '10.10.20.5',
    tags: ['hq', 'engineering'],
  },
  {
    serial: 'Q2XX-CCCC-0006',
    name: 'BEL-AP-LEAD-01',
    model: 'CW9176I',
    productType: 'wireless',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:06',
    firmware: 'wireless-30-13-1',
    lanIp: '10.10.20.6',
    tags: ['hq', 'leadership'],
  },
  {
    // Deliberately unnamed — exercises the "fall back to model + serial"
    // branch in the reconcile label builder.
    serial: 'Q2XX-CCCC-0007',
    name: null,
    model: 'CW9176I',
    productType: 'wireless',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:07',
    firmware: 'wireless-30-13-1',
    lanIp: '10.10.20.7',
    tags: ['hq'],
  },
  // Paris Branch — MX cellular gateway, one switch, two APs.
  {
    serial: 'Q2YY-AAAA-0008',
    name: 'PAR-MG-01',
    model: 'MG41',
    productType: 'cellularGateway',
    networkId: 'net-paris',
    mac: '00:18:0a:00:00:08',
    firmware: 'cellular-3-1-3',
    lanIp: '10.20.10.1',
    tags: ['branch', 'failover'],
  },
  {
    serial: 'Q2YY-BBBB-0009',
    name: 'PAR-EDGE-01',
    model: 'MS130-8X',
    productType: 'switch',
    networkId: 'net-paris',
    mac: '00:18:0a:00:00:09',
    firmware: 'switch-19-1-2',
    lanIp: '10.20.10.2',
    tags: ['branch'],
  },
  {
    serial: 'Q2YY-CCCC-0010',
    name: 'PAR-AP-01',
    model: 'MR46',
    productType: 'wireless',
    networkId: 'net-paris',
    mac: '00:18:0a:00:00:0a',
    firmware: 'wireless-30-13-1',
    lanIp: '10.20.20.3',
    tags: ['branch'],
  },
  {
    serial: 'Q2YY-CCCC-0011',
    name: 'PAR-AP-02',
    model: 'MR46',
    productType: 'wireless',
    networkId: 'net-paris',
    mac: '00:18:0a:00:00:0b',
    firmware: 'wireless-30-13-1',
    lanIp: '10.20.20.4',
    tags: ['branch'],
  },
  // A camera + a sensor — both have no topology mapping; the reconcile
  // logic should surface these in the "skipped" bucket so the user
  // sees we're not silently dropping them.
  {
    serial: 'Q2ZZ-AAAA-0012',
    name: 'BEL-CAM-LOBBY',
    model: 'MV12',
    productType: 'camera',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:0c',
    firmware: 'camera-5-2-7',
    lanIp: '10.10.30.5',
    tags: ['hq'],
  },
  {
    serial: 'Q2ZZ-BBBB-0013',
    name: 'BEL-SENSOR-LOFT',
    model: 'MT12',
    productType: 'sensor',
    networkId: 'net-bellevue',
    mac: '00:18:0a:00:00:0d',
    firmware: 'sensor-1-3-0',
    lanIp: '10.10.30.6',
    tags: ['hq'],
  },
  // One more switch tagged "core" so the heuristic upgrade
  // (switch + tag includes 'core') maps it to `core-switch`.
  {
    serial: 'Q2YY-BBBB-0014',
    name: 'PAR-CORE-01',
    model: 'MS150-24MP-4X',
    productType: 'switch',
    networkId: 'net-paris',
    mac: '00:18:0a:00:00:0e',
    firmware: 'switch-19-1-2',
    lanIp: '10.20.10.5',
    tags: ['branch', 'core'],
  },
]

const SAMPLE_STATUSES: MerakiDeviceStatus[] = [
  // Mostly online so the reconcile output reads "live" for the import.
  // One offline + one alerting so the status-mapping branch is
  // exercised.
  { serial: 'Q2XX-AAAA-0001', status: 'online', lastReportedAt: '2026-04-27T18:30:00Z' },
  { serial: 'Q2XX-BBBB-0002', status: 'online', lastReportedAt: '2026-04-27T18:30:05Z' },
  { serial: 'Q2XX-BBBB-0003', status: 'online', lastReportedAt: '2026-04-27T18:30:10Z' },
  { serial: 'Q2XX-CCCC-0004', status: 'online', lastReportedAt: '2026-04-27T18:30:15Z' },
  { serial: 'Q2XX-CCCC-0005', status: 'alerting', lastReportedAt: '2026-04-27T18:30:20Z' },
  { serial: 'Q2XX-CCCC-0006', status: 'online', lastReportedAt: '2026-04-27T18:30:25Z' },
  { serial: 'Q2XX-CCCC-0007', status: 'online', lastReportedAt: '2026-04-27T18:30:30Z' },
  { serial: 'Q2YY-AAAA-0008', status: 'online', lastReportedAt: '2026-04-27T18:30:35Z' },
  { serial: 'Q2YY-BBBB-0009', status: 'online', lastReportedAt: '2026-04-27T18:30:40Z' },
  { serial: 'Q2YY-CCCC-0010', status: 'offline', lastReportedAt: '2026-04-27T15:30:45Z' },
  { serial: 'Q2YY-CCCC-0011', status: 'online', lastReportedAt: '2026-04-27T18:30:50Z' },
  { serial: 'Q2ZZ-AAAA-0012', status: 'online', lastReportedAt: '2026-04-27T18:30:55Z' },
  { serial: 'Q2ZZ-BBBB-0013', status: 'dormant', lastReportedAt: '2026-04-27T18:31:00Z' },
  { serial: 'Q2YY-BBBB-0014', status: 'online', lastReportedAt: '2026-04-27T18:31:05Z' },
]

/**
 * Build a deep clone of the sample snapshot. Every call returns a fresh
 * object graph so dialog state mutations (filtering, selection, etc.)
 * don't bleed back into the module-level constant. JSON round-trip is
 * the simplest, fastest way to clone our flat-shape data.
 */
export function loadSampleMerakiSnapshot(): MerakiSnapshot {
  return JSON.parse(
    JSON.stringify({
      organization: SAMPLE_ORG,
      networks: SAMPLE_NETWORKS,
      devices: SAMPLE_DEVICES,
      statuses: SAMPLE_STATUSES,
    } satisfies MerakiSnapshot),
  ) as MerakiSnapshot
}
