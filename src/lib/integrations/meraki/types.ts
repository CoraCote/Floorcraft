/**
 * M4 — Cisco Meraki Dashboard API types.
 *
 * # Why our own types
 *
 * Meraki ships an OpenAPI spec at api.meraki.com/api/v1/openapi.spec, but
 * generating types from it would land us a 500-endpoint surface for what's
 * really a tiny subset (organizations + devices + statuses for the
 * read-only sync). We hand-curate the slice we use so the shape stays
 * tight, the import surface stays browser-friendly, and a future Phase B
 * proxy doesn't have to re-derive types every time the upstream spec
 * shifts.
 *
 * # Phase A vs Phase B
 *
 * Phase A (this milestone) is fixture-only: the same shapes load from
 * `fixtures.ts` so users can validate the import workflow before we
 * build the proxy + key-storage infrastructure that real API calls need
 * (Meraki's Dashboard API doesn't allow browser CORS — see the agent
 * scoping report). Phase B will swap the fixture loader for a typed
 * client that calls a Netlify edge function or Supabase function which
 * holds the team's API key server-side.
 *
 * # Status mapping
 *
 * Meraki's `deviceStatus.status` enum is `online | offline | alerting |
 * dormant`. We collapse it onto our existing `TopologyNodeStatus`
 * (planned/installed/live/decommissioned/broken) at reconcile time, not
 * here, so a future change to the topology status enum doesn't ripple
 * into the integration types.
 */

/**
 * Meraki organization. The user-visible billing + access boundary in the
 * Dashboard. A team will typically have exactly one, occasionally two
 * (e.g. legacy + new tenant). We surface a picker only when more than
 * one exists.
 */
export interface MerakiOrganization {
  id: string
  name: string
  /** Hostname Meraki returns for direct dashboard links — e.g. `n123.meraki.com`. */
  url?: string
}

/**
 * Meraki network — a logical site / branch within an organization.
 * Devices belong to networks, networks belong to organizations. We use
 * the network name as a sensible default for any "site" annotation we
 * surface in the topology label.
 */
export interface MerakiNetwork {
  id: string
  organizationId: string
  name: string
  /**
   * Comma-separated tags Meraki carries on networks (e.g. "branch",
   * "sandbox"). Round-tripped onto topology node `notes` so the user
   * doesn't lose context — but the tags themselves don't drive any
   * topology behavior in Phase A.
   */
  tags?: string[]
  /** Free-text site label set in the dashboard. Useful as a notes hint. */
  notes?: string | null
}

/**
 * Meraki productType — narrow enum the Dashboard API uses to discriminate
 * device categories. Source-of-truth values pulled from the Meraki API
 * docs (https://developer.cisco.com/meraki/api-v1/get-organization-devices/).
 *
 * - `appliance`        — MX security appliance (firewall + WAN router)
 * - `switch`           — MS series stacking + access switches
 * - `wireless`         — MR series Wi-Fi access points
 * - `camera`           — MV series cameras (no topology mapping today)
 * - `sensor`           — MT environmental sensors (no mapping)
 * - `cellularGateway`  — MG series cellular gateways (treated as firewall)
 *
 * Future Meraki product lines (e.g. `secureConnect`) would land here
 * before getting reconcile mappings.
 */
export type MerakiProductType =
  | 'appliance'
  | 'switch'
  | 'wireless'
  | 'camera'
  | 'sensor'
  | 'cellularGateway'

/**
 * Meraki device — what `GET /organizations/{orgId}/devices` returns.
 * The real upstream payload has ~25 fields; we keep the ones the
 * reconcile + UI flows actually consume. Unknown fields land in
 * `_raw` so a Phase B integration test can assert against them
 * without forcing a type widening.
 */
export interface MerakiDevice {
  /**
   * Hardware serial number — the join key with our topology. Meraki
   * serials are uppercase 12-char codes like `Q2XX-XXXX-XXXX`; we
   * treat them as opaque strings.
   */
  serial: string
  name: string | null
  model: string
  productType: MerakiProductType
  networkId: string | null
  /** MAC, if Meraki provides it — surfaced in notes for the IT reader. */
  mac?: string | null
  /** Firmware version, surfaced in notes. */
  firmware?: string | null
  /** Lan IP, surfaced in notes. */
  lanIp?: string | null
  /** Free-form tags from the dashboard. Round-tripped onto topology `notes`. */
  tags?: string[]
}

/**
 * Meraki device-status — what `GET /organizations/{orgId}/devices/statuses`
 * returns. Joined to `MerakiDevice` by `serial` at reconcile time.
 * `lastReportedAt` is an ISO8601 string in the upstream payload.
 */
export type MerakiDeviceLiveStatus = 'online' | 'offline' | 'alerting' | 'dormant'

export interface MerakiDeviceStatus {
  serial: string
  status: MerakiDeviceLiveStatus
  lastReportedAt: string | null
}

/**
 * Convenience aggregate: an organization snapshot the dialog can render
 * without juggling four parallel arrays. The fixture loader returns
 * exactly this shape; a Phase B real client will fan-out four GETs
 * and stitch them into the same shape so callers don't care.
 */
export interface MerakiSnapshot {
  organization: MerakiOrganization
  networks: MerakiNetwork[]
  devices: MerakiDevice[]
  statuses: MerakiDeviceStatus[]
}
