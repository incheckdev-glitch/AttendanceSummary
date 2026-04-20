(function initSupabaseClient(global) {
  const runtimeConfig = global.RUNTIME_CONFIG || {};

  const supabaseUrl = String(
    runtimeConfig.SUPABASE_URL || global.SUPABASE_URL || ''
  ).trim();
  const supabaseAnonKey = String(
    runtimeConfig.SUPABASE_ANON_KEY || global.SUPABASE_ANON_KEY || ''
  ).trim();

  const SHARED_CLIENT_KEY = '__SUPABASE_BROWSER_CLIENT__';

  function ensureBrowserClient() {
    if (global[SHARED_CLIENT_KEY]) return global[SHARED_CLIENT_KEY];
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase URL or anon key.');
    }
    const createClient = global.supabase?.createClient;
    if (typeof createClient !== 'function') {
      throw new Error('Supabase SDK is unavailable. Ensure supabase-js is loaded before app scripts.');
    }
    global[SHARED_CLIENT_KEY] = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return global[SHARED_CLIENT_KEY];
  }

  global.SupabaseClient = {
    getUrl() {
      return supabaseUrl;
    },
    hasConfig() {
      return Boolean(supabaseUrl && supabaseAnonKey);
    },
    getClient() {
      return ensureBrowserClient();
    }
  };
})(window);
