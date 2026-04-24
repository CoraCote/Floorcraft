// Zero-dependency class-name concatenator. Filters out falsy parts (so
// the common `cond && 'class'` / `cond ? 'a' : null` patterns just work)
// and joins what remains with a single space.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
