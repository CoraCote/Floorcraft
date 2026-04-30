import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const BASE =
  // `whitespace-nowrap` is critical — without it, a button whose flex
  // parent squeezes it below its content width breaks the label across
  // multiple lines (browser audit found "Sync from Meraki" rendering as
  // 3 stacked lines on the Network topology toolbar). Buttons should
  // either stay single-line at their natural width OR be allowed to
  // overflow / wrap by their PARENT's flex-wrap policy — never by
  // splitting their own text content.
  'inline-flex items-center justify-center gap-1.5 font-medium rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed'
const VARIANTS: Record<Variant, string> = {
  // Wave 21A — primary buttons adopt the blueprint accent so the
  // Drafting Studio identity propagates through every surface that
  // uses the shared primitive (auth screens, modals, dialogs, the
  // editor's own action buttons). The focus ring lights up cyan to
  // match.
  primary:
    'bg-[color:var(--color-blueprint)] text-white hover:bg-[color:var(--color-blueprint-strong)] focus-visible:ring-[color:var(--color-blueprint)]',
  secondary:
    'border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/50 focus-visible:ring-[color:var(--color-blueprint)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  ghost:
    'text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 focus-visible:ring-[color:var(--color-blueprint)]',
}
const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leftIcon, rightIcon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
})
