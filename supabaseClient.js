import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
const DEFAULT_SUPABASE_URL = 'https://ktcsvfnspiftvytjyoew.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_z01cKZGAOSntiAXJviQNBQ_vSP41IBN';

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_URL : '') ||
  DEFAULT_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_PUBLISHABLE_KEY : '') ||
  (typeof window !== 'undefined' ? window.RUNTIME_CONFIG?.SUPABASE_ANON_KEY : '') ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabaseClient] Missing Supabase URL or publishable key. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
