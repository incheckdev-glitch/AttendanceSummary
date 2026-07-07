import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


function sanitizeSignedDocumentFileName(name = "signed-document") {
  return String(name || "signed-document")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120) || "signed-document";
}

function buildSignedDocumentStoragePath({ module, recordId, businessNo, fileName }: { module: "proposals" | "agreements"; recordId?: string | null; businessNo?: string | null; fileName?: string | null }) {
  const safeModule = module === "agreements" ? "agreements" : "proposals";
  const safeRecord = String(recordId || businessNo || "unknown").trim().replace(/[^\w.\-]+/g, "_");
  const safeFileName = sanitizeSignedDocumentFileName(fileName || "signed-document");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeModule}/signed-documents/${safeRecord}/${timestamp}-${uniqueSuffix}-${safeFileName}`;
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType = "application/octet-stream") {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid signed document upload data.");
  const mimeType = match[1] || fallbackMimeType;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

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
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        }),
        { status: 500, headers: corsHeaders }
      );
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
      return new Response(
        JSON.stringify({ ok: false, error: "Missing action or token" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    const cfIp = req.headers.get("cf-connecting-ip");
    const realIp = req.headers.get("x-real-ip");

    const ipAddress =
      cfIp ||
      realIp ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    const userAgent = req.headers.get("user-agent") || null;

    let uploadedSignedDocumentUrl = signedDocumentDataUrl || null;

    if (action === "accept" && signatureType === "signed_document_upload" && signedDocumentDataUrl) {
      const { data: record, error: recordError } = await supabase
        .from("proposals")
        .select("id,proposal_id,ref_number")
        .eq("e_proposal_token", token)
        .maybeSingle();
      if (recordError) throw recordError;
      if (!record?.id) throw new Error("Cannot upload signed document: missing proposal/agreement id.");
      const businessNo = String(record.proposal_id || record.ref_number || record.agreement_id || record.agreement_number || "").trim();
      const storagePath = buildSignedDocumentStoragePath({ module: "proposals", recordId: record.id, businessNo, fileName: signedDocumentFileName });
      const blob = dataUrlToBlob(signedDocumentDataUrl, signedDocumentMimeType || "application/octet-stream");
      const { error: uploadError } = await supabase.storage
        .from("proposal-signed-documents")
        .upload(storagePath, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: signedDocumentMimeType || blob.type || "application/octet-stream"
        });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("proposal-signed-documents").getPublicUrl(storagePath);
      uploadedSignedDocumentUrl = publicUrlData?.publicUrl || storagePath;
      console.info("[SignedDocumentUpload] saved", { module: "proposals", recordId: record.id, storagePath, fileName: signedDocumentFileName });
    }

    let rpcName = "";
    let rpcPayload: Record<string, unknown> = {};

    if (action === "view") {
      rpcName = "eproposal_public_view_with_ip";
      rpcPayload = {
        p_token: token,
        p_user_agent: userAgent,
        p_ip_address: ipAddress
      };
    } else if (action === "accept") {
      rpcName = "eproposal_accept_with_ip";
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
        p_signed_document_data_url: uploadedSignedDocumentUrl || null,
        p_signed_document_file_name: signedDocumentFileName || null,
        p_signed_document_mime_type: signedDocumentMimeType || null
      };
    } else if (action === "reject") {
      rpcName = "eproposal_reject_with_ip";
      rpcPayload = {
        p_token: token,
        p_customer_name: customerName || null,
        p_customer_email: null,
        p_rejection_reason: rejectionReason || null,
        p_user_agent: userAgent,
        p_ip_address: ipAddress
      };
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid e-proposal action" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("eproposal-action", {
      action,
      rpcName,
      hasToken: Boolean(token),
      ipAddress,
      userAgent
    });

    const { data, error } = await supabase.rpc(rpcName, rpcPayload);

    if (error) {
      console.error("eproposal-action RPC error", {
        action,
        rpcName,
        error
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: error.message || "RPC failed",
          details: error
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("eproposal-action fatal error", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Failed to process e-proposal action"
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
