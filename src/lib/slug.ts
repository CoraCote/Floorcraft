import { nanoid } from 'nanoid'

const adjectives = [
  'bright', 'calm', 'bold', 'swift', 'warm',
  'cool', 'fair', 'keen', 'pure', 'soft',
  'glad', 'fine', 'neat', 'wise', 'true',
]

const nouns = [
  'hall', 'room', 'plan', 'seat', 'deck',
  'view', 'nest', 'arch', 'grid', 'zone',
  'loft', 'wing', 'bay', 'den', 'hub',
]

export function generateSlug(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const id = nanoid(6)
  return `${adj}-${noun}-${id}`
}

/**
 * Team / office slug derived from a human name. Lower-cases, collapses
 * non-alphanumerics to `-`, trims edge dashes, and appends a short
 * random suffix so collisions on the unique index are statistically
 * rare without us having to retry-on-conflict for the common case.
 *
 * Accepts an empty or punctuation-only name by falling back to the
 * `generateSlug()` random-pair. Final output is always URL-safe.
 */
export function slugFromName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const base = cleaned || generateSlug()
  return `${base}-${nanoid(6)}`
}
