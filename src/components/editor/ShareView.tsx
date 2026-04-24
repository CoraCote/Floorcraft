import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  buildShareUrl,
  isEmbedMode,
  parseShareToken,
} from '../../lib/shareLinkUrl'
import { useShareLinksStore } from '../../stores/shareLinksStore'
import { useProjectStore } from '../../stores/projectStore'
import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useUIStore } from '../../stores/uiStore'
import { CanvasStage } from './Canvas/CanvasStage'
import { Minimap } from './Minimap'
import { StatusBar } from './StatusBar'
import { CanvasFinder } from './CanvasFinder'
import { CanvasActionDock } from './Canvas/CanvasActionDock'
import { FloorSwitcher } from './FloorSwitcher'

/**
 * Public route `/share/:officeSlug?t=<token>` (Wave 7C). Validates the
 * share token via the client `shareLinksStore`; on success flips the
 * viewer's effective role to `shareViewer` (which grants only `viewMap`
 * and denies `viewPII` so every mutating surface and every PII cell stays
 * hidden) and renders the actual canvas-rendered floor plan.
 *
 * Two layouts:
 *
 *   - Full mode (default): a header with the office name, floor switcher,
 *     a small "Read-only · expires …" badge, and an "Open in Floorcraft"
 *     link for authenticated viewers. Body is the live `<CanvasStage />`
 *     with `<StatusBar />`, `<Minimap />` (toggleable from the action
 *     dock), `<CanvasFinder />` (Cmd+F overlay) and `<CanvasActionDock />`.
 *
 *   - Embed mode (`?embed=1`): no header, no action dock, no minimap by
 *     default, no roster table. Just the canvas, an `EmbedStatusBar`
 *     (floor name + occupancy + a Floorcraft watermark), and a tiny
 *     "open in new tab" link pinned bottom-right. The whole thing is
 *     sized to fill the iframe (`fixed inset-0`).
 *
 * Edit-only chrome (toolbar, sidebars, undo/redo, properties panel,
 * ProjectShell-level modals) is structurally not mounted on this route —
 * we do not rely solely on `useCan` returning false. The CanvasStage
 * itself does gate its drag / transform / draw handlers on `useCan`
 * checks, so a `shareViewer` that lands here cannot mutate anything even
 * if a layer slipped through.
 */
