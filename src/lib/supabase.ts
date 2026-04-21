import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
      'See .env.example; copy to .env.local for local dev, or configure in Netlify env for prod.',
  )
}

/**
 * App-wide Supabase client. All reads/writes go through this singleton.
 *
 * Authorization lives in Postgres RLS — do not try to enforce permission
 * checks in the browser. If a call returns empty where you expected rows,
 * the server is telling you the caller isn't entitled to see them.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
