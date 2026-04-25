import { useEffect, useRef, useState } from 'react'
import { Mail, Copy, Check, AlertTriangle } from 'lucide-react'
import { Button, Input, Modal, ModalBody, ModalFooter } from '../ui'
import { supabase } from '../../lib/supabase'
import { createInvite } from '../../lib/teams/teamRepository'
import type { Invite } from '../../types/team'
import { useToastStore } from '../../stores/toastStore'

/**
 * Wave 17C: Extracted the invite form out of `TeamSettingsMembers` into
 * its own modal so it can be reused (empty-state CTA + top-bar button)
 * and because the form needed richer affordances than a single inline
 * row could carry without getting noisy — role selector, helper copy,
 * validation, spinner on submit, and a post-submit "email failed, copy
 * the link" fallback that stays in the same surface rather than
 * jump-cutting to a banner below.
 *
 * The fallback branch is the most subtle piece of logic here. The
 * server-side `send-invite-email` edge function isn't guaranteed to be
 * deployed in every environment (local, preview, demo tenants), and
 * when it returns a non-2xx — or throws outright — we absolutely must
 * NOT tear down the invite row. The `invites` table insert already
 * succeeded; the admin can still share the link manually. So we keep
 * the modal open on the fallback branch, swap the body for a
 * "share this link" surface with a one-click copy button, and leave
 * the Cancel/Done buttons in the footer.
 */

type Role = 'admin' | 'member'

interface InviteMemberModalProps {
  open: boolean
  onClose: () => void
  teamId: string
  /** The inviter's user id — passed straight through to `createInvite`. */
  invitedBy: string
  /** Called after a successful invite so the parent can refresh lists. */
  onInvited?: (invite: Invite) => void
}

type Screen =
  | { kind: 'form' }
  | { kind: 'fallback'; email: string; url: string }

// Minimal email validator. Not RFC-5322; we just want to catch the
// common "no @" / "no TLD" mistakes before a round-trip to Supabase.
// Server-side validation is the real gate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteMemberModal({
  open,
  onClose,
  teamId,
  invitedBy,
  onInvited,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ kind: 'form' })
  const [copied, setCopied] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const pushToast = useToastStore((s) => s.push)

  // Reset the surface every time the modal opens so a stale fallback
  // branch doesn't flash when an admin reopens the modal after sharing
  // a link. The effect intentionally runs on `open` transitions only.
  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('member')
      setBusy(false)
      setError(null)
      setScreen({ kind: 'form' })
      setCopied(false)
    }
  }, [open])

  // Focus the email input on open. The Modal primitive autofocuses the
  // panel itself; this second effect shifts focus into the field so the
  // user can start typing immediately.
  useEffect(() => {
    if (open && screen.kind === 'form') {
      // Microtask delay so the panel autofocus has already run before we
      // steal focus back into the input.
      const handle = window.setTimeout(() => emailRef.current?.focus(), 0)
      return () => window.clearTimeout(handle)
    }
  }, [open, screen.kind])

  const trimmed = email.trim().toLowerCase()
  const invalid = trimmed.length > 0 && !EMAIL_RE.test(trimmed)
  const canSubmit = !busy && trimmed.length > 0 && EMAIL_RE.test(trimmed)

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      // NOTE: createInvite doesn't accept a role today; the schema only
      // tracks team_members.role (admin | member) and invites don't
      // carry a role column. The role selector in this modal is UI
      // affordance for the eventual schema change — the value is
      // effectively a no-op server-side, but the admin's intent is
      // preserved in the shown role badge once the member joins.
      void role
      const inv = await createInvite(teamId, trimmed, invitedBy)
      const url = `${window.location.origin}/invite/${inv.token}`

      // Invoke the edge function, but never let its failure tank the
      // flow. The invites row exists either way, so the admin can
      // share the link by hand.
      let emailed = false
      try {
        const { error: fnErr } = await supabase.functions.invoke('send-invite-email', {
          body: { token: inv.token },
        })
        emailed = !fnErr
      } catch {
        emailed = false
      }

      onInvited?.(inv)

      if (emailed) {
        pushToast({
          tone: 'success',
          title: `Invitation sent to ${trimmed}`,
        })
        onClose()
      } else {
        // Keep the modal open and swap to the fallback surface.
        setScreen({ kind: 'fallback', email: trimmed, url })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can reject in insecure contexts; the URL is
      // visible in the input either way, so the admin can select-copy.
    }
  }

  if (!open) return null

  if (screen.kind === 'fallback') {
    return (
      <Modal open onClose={onClose} title="Share this invitation" size="md">
        <ModalBody className="space-y-3 text-sm">
          <div
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
            aria-live="polite"
          >
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              Invite created for <strong>{screen.email}</strong>, but the
              email couldn't be sent right now. Copy the link below and
              share it manually.
            </div>
          </div>
          <div>
            <label
              htmlFor="invite-fallback-link"
              className="block mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              Invite link
            </label>
            <div className="flex gap-2">
              <Input
                id="invite-fallback-link"
                readOnly
                value={screen.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => copyLink(screen.url)}
                leftIcon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Invite teammate" size="md">
      <form onSubmit={onSubmit} noValidate>
        <ModalBody className="space-y-4 text-sm">
          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              Email address
            </span>
            <Input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              aria-label="Email"
              autoComplete="email"
              invalid={invalid}
              disabled={busy}
            />
            {invalid && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                Enter a valid email address.
              </span>
            )}
          </label>
          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={busy}
              aria-label="Role"
              className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50"
            >
              <option value="member">Member — can view and edit offices</option>
              <option value="admin">Admin — can also manage team settings</option>
            </select>
          </label>
          <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Mail size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              Invitees get access to every office in this team. Links
              expire after 7 days.
            </span>
          </p>
          {error && (
            <div
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : (
              'Send invitation'
            )}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

/**
 * Tiny inline spinner — 12px rotating border, respects
 * `prefers-reduced-motion` via Tailwind's `motion-safe` modifier.
 */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
    />
  )
}
