import type { ReactNode } from 'react'
import { LandingNav } from '../landing/LandingNav'
import { LandingFooter } from '../landing/LandingFooter'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Shared shell for the small static-content marketing pages
 * (`/pricing`, `/changelog`, `/about`, `/contact`, `/privacy`, `/terms`,
 * `/status`). Wraps the body in the same `LandingNav` + `LandingFooter`
 * the landing page uses so a visitor moving between these pages stays in
 * one consistent identity.
 *
 * The eyebrow + h1 pattern mirrors the landing page's section markers
 * (mono uppercase tracking + bold display headline) so each page
 * announces itself as part of the same drafting-spec system.
 */
export interface PublicPageShellProps {
  /** Section marker (e.g. "§04 · LEGAL"). Optional but recommended. */
  eyebrow?: string
  /** Page title — appears as the visible h1. */
  title: string
  /** Optional one-line subtitle directly under the headline. */
  subtitle?: string
  /**
   * Optional override for the browser tab title. Defaults to
   * `"<title> — Floorcraft"`, which is the right answer for almost
   * every page. Pages with a long visible h1 (e.g. the changelog)
   * can pass a shorter alternative.
   */
  documentTitle?: string
  children: ReactNode
}

export function PublicPageShell({
  eyebrow,
  title,
  subtitle,
  documentTitle,
  children,
}: PublicPageShellProps) {
  useDocumentTitle(documentTitle ?? `${title} — Floorcraft`)
  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--color-paper)] text-gray-900 dark:text-gray-100">
      <LandingNav />
      <main className="flex-1">
        <header className="border-b border-[color:var(--color-paper-line)] dark:border-gray-800 bg-blueprint-grid">
          <div className="max-w-3xl mx-auto px-6 py-16 lg:py-20">
            {eyebrow ? (
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-5">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
                {subtitle}
              </p>
            ) : null}
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16 prose-content">
          {children}
        </div>
      </main>
      <LandingFooter />
    </div>
  )
}
