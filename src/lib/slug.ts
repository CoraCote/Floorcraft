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
