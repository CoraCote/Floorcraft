import { Link } from 'react-router-dom'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/terms` — terms of service. Same plain-English principle as the
 * privacy page. The legal review for paid plans should be a separate
 * MSA + Order Form; this page is for individuals + small teams.
 */
export function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="§08 · Terms"
      title="Terms of service."
      subtitle="The agreement that comes with using Floorcraft. Last updated 2026-04-30."
    >
      <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <Section title="Using the service">
          <p>
            You can use Floorcraft for any purpose that doesn't break
            the law or harm others. You're responsible for what you and
            your teammates do with the account. If you're using
            Floorcraft on behalf of an organisation, you're confirming
            you have authority to bind that organisation to these
            terms.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Floor plans, rosters, neighborhood layouts, and anything
            else you put into Floorcraft are yours. We don't claim
            ownership and we don't use your content to train models or
            sell to third parties. You grant us only the limited rights
            we need to host and display your content to the people
            you've shared it with.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Don't use Floorcraft to host content that violates law,
            infringes someone's rights, or attacks our infrastructure.
            We can suspend accounts that abuse the service or
            repeatedly violate these terms; we'll make a reasonable
            effort to give you advance notice and a chance to export
            your data.
          </p>
        </Section>

        <Section title="Availability">
          <p>
            We do our best to keep Floorcraft running. The Free tier is
            offered as-is without uptime guarantees. Paid plans get
            documented SLAs, posted in your contract.
          </p>
        </Section>

        <Section title="Disclaimer of warranty">
          <p>
            Floorcraft is provided "as is", without warranty of any
            kind, express or implied. We don't promise the service will
            be error-free or uninterrupted.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Floorcraft's
            aggregate liability under these terms is limited to the
            fees you paid us in the 12 months before the claim arose,
            or US $100 for Free tier users.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We'll email every active account at least 30 days before
            material changes take effect. Continued use after that
            counts as acceptance.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the State of
            California, United States, without regard to conflict-of-law
            rules.
          </p>
        </Section>
      </div>

      <p className="mt-12 text-xs text-gray-500 dark:text-gray-400 font-mono">
        Questions about these terms?{' '}
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
