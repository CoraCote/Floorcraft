import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Size = 'sm' | 'md'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: Size
  invalid?: boolean
}

const BASE =
  'block w-full rounded border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800'
const BORDER_OK = 'border-gray-300 dark:border-gray-700'
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
