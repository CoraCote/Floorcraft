import { Link } from 'react-router-dom'
import { Check, ArrowRight } from 'lucide-react'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/pricing` — three-tier pricing card row. Free / Team / Enterprise.
 * Numbers and feature lists deliberately conservative; the closing CTA
 * on the landing already promises "Free for teams up to 25" so the Free
 * tier here matches that. Team and Enterprise tiers are intentionally
 * vague on price ("Contact us") since the product hasn't published a
 * paid plan yet — better honest than fake-precise.
 */
export function PricingPage() {
  return (
    <PublicPageShell
      eyebrow="§04 · Pricing"
      documentTitle="Pricing — Floorcraft"
      title="Pick a plan that fits the room."
      subtitle="Floorcraft is free for the first 25 employees. Larger teams talk to us about Team and Enterprise."
    >
      <div className="grid sm:grid-cols-3 gap-px bg-[color:var(--color-paper-line)] dark:bg-gray-800 border border-[color:var(--color-paper-line)] dark:border-gray-800 rounded-xl overflow-hidden mt-2">
        <Tier
          name="Free"
          price="$0"
          cadence="forever"
          summary="For small teams getting started — no credit card."
          features={[
            'Up to 25 employees',
            'Unlimited offices and floors',
            '20+ element types',
            'CSV import / export',
            'Read-only share links',
          ]}
          ctaTo="/signup"
          ctaLabel="Start free"
        />
        <Tier
          name="Team"
          price="Contact us"
          summary="For growing teams that want collaborative planning, RBAC, and audit logs."
          features={[
            'Everything in Free',
            'Unlimited employees',
            'Owner / editor / viewer roles',
            'Audit log + 50-step history',
            'Insights engine + reports',
            'Email support',
          ]}
          ctaTo="/contact"
          ctaLabel="Talk to sales"
          accent
        />
        <Tier
          name="Enterprise"
          price="Custom"
          summary="For organisations with single sign-on, custom data residency, or many offices."
          features={[
            'Everything in Team',
            'SSO / SAML',
            'Custom retention',
            'Dedicated CSM',
            'SLAs and uptime guarantees',
          ]}
          ctaTo="/contact"
          ctaLabel="Talk to sales"
        />
      </div>

      <div className="mt-12 text-sm text-gray-500 dark:text-gray-400">
        <p>
          All plans include the full editor, presentation mode, and the
          insights engine. Need a plan that doesn't fit one of these
          rows? <Link to="/contact" className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] underline-offset-2 hover:underline">Get in touch</Link>.
        </p>
      </div>
    </PublicPageShell>
  )
}

function Tier({
  name,
  price,
  cadence,
  summary,
  features,
  ctaTo,
  ctaLabel,
  accent,
}: {
  name: string
  price: string
  cadence?: string
  summary: string
  features: string[]
  ctaTo: string
  ctaLabel: string
  accent?: boolean
}) {
  return (
    <div
      className={`bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-6 flex flex-col ${
        accent ? 'relative' : ''
      }`}
    >
      {accent ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-[color:var(--color-blueprint)]"
        />
      ) : null}
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-3">
        {name}
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="font-mono text-3xl font-medium tabular-nums text-gray-900 dark:text-gray-100">
          {price}
        </span>
        {cadence ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{cadence}</span>
        ) : null}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">{summary}</p>
      <ul className="text-sm space-y-2 mb-6 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-gray-700 dark:text-gray-200">
            <Check size={14} className="mt-0.5 flex-shrink-0 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]" aria-hidden="true" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to={ctaTo}
        className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          accent
            ? 'bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white'
            : 'border border-[color:var(--color-paper-line)] dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800'
        }`}
      >
        {ctaLabel}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}
