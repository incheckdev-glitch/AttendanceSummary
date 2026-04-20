import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  window.RUNTIME_CONFIG?.SUPABASE_URL ||
  import.meta?.env?.VITE_SUPABASE_URL ||
  window.SUPABASE_URL ||
  'https://ghvceonzwcvdxccdtoua.supabase.co'

const supabaseAnonKey =
  window.RUNTIME_CONFIG?.SUPABASE_ANON_KEY ||
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  window.SUPABASE_ANON_KEY ||
  'sb_publishable_0neF-7OK8rdNA_Lxuwoaww_dSL7TNwL'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
