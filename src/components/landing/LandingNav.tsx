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
    <header className="sticky top-0 z-20 border-b border-gray-200/60 bg-white/70 backdrop-blur-md dark:border-gray-800/60 dark:bg-gray-950/70">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
        >
          {/* Tiny diamond mark — matches the floor-plan geometric idiom
              without committing to a full SVG logotype. */}
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rotate-45 rounded-sm bg-gradient-to-br from-blue-500 to-indigo-600"
          />
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