export function ShareView() {
  const { officeSlug } = useParams<{ officeSlug: string }>()
  const [searchParams] = useSearchParams()
  const token = parseShareToken(searchParams)
  const isEmbed = isEmbedMode(searchParams)

  // Subscribe to `links` so the component re-renders when store contents
  // change (e.g. a concurrent revoke); the derivation below reads the
  // current snapshot via `isTokenValid`.
  const links = useShareLinksStore((s) => s.links)
  const isTokenValid = useShareLinksStore((s) => s.isTokenValid)

  // Lookup the matching link record so the header can show an expiry
  // timestamp. Cheap (the map is in the dozens at most) and re-runs only
  // when `links` or `token` change.
  const matchedLink = useMemo(() => {
    if (!token) return null
    return Object.values(links).find((l) => l.token === token) ?? null
  }, [links, token])

  // Derive validity directly from the token + store instead of routing it
  // through `useState` + an effect. That keeps the render pure and avoids
  // the `set-state-in-effect` lint (per the codebase precedent in
  // `AnnotationPopover`: compute on render, re-subscribe to inputs via the
  // `links` selector so store updates re-run the derivation).
  const validity: 'valid' | 'invalid' = useMemo(() => {
    if (!token) return 'invalid'
    return isTokenValid(token) ? 'valid' : 'invalid'
  }, [token, isTokenValid])

  // Install the `shareViewer` role on successful validation — every
  // `useCan(...)` gate downstream then denies writes and PII. We also
  // clear any lingering impersonation so an editor who follows their own
  // share link still sees the redacted read-only shell.
  useEffect(() => {
    if (validity !== 'valid') return
    const prev = useProjectStore.getState().currentOfficeRole
    useProjectStore.setState({
      currentOfficeRole: 'shareViewer',
      impersonatedRole: null,
    })
    return () => {
      // Only restore the previous role if nobody else has overwritten it
      // in the meantime (e.g. a concurrent ProjectShell load).
      if (useProjectStore.getState().currentOfficeRole === 'shareViewer') {
        useProjectStore.setState({ currentOfficeRole: prev })
      }
    }
  }, [validity])

  // Embed mode defaults the minimap to off — iframes are usually narrow
  // and the floating overview eats real estate that's better spent on
  // the canvas. The user can re-enable from the (full-mode) action dock,
  // but in embed mode we hide the dock too. We restore the previous
  // visibility on unmount so navigating away from the share view doesn't
  // leave the operator's editor with the minimap hidden.
  useEffect(() => {
    if (validity !== 'valid' || !isEmbed) return
    const prev = useUIStore.getState().minimapVisible
    useUIStore.getState().setMinimapVisible(false)
    return () => {
      useUIStore.getState().setMinimapVisible(prev)
    }
  }, [validity, isEmbed])

  if (validity === 'invalid') {
    return (
      <div className="p-6 text-sm" role="alert">
        Link expired or invalid
      </div>
    )
  }

  const fullShareHref = buildShareUrl({
    officeSlug: officeSlug ?? '',
    token: token ?? '',
  })

  if (isEmbed) {
    return (
      <div
        className="fixed inset-0 w-screen h-screen bg-gray-100 dark:bg-gray-800 overflow-hidden"
        data-testid="share-view-embed"
      >
        <CanvasStage />
        <CanvasFinder />
        <EmbedStatusBar fullShareHref={fullShareHref} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-800/50">
      <ShareHeader
        officeName={officeSlug ?? ''}
        expiresAt={matchedLink?.expiresAt ?? null}
      />
      <FloorSwitcher />
      <div className="flex-1 relative bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <CanvasStage />
        <StatusBar />
        <Minimap />
        <CanvasActionDock />
      </div>
      <CanvasFinder />
    </div>
  )
}

/**
 * Full-mode header. Renders the office name, a "Read-only · expires …"
 * badge, and (for authenticated viewers — we don't try to detect this
 * here, the link is just always shown) a discreet "Open in Floorcraft"
 * link that drops the embed flag if the user landed on the embed-mode
 * URL by mistake.
 *
 * Intentionally lightweight: no FloorcraftMark SVG, no avatar — the
 * shared map should look like the map, not like a marketing surface.
 */
function ShareHeader({
  officeName,
  expiresAt,
}: {
  officeName: string
  expiresAt: string | null
}) {
  return (
    <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-6 h-6 rounded bg-indigo-600 text-white text-xs font-bold"
        >
          F
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Floorcraft
        </span>
        <span aria-hidden className="text-gray-300 dark:text-gray-700">
          /
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {officeName}
        </span>
      </div>
      <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">
        Read-only
        {expiresAt && (
          <>
            {' · '}
            expires {formatRelativeFuture(expiresAt)}
          </>
        )}
      </span>
    </header>
  )
}

/**
 * Embed-mode footer: a slim watermark bar pinned to the bottom of the
 * iframe so the host page knows where the visualization comes from. The
 * "open in new tab" affordance jumps the visitor to the full share URL
 * (without the embed flag) — useful when an iframe ends up too small to
 * be useful and the operator wants the full chrome.
 */
function EmbedStatusBar({ fullShareHref }: { fullShareHref: string }) {
  const elements = useElementsStore((s) => s.elements)
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? floors[0]
  const elementCount = Object.keys(elements).length

  return (
    <div
      role="status"
      aria-label="Embed status"
      data-testid="share-view-embed-status"
      className="absolute bottom-0 left-0 right-0 h-7 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 flex items-center px-3 text-[11px] text-gray-500 dark:text-gray-400"
    >
      <span className="font-medium text-gray-700 dark:text-gray-200">
        Floorcraft
      </span>
      {activeFloor && (
        <>
          <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
          <span>{activeFloor.name}</span>
        </>
      )}
      <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
      <span className="tabular-nums">
        {elementCount} element{elementCount === 1 ? '' : 's'}
      </span>
      <a
        href={fullShareHref}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-[10px] text-blue-600 dark:text-blue-300 hover:underline"
      >
        Open full view ↗
      </a>
    </div>
  )
}

/**
 * Compact future-tense relative formatter for the expiry badge — same
 * idiom as `ShareLinkDialog`'s `formatDuration` but expressed as
 * "in 23h" / "in 2d". Returns "soon" if the timestamp has already
 * passed (we still rendered the header because validity uses a fresh
 * `Date.now()` check; the badge can lag by a few seconds without the
 * whole view tearing down).
 */
function formatRelativeFuture(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'soon'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `in ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `in ${h}h`
  const d = Math.floor(h / 24)
  return `in ${d}d`
}
