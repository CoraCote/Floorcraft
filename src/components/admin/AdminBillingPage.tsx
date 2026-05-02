import { CreditCard } from 'lucide-react'

/**
 * Phase 3 placeholder. Stripe integration lands in a separate PR
 * (per-team plans, prices, invoices, subscriptions). Until then,
 * this page just states intent so the nav item isn't dead.
 */
export function AdminBillingPage() {
  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CreditCard size={20} aria-hidden="true" />
          Billing
        </h1>
      </header>
      <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-6">
        <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">
          Stripe integration is a separate phase.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          When it lands, this page will host:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>Plans + pricing — create / edit subscription tiers</li>
          <li>Per-team subscriptions — current plan, status, MRR</li>
          <li>Recent invoices + refunds</li>
          <li>Webhook health (Stripe → Supabase)</li>
        </ul>
      </div>
    </div>
  )
}
