import { Link } from 'react-router-dom'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useSession } from '../../lib/auth/session'

/**
 * Sticky top navigation for the public landing page.
 *
 * A bare top-right theme toggle looked like an unfinished marketing
 * sketch — real products open with a slim nav that names the thing,
 * offers a couple of anchor links, and surfaces sign-in. The nav is
 * sticky with a semi-transparent background + backdrop blur so as the
 * hero illustration scrolls up underneath it the strip stays legible
 * without feeling like a wall.
 *
 * The backdrop-blur is a cheap visual cue that there's chrome in front
 * of content — modern SaaS sites all rely on it, and Tailwind's
 * `backdrop-blur` compiles to a single filter declaration, no JS, no
 * reduced-motion concern.
 *
 * Sign-in behavior mirrors the hero CTA: authenticated users see a
 * direct link to their dashboard, unauthenticated users see Log in.
 * We deliberately keep /pricing and /help as anchors even though there
 * is no /pricing route yet — clicking it falls through to the in-page
 * pricing teaser via the hash, which is cheaper than building a full
 * pricing page for a "free for small teams" product.
 */
export function LandingNav() {
  const session = useSession()
  const isAuthed = session.status === 'authenticated'

  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--color-paper-line)] bg-[color:var(--color-paper)]/85 backdrop-blur-md dark:border-gray-800/60 dark:bg-[color:var(--color-paper)]/85">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
        >
          {/* Architect's compass-rose monogram — built in CSS so it
              doesn't depend on an asset, and reads as drafting iconography
              rather than the previous gradient diamond. */}
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-6 items-center justify-center"
          >
            <span className="absolute inset-0 rounded-md border border-[color:var(--color-blueprint)] dark:border-[color:var(--color-blueprint)]" />
            <span className="absolute inset-[5px] rotate-45 border border-[color:var(--color-blueprint)] dark:border-[color:var(--color-blueprint)]" />
          </span>
          <span>Floorcraft</span>
        </Link>

        <nav aria-label="Primary" className="hidden sm:flex items-center gap-6 text-sm">
          <a
            href="#pricing"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            Pricing
          </a>
          <Link
            to="/demo"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            Demo
          </Link>
          <Link
            to="/help"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            Help
          </Link>
          {isAuthed ? (
            <Link
              to="/dashboard"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >
              Sign in
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* Compact nav for mobile (`<sm`): the full link row above
              hides on small viewports because four labels would crowd
              the strip. Keep the most important destination (Sign in
              for guests, Dashboard for authenticated users) visible
              and reachable so a phone visitor can act, not just
              scroll. */}
          {isAuthed ? (
            <Link
              to="/dashboard"
              className="sm:hidden text-sm text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] font-medium"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="sm:hidden text-sm text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] font-medium"
            >
              Sign in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
