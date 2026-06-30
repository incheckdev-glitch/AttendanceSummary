import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

const EPROPOSAL_RPC_NAMES = {
  view: "eproposal_public_view",
  accept: "eproposal_accept",
  reject: "eproposal_reject",
} as const;

const getSupportedRpcArgs = async (supabase: ReturnType<typeof createClient>, rpcName: string) => {
  const { data, error } = await supabase
    .schema("pg_catalog")
    .from("pg_proc")
    .select("proargnames,pronamespace!inner(nspname)")
    .eq("proname", rpcName)
    .eq("pronamespace.nspname", "public")
    .limit(1)
    .maybeSingle();

  if (error || !Array.isArray(data?.proargnames)) {
    console.error("Unable to verify e-proposal RPC arguments:", { rpcName, error });
    return null;
  }

  return new Set(data.proargnames.filter((name: unknown) => typeof name === "string" && name.startsWith("p_")));
};

const filterSupportedArgs = (args: Record<string, unknown>, supportedArgs: Set<string> | null) => {
  if (!supportedArgs) {
    const { p_ip_address: _ipAddress, ...fallbackArgs } = args;
    return fallbackArgs;
  }
  return Object.fromEntries(Object.entries(args).filter(([key]) => supportedArgs.has(key)));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const token = String(body.token || body.p_token || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    if (!token) return jsonResponse({ ok: false, error: "Proposal token is required." }, 400);
    if (!["view", "accept", "reject"].includes(action)) return jsonResponse({ ok: false, error: "Unsupported e-proposal action." }, 400);

    const forwardedFor = req.headers.get("x-forwarded-for");
    const cfIp = req.headers.get("cf-connecting-ip");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = cfIp || realIp || forwardedFor?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let args: Record<string, unknown> = {};
    const rpcName = EPROPOSAL_RPC_NAMES[action as keyof typeof EPROPOSAL_RPC_NAMES];

    if (action === "view") {
      args = { p_token: token, p_user_agent: userAgent, p_ip_address: ipAddress };
    } else if (action === "accept") {
      args = {
        p_token: token,
        p_customer_name: body.customerName,
        p_customer_email: body.customerEmail || "not-provided@customer.local",
        p_customer_comment: body.comment || null,
        p_user_agent: userAgent,
        p_ip_address: ipAddress,
        p_signature_type: body.signatureType,
        p_signature_text: body.signatureText || body.customerName,
        p_signature_image_data_url: body.signatureImageDataUrl || null,
        p_signed_document_data_url: body.signedDocumentDataUrl || null,
        p_signed_document_file_name: body.signedDocumentFileName || null,
        p_signed_document_mime_type: body.signedDocumentMimeType || null,
      };
    } else {
      args = {
        p_token: token,
        p_customer_name: body.customerName || null,
        p_customer_email: null,
        p_rejection_reason: body.rejectionReason || null,
        p_user_agent: userAgent,
        p_ip_address: ipAddress,
      };
    }

    const supportedArgs = await getSupportedRpcArgs(supabase, rpcName);
    const rpcArgs = filterSupportedArgs(args, supportedArgs);
    if (args.p_ip_address && !rpcArgs.p_ip_address) {
      console.warn("Skipping p_ip_address for e-proposal RPC because the deployed function signature does not support it.", { rpcName });
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      console.error("eproposal-action RPC error:", { rpcName, args: rpcArgs, error });
      return jsonResponse({ ok: false, error: error.message || "Unable to complete e-proposal action." }, 400);
    }
    return jsonResponse({ ok: true, data });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error instanceof Error ? error.message : null) || "Unable to complete e-proposal action." }, 400);
  }
});
