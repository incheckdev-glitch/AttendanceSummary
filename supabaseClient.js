import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  window.RUNTIME_CONFIG?.SUPABASE_URL ||
  import.meta?.env?.VITE_SUPABASE_URL ||
  window.SUPABASE_URL ||
  ''

const supabaseAnonKey =
  window.RUNTIME_CONFIG?.SUPABASE_ANON_KEY ||
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  window.SUPABASE_ANON_KEY ||
  ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
