import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();

    const {
      action,
      token,
      customerName,
      customerEmail,
      comment,
      signatureType,
      signatureText,
      signatureImageDataUrl,
      signedDocumentDataUrl,
      signedDocumentFileName,
      signedDocumentMimeType,
      rejectionReason
    } = body || {};

    if (!action || !token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing action or token" }), { status: 400, headers: corsHeaders });
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    const cfIp = req.headers.get("cf-connecting-ip");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = cfIp || realIp || forwardedFor?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    let rpcName = "";
    let rpcPayload: Record<string, unknown> = {};

    if (action === "view") {
      rpcName = "eagreement_public_view_with_ip";
      rpcPayload = {
        p_token: token,
        p_user_agent: userAgent,
        p_ip_address: ipAddress
      };
    } else if (action === "accept") {
      rpcName = "eagreement_accept_with_ip";
      rpcPayload = {
        p_token: token,
        p_customer_name: customerName,
        p_customer_email: customerEmail || "not-provided@customer.local",
        p_customer_comment: comment || null,
        p_user_agent: userAgent,
        p_ip_address: ipAddress,
        p_signature_type: signatureType,
        p_signature_text: signatureText || customerName,
        p_signature_image_data_url: signatureImageDataUrl || null,
        p_signed_document_data_url: signedDocumentDataUrl || null,
        p_signed_document_file_name: signedDocumentFileName || null,
        p_signed_document_mime_type: signedDocumentMimeType || null
      };
    } else if (action === "reject") {
      rpcName = "eagreement_reject_with_ip";
      rpcPayload = {
        p_token: token,
        p_customer_name: customerName || null,
        p_customer_email: null,
        p_rejection_reason: rejectionReason || null,
        p_user_agent: userAgent,
        p_ip_address: ipAddress
      };
    } else {
      return new Response(JSON.stringify({ ok: false, error: "Invalid e-agreement action" }), { status: 400, headers: corsHeaders });
    }

    console.log("eagreement-action", { action, rpcName, hasToken: Boolean(token), ipAddress, userAgent });

    const { data, error } = await supabase.rpc(rpcName, rpcPayload);

    if (error) {
      console.error("eagreement-action RPC error", { action, rpcName, error });
      return new Response(JSON.stringify({ ok: false, error: error.message || "RPC failed", details: error }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("eagreement-action fatal error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Failed to process e-agreement action" }), { status: 500, headers: corsHeaders });
  }
});
