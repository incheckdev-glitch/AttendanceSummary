import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_URL : '') ||
  '';

const SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_PUBLISHABLE_KEY : '') ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_ANON_KEY : '') ||
  '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    '[supabaseClient] Missing Supabase URL or publishable key. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
