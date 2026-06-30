import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function getRequestIdentity(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const cfIp = req.headers.get("cf-connecting-ip");
  const realIp = req.headers.get("x-real-ip");
  return {
    ipAddress: cfIp || realIp || forwardedFor?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

function adminClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Supabase function environment is not configured.");
  return createClient(url, key, { global: { headers: { Authorization: req.headers.get("Authorization") || `Bearer ${key}` } } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || body.p_token || "").trim();
    if (!token) return json({ ok: false, error: "Token is required." }, 400);
    const { ipAddress, userAgent } = getRequestIdentity(req);
    const { data, error } = await adminClient(req).rpc("eproposal_public_view", { p_token: token, p_ip_address: ipAddress, p_user_agent: userAgent });
    if (error) throw error;
    return json(data ?? { ok: true });
  } catch (error) {
    console.error("[eproposal-view] failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to load e-proposal." }, 400);
  }
});
