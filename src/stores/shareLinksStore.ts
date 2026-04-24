import { create } from 'zustand'
import type { ShareLink } from '../types/shareLinks'
import { buildShareUrl } from '../lib/shareLinkUrl'

/**
 * Local store of D6 view-only share links. Persisted as part of the office
 * payload (see `useOfficeSync`) so revocation state survives reloads and
 * co-editors see each other's tokens.
 *
 * The store is the canonical authority for token validity in the share-
 * view path: `isTokenValid` enforces not-revoked + not-expired + matching
 * office. Server-side enforcement lives in the RLS policy on the office
 * row and is outside the scope of this client module.
 */

interface ShareLinksState {
  links: Record<string, ShareLink>
  create: (
    officeId: string,
    ttlSeconds: number,
    label?: string,
    createdBy?: { id: string | null; name: string | null },
  ) => { link: ShareLink; url: string }
  revoke: (id: string) => void
  /**
   * Replace the whole map — used by `ProjectShell` when hydrating a fresh
   * office payload, so a previously-loaded office's links don't bleed
   * into the new one.
   */
  setLinks: (links: Record<string, ShareLink>) => void
  activeForOffice: (officeId: string) => ShareLink[]
  isTokenValid: (token: string, officeId?: string) => boolean
}

function generateToken(): string {
  // `crypto.randomUUID` gives 122 bits of entropy — plenty for an
  // unguessable bearer credential, and every supported browser exposes it
  // under window.crypto. Tests in jsdom also get it for free.
  return crypto.randomUUID()
}

export const useShareLinksStore = create<ShareLinksState>((set, get) => ({
  links: {},

  create: (officeId, ttlSeconds, label, createdBy) => {
    const now = new Date()
    const expires = new Date(now.getTime() + ttlSeconds * 1000)
    const id = crypto.randomUUID()
    const link: ShareLink = {
      id,
      token: generateToken(),
      officeId,
      createdBy: createdBy?.id ?? null,
      createdByName: createdBy?.name ?? null,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      revokedAt: null,
      label: label ?? null,
    }
    set((s) => ({ links: { ...s.links, [id]: link } }))
    return { link, url: buildShareUrl(officeId, link.token) }
  },

  revoke: (id) =>
    set((s) => {
      const existing = s.links[id]
      if (!existing || existing.revokedAt) return s
      return {
        links: {
          ...s.links,
          [id]: { ...existing, revokedAt: new Date().toISOString() },
        },
      }
    }),

  setLinks: (links) => set({ links }),

  activeForOffice: (officeId) => {
    const now = Date.now()
    return Object.values(get().links).filter((l) => {
      if (l.officeId !== officeId) return false
      if (l.revokedAt) return false
      if (new Date(l.expiresAt).getTime() <= now) return false
      return true
    })
  },

  isTokenValid: (token, officeId) => {
    const match = Object.values(get().links).find((l) => l.token === token)
    if (!match) return false
    if (match.revokedAt) return false
    if (new Date(match.expiresAt).getTime() <= Date.now()) return false
    if (officeId && match.officeId !== officeId) return false
    return true
  },
}))

/**
 * Common TTL presets for the dialog radio group. Exported so the dialog
 * and tests share one definition.
 */
export const SHARE_LINK_TTL_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 60 * 60 * 24 },
  { label: '7 days', seconds: 60 * 60 * 24 * 7 },
  { label: '30 days', seconds: 60 * 60 * 24 * 30 },
]
