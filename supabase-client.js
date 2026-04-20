(function initSupabaseClient(global) {
  const runtimeConfig = global.RUNTIME_CONFIG || {};

  const supabaseUrl = String(
    runtimeConfig.SUPABASE_URL || runtimeConfig.NEXT_PUBLIC_SUPABASE_URL || global.SUPABASE_URL || 'https://ghvceonzwcvdxccdtoua.supabase.co'
  ).trim();
  const supabaseAnonKey = String(
    runtimeConfig.SUPABASE_ANON_KEY || runtimeConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || global.SUPABASE_ANON_KEY || 'sb_publishable_0neF-7OK8rdNA_Lxuwoaww_dSL7TNwL'
  ).trim();

  let cachedClient = null;

  function ensureBrowserClient() {
    if (cachedClient) return cachedClient;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in runtime config.');
    }
    const createClient = global.supabase?.createClient;
    if (typeof createClient !== 'function') {
      throw new Error('Supabase SDK is unavailable. Ensure supabase-js is loaded before app scripts.');
    }
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return cachedClient;
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
