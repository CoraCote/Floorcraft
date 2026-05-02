import { Mail, MessageCircle, Bug, ArrowRight } from 'lucide-react'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/contact` — three honest channels. Email for sales / general,
 * a short list for support, and the public GitHub for bug reports.
 * No web form because we'd rather route the visitor to the channel
 * that actually gets them an answer.
 */
export function ContactPage() {
  return (
    <PublicPageShell
      eyebrow="§06 · Contact"
      documentTitle="Contact — Floorcraft"
      title="Get in touch."
      subtitle="Pick the channel that fits the question — we're a small team and try to answer everything."
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Channel
          Icon={Mail}
          label="Sales & general"
          href="mailto:hello@floorcraft.space"
          value="hello@floorcraft.space"
          description="Anything about pricing, larger plans, or partnerships."
        />
        <Channel
          Icon={MessageCircle}
          label="Product support"
          href="mailto:support@floorcraft.space"
          value="support@floorcraft.space"
          description="Help with your team's office, onboarding, or imports."
        />
        <Channel
          Icon={Bug}
          label="Bug reports"
          href="https://github.com/rcasto123/Floorcraft/issues/new"
          value="github.com/rcasto123/Floorcraft/issues"
          description="Reproducible issues, screenshots, browser + OS welcome."
        />
        <Channel
          Icon={Mail}
          label="Privacy / legal"
          href="mailto:privacy@floorcraft.space"
          value="privacy@floorcraft.space"
          description="Data export requests, GDPR / CCPA, contracts."
        />
      </div>

      <div className="mt-12 rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-6">
        <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-3">
          Response times
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          We aim to reply to every email within one business day. Bug reports
          on GitHub are triaged twice a week. Sales conversations move at
          your pace — no follow-up cadence, no drip campaigns.
        </p>
      </div>
    </PublicPageShell>
  )
}

function Channel({
  Icon,
  label,
  href,
  value,
  description,
}: {
  Icon: typeof Mail
  label: string
  href: string
  value: string
  description: string
}) {
  return (
    <a
      href={href}
      className="group block rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-5 hover:border-[color:var(--color-blueprint)]/40 transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          {label}
        </span>
      </div>
      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 break-all">{value}</div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] opacity-0 group-hover:opacity-100 transition-opacity">
        Open
        <ArrowRight size={12} />
      </span>
    </a>
  )
}
