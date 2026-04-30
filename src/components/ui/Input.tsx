import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Size = 'sm' | 'md'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: Size
  invalid?: boolean
}

// Wave 21A — Drafting Studio: input surfaces sit on paper-raised, the
// focus ring lights up cyan to match the blueprint accent, and the
// disabled state recedes onto paper-sunken so disabled fields read as
// part of the page rather than as a floating box.
const BASE =
  'block w-full rounded border bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus-visible:ring-[color:var(--color-blueprint)] disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[color:var(--color-paper-sunken)] dark:disabled:bg-gray-800'
const BORDER_OK = 'border-[color:var(--color-paper-line)] dark:border-gray-700'
const BORDER_INVALID = 'border-red-500 focus-visible:ring-red-500'
const SIZES: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-2.5 py-1.5 text-sm',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(BASE, invalid ? BORDER_INVALID : BORDER_OK, SIZES[size], className)}
      {...rest}
    />
  )
})
