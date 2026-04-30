import { Link } from 'react-router-dom'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/privacy` — short plain-English privacy summary. NOT a legally
 * binding policy on its own; it sets out what data Floorcraft collects
 * and how we treat it, in language a normal person can read. Larger
 * accounts that need a full data-processing addendum should email
 * privacy@ for one.
 */
export function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="§07 · Privacy"
      title="Privacy policy."
      subtitle="What we collect, why, and what you can do about it. Last updated 2026-04-30."
    >
      <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <Section title="What we collect">
          <p>
            Floorcraft collects only the data you put into it: your
            email address (for sign-in), the name + email of teammates
            you invite, and the office floor plans you draw. We don't
            ask for billing details on the Free tier. We don't run
            third-party analytics or session-replay tools.
          </p>
        </Section>

        <Section title="How we use it">
          <ul className="space-y-2 list-disc pl-5">
            <li>To sign you in and keep your floor plans saved across sessions.</li>
            <li>To deliver invites you send to teammates.</li>
            <li>To debug specific issues you've reported, with your permission.</li>
            <li>To send occasional product-update emails (you can opt out at any time).</li>
          </ul>
          <p>
            We never sell or rent your data, and we don't share it with
            third-party advertisers.
          </p>
        </Section>

        <Section title="Where it lives">
          <p>
            Floor plans, employee rosters, and account data live in
            Supabase (PostgreSQL) hosted in the United States. We use
            row-level security so a row is only visible to the users
            who have explicit access through the team / office sharing
            model. Read more about Supabase's infrastructure at{' '}
            <a
              href="https://supabase.com/security"
              className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
            >
              supabase.com/security
            </a>.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can export every floor plan you've created (File →
            Export → JSON Project Data) and your employee roster (File
            → Export → CSV) at any time. To delete your account or
            request the data we hold on you under GDPR / CCPA, email{' '}
            <a
              href="mailto:privacy@floorcraft.space"
              className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
            >
              privacy@floorcraft.space
            </a>{' '}
            and we'll respond within 30 days.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use one essential first-party cookie (the Supabase
            session token) so you stay signed in. We do not set
            third-party cookies, advertising cookies, or analytics
            cookies.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We'll update this page if our practices change. Material
            changes are emailed to every active account before they
            take effect.
          </p>
        </Section>
      </div>

      <p className="mt-12 text-xs text-gray-500 dark:text-gray-400 font-mono">
        Need a full Data Processing Addendum or have a question this
        page doesn't answer?{' '}
        <Link
          to="/contact"
          className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          Get in touch
        </Link>
        .
      </p>
    </PublicPageShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-3">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
