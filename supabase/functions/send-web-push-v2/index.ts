import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_VERSION = "send-web-push-v2-cc-auth-final-20260506";

type InputPayload = {
  title?: string;
  body?: string;
  url?: string;

  // Normal/global targets
  roles?: string[];
  target_roles?: string[];
  recipient_roles?: string[];
  user_ids?: string[];
  target_user_ids?: string[];
  recipient_user_ids?: string[];
  emails?: string[];
  target_emails?: string[];
  recipient_emails?: string[];
  subscription_ids?: string[];

  // Resource context
  resource?: string;
  action?: string;
  resource_id?: string;
  record_id?: string;
  conversation_id?: string;

  tag?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  allow_broadcast?: boolean;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string | null;
  email?: string | null;
  role: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type SupabaseAdminClient = ReturnType<typeof createClient>;

function buildCorsHeaders(req?: Request): Record<string, string> {
  const requestedHeaders =
    req?.headers.get("access-control-request-headers") ||
    "authorization, x-client-info, apikey, content-type, x-incheck360-webhook-secret";

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

function buildJsonHeaders(req?: Request): Record<string, string> {
  return {
    ...buildCorsHeaders(req),
    "Content-Type": "application/json",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ version: FUNCTION_VERSION, ...asObject(body) }), {
    status,
    headers: buildJsonHeaders(req),
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeRole(value: unknown): string {
  const role = String(value || "").trim().toLowerCase();

  if (["admin", "administrator", "super_admin", "superadmin"].includes(role)) {
    return "admin";
  }

  if (["dev", "developer"].includes(role)) {
    return "dev";
  }

  if (["hoo", "head_of_operations", "head of operations"].includes(role)) {
    return "hoo";
  }

  if (["accounting", "accountant", "finance"].includes(role)) {
    return "accounting";
  }

  return role;
}

function normalizeResource(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueEmails(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeEmail).filter(Boolean)));
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function safeData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getNestedRecords(input: InputPayload): Record<string, unknown>[] {
  return [safeData(input.data), safeData(input.metadata)];
}

function getFirstString(input: InputPayload, keys: string[]): string {
  for (const key of keys) {
    const ownValue = (input as Record<string, unknown>)[key];
    if (typeof ownValue === "string" && ownValue.trim()) return ownValue.trim();
  }

  for (const record of getNestedRecords(input)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return "";
}

function getArrayFromPayload(input: InputPayload, keys: string[]): string[] {
  const values: string[] = [];

  for (const key of keys) {
    values.push(...safeStringArray((input as Record<string, unknown>)[key]));
  }

  for (const record of getNestedRecords(input)) {
    for (const key of keys) {
      values.push(...safeStringArray(record[key]));
    }
  }

  return uniqueStrings(values);
}

function collectRoles(input: InputPayload): string[] {
  return uniqueStrings(
    getArrayFromPayload(input, ["roles", "target_roles", "recipient_roles"]).map(
      normalizeRole,
    ),
  ).filter(Boolean);
}

function collectUserIds(input: InputPayload): string[] {
  return uniqueStrings(
    getArrayFromPayload(input, [
      "user_ids",
      "target_user_ids",
      "recipient_user_ids",
      "users",
      "target_users",
      "recipient_users",
    ]),
  );
}

function collectEmails(input: InputPayload): string[] {
  return uniqueEmails(
    getArrayFromPayload(input, [
      "emails",
      "target_emails",
      "recipient_emails",
      "email_addresses",
      "target_email_addresses",
      "recipient_email_addresses",
    ]),
  );
}

function getResource(input: InputPayload): string {
  return normalizeResource(
    getFirstString(input, ["resource", "module", "notification_resource"]),
  );
}

function getAction(input: InputPayload): string {
  return normalizeResource(getFirstString(input, ["action", "event", "notification_action"]));
}

function getConversationId(input: InputPayload): string {
  const direct = getFirstString(input, [
    "conversation_id",
    "conversationId",
    "communication_centre_conversation_id",
  ]);
  if (direct) return direct;

  const resource = getResource(input);
  if (resource === "communication_centre" || resource === "communication_center") {
    return getFirstString(input, ["resource_id", "record_id", "id"]);
  }

  return "";
}

function isWebhookSecretValid(req: Request): boolean {
  const expected = Deno.env.get("INCHECK360_PUSH_WEBHOOK_SECRET") || "";
  const received = req.headers.get("x-incheck360-webhook-secret") || "";

  if (!expected) return false;
  return received.length > 0 && received === expected;
}

function getRoleFromObject(row: Record<string, unknown> | null): string {
  if (!row) return "";

  const possibleColumns = [
    "role",
    "roles",
    "app_role",
    "user_role",
    "account_role",
    "profile_role",
    "access_role",
    "role_name",
    "role_key",
    "system_role",
  ];

  for (const column of possibleColumns) {
    const value = row[column];
    if (typeof value === "string" && value.trim()) {
      return normalizeRole(value);
    }
  }

  return "";
}

async function maybeGetSingleByFilter(
  supabaseAdmin: SupabaseAdminClient,
  tableName: string,
  columnName: string,
  value: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select("*")
      .eq(columnName, value)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findRequesterRole(
  supabaseAdmin: SupabaseAdminClient,
  bearerToken: string | null,
): Promise<{ userId: string | null; email: string | null; role: string }> {
  if (!bearerToken) {
    return { userId: null, email: null, role: "" };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(bearerToken);

  if (authError || !authData?.user) {
    return { userId: null, email: null, role: "" };
  }

  const userId = authData.user.id;
  const email = authData.user.email || null;

  const metadataRole =
    normalizeRole(authData.user.app_metadata?.role) ||
    normalizeRole(authData.user.user_metadata?.role) ||
    normalizeRole(authData.user.app_metadata?.app_role) ||
    normalizeRole(authData.user.user_metadata?.app_role) ||
    normalizeRole(authData.user.app_metadata?.user_role) ||
    normalizeRole(authData.user.user_metadata?.user_role);

  if (metadataRole) {
    return { userId, email, role: metadataRole };
  }

  const tables = ["profiles", "users"];

  for (const tableName of tables) {
    const byId = await maybeGetSingleByFilter(
      supabaseAdmin,
      tableName,
      "id",
      userId,
    );
    const roleById = getRoleFromObject(byId);
    if (roleById) return { userId, email, role: roleById };

    const byUserId = await maybeGetSingleByFilter(
      supabaseAdmin,
      tableName,
      "user_id",
      userId,
    );
    const roleByUserId = getRoleFromObject(byUserId);
    if (roleByUserId) return { userId, email, role: roleByUserId };

    if (email) {
      const byEmail = await maybeGetSingleByFilter(
        supabaseAdmin,
        tableName,
        "email",
        email,
      );
      const roleByEmail = getRoleFromObject(byEmail);
      if (roleByEmail) return { userId, email, role: roleByEmail };
    }
  }

  return { userId, email, role: "" };
}

function isPrivilegedRole(role: string): boolean {
  return ["admin", "dev"].includes(normalizeRole(role));
}

function possibleUserIds(row: Record<string, unknown> | null): string[] {
  if (!row) return [];

  const columns = [
    "user_id",
    "profile_id",
    "auth_user_id",
    "auth_id",
    "supabase_user_id",
    "app_user_id",
    "created_by",
    "creator_id",
    "owner_id",
    "sender_id",
  ];

  return uniqueStrings(
    columns
      .map((column) => row[column])
      .filter((value) => typeof value === "string") as string[],
  );
}

function possibleEmails(row: Record<string, unknown> | null): string[] {
  if (!row) return [];

  const columns = [
    "email",
    "user_email",
    "participant_email",
    "created_by_email",
    "creator_email",
    "owner_email",
    "sender_email",
  ];

  return uniqueEmails(
    columns
      .map((column) => row[column])
      .filter((value) => typeof value === "string") as string[],
  );
}

function rowMatchesRequester(
  row: Record<string, unknown> | null,
  requester: { userId: string | null; email: string | null },
): boolean {
  if (!row) return false;

  const requesterUserId = requester.userId || "";
  const requesterEmail = normalizeEmail(requester.email);

  if (requesterUserId && possibleUserIds(row).includes(requesterUserId)) {
    return true;
  }

  if (requesterEmail && possibleEmails(row).includes(requesterEmail)) {
    return true;
  }

  return false;
}

async function verifyCommunicationCentreTargeting(
  supabaseAdmin: SupabaseAdminClient,
  params: {
    input: InputPayload;
    requester: { userId: string | null; email: string | null; role: string };
    requestedUserIds: string[];
    requestedEmails: string[];
  },
): Promise<{
  allowed: boolean;
  reason?: string;
  targetUserIds: string[];
  targetEmails: string[];
}> {
  const { input, requester, requestedUserIds, requestedEmails } = params;

  const resource = getResource(input);
  const conversationId = getConversationId(input);

  if (!["communication_centre", "communication_center"].includes(resource)) {
    return {
      allowed: false,
      reason: "not_communication_centre_payload",
      targetUserIds: [],
      targetEmails: [],
    };
  }

  if (!requester.userId && !requester.email) {
    return {
      allowed: false,
      reason: "requester_not_authenticated",
      targetUserIds: [],
      targetEmails: [],
    };
  }

  if (!conversationId) {
    return {
      allowed: false,
      reason: "missing_conversation_id",
      targetUserIds: [],
      targetEmails: [],
    };
  }

  let participantRows: Record<string, unknown>[] = [];

  try {
    const { data, error } = await supabaseAdmin
      .from("communication_centre_participants")
      .select("*")
      .eq("conversation_id", conversationId)
      .limit(200);

    if (!error && Array.isArray(data)) {
      participantRows = data as Record<string, unknown>[];
    }
  } catch {
    participantRows = [];
  }

  let conversationRow: Record<string, unknown> | null = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("communication_centre_conversations")
      .select("*")
      .eq("id", conversationId)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      conversationRow = data as Record<string, unknown>;
    }
  } catch {
    conversationRow = null;
  }

  const participantUserIds = uniqueStrings([
    ...participantRows.flatMap(possibleUserIds),
    ...possibleUserIds(conversationRow),
  ]);

  const participantEmails = uniqueEmails([
    ...participantRows.flatMap(possibleEmails),
    ...possibleEmails(conversationRow),
  ]);

  const requesterIsParticipant =
    participantRows.some((row) => rowMatchesRequester(row, requester)) ||
    rowMatchesRequester(conversationRow, requester);

  if (!requesterIsParticipant) {
    return {
      allowed: false,
      reason: "requester_not_conversation_participant",
      targetUserIds: [],
      targetEmails: [],
    };
  }

  const requesterUserId = requester.userId || "";
  const requesterEmail = normalizeEmail(requester.email);

  const requestedUserIdsWithoutRequester = requestedUserIds.filter(
    (id) => id !== requesterUserId,
  );
  const requestedEmailsWithoutRequester = requestedEmails.filter(
    (email) => email !== requesterEmail,
  );

  const hasRequestedTargets =
    requestedUserIdsWithoutRequester.length > 0 ||
    requestedEmailsWithoutRequester.length > 0;

  let targetUserIds = requestedUserIdsWithoutRequester;
  let targetEmails = requestedEmailsWithoutRequester;

  if (!hasRequestedTargets) {
    targetUserIds = participantUserIds.filter((id) => id !== requesterUserId);
    targetEmails = participantEmails.filter((email) => email !== requesterEmail);
  }

  const userIdSet = new Set(participantUserIds);
  const emailSet = new Set(participantEmails);

  const unknownUserTargets = targetUserIds.filter((id) => !userIdSet.has(id));
  const unknownEmailTargets = targetEmails.filter((email) => !emailSet.has(email));

  // If the participant table has user IDs, enforce user ID membership.
  // If the participant table has emails, enforce email membership.
  // This supports older schemas that may have only one of the two.
  if (participantUserIds.length > 0 && unknownUserTargets.length > 0) {
    return {
      allowed: false,
      reason: `target_user_not_in_conversation:${unknownUserTargets.join(",")}`,
      targetUserIds: [],
      targetEmails: [],
    };
  }

  if (participantEmails.length > 0 && unknownEmailTargets.length > 0) {
    return {
      allowed: false,
      reason: `target_email_not_in_conversation:${unknownEmailTargets.join(",")}`,
      targetUserIds: [],
      targetEmails: [],
    };
  }

  return {
    allowed: true,
    targetUserIds: uniqueStrings(targetUserIds),
    targetEmails: uniqueEmails(targetEmails),
  };
}

async function insertLog(
  supabaseAdmin: SupabaseAdminClient,
  params: {
    subscription: PushSubscriptionRow;
    title: string;
    body: string;
    url: string;
    payload: Record<string, unknown>;
    status: "sent" | "failed";
    errorMessage?: string | null;
  },
): Promise<void> {
  const { subscription, title, body, url, payload, status, errorMessage } =
    params;

  await supabaseAdmin.from("push_notification_log").insert({
    subscription_id: subscription.id,
    user_id: subscription.user_id,
    role: subscription.role,
    title,
    body,
    url,
    payload,
    status,
    error_message: errorMessage || null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
}

async function deactivateSubscription(
  supabaseAdmin: SupabaseAdminClient,
  subscriptionId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  return !error;
}

async function fetchSubscriptions(
  supabaseAdmin: SupabaseAdminClient,
  params: {
    subscriptionIds: string[];
    userIds: string[];
    emails: string[];
    roles: string[];
    allowBroadcast: boolean;
  },
): Promise<{ rows: PushSubscriptionRow[]; error?: string }> {
  const { subscriptionIds, userIds, emails, roles, allowBroadcast } = params;

  const pageSize = 1000;
  let from = 0;
  const allRows: PushSubscriptionRow[] = [];

  const needsUnionFiltering =
    subscriptionIds.length === 0 &&
    (emails.length > 0 || roles.length > 0 || (userIds.length > 0 && emails.length > 0));

  for (let safety = 0; safety < 50; safety += 1) {
    let query = supabaseAdmin
      .from("push_subscriptions")
      .select("id,user_id,email,role,endpoint,p256dh,auth")
      .eq("is_active", true)
      .range(from, from + pageSize - 1);

    if (subscriptionIds.length > 0) {
      query = query.in("id", subscriptionIds);
    } else if (userIds.length > 0 && !needsUnionFiltering) {
      query = query.in("user_id", userIds);
    } else if (!needsUnionFiltering && !allowBroadcast) {
      return { rows: [], error: "No valid subscription target provided" };
    }

    const { data, error } = await query;

    if (error) {
      return { rows: [], error: error.message };
    }

    const rows = Array.isArray(data) ? (data as PushSubscriptionRow[]) : [];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const subscriptionIdSet = new Set(subscriptionIds);
  const userIdSet = new Set(userIds);
  const emailSet = new Set(emails.map(normalizeEmail));
  const roleSet = new Set(roles.map(normalizeRole));

  let rows = allRows;

  if (subscriptionIds.length > 0) {
    rows = rows.filter((row) => subscriptionIdSet.has(row.id));
  } else if (userIds.length > 0 || emails.length > 0 || roles.length > 0) {
    rows = rows.filter((row) => {
      const matchesUser = row.user_id ? userIdSet.has(row.user_id) : false;
      const matchesEmail = row.email ? emailSet.has(normalizeEmail(row.email)) : false;
      const matchesRole = row.role ? roleSet.has(normalizeRole(row.role)) : false;
      return matchesUser || matchesEmail || matchesRole;
    });
  } else if (!allowBroadcast) {
    return { rows: [], error: "No valid subscription target provided" };
  }

  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  return { rows: deduped };
}

async function verifySubscriptionOwnership(
  supabaseAdmin: SupabaseAdminClient,
  requesterUserId: string,
  subscriptionIds: string[],
): Promise<boolean> {
  if (subscriptionIds.length === 0) return true;

  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,user_id")
    .in("id", subscriptionIds)
    .eq("is_active", true);

  if (error || !Array.isArray(data)) return false;

  if (data.length !== subscriptionIds.length) return false;

  return data.every((row) => row.user_id === requesterUserId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: buildCorsHeaders(req),
    });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        req,
        {
          ok: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        },
        500,
      );
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            "Missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_SUBJECT",
        },
        500,
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse(
        req,
        { ok: false, error: "Content-Type must be application/json" },
        400,
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let input: InputPayload;

    try {
      input = (await req.json()) as InputPayload;
    } catch {
      return jsonResponse(req, { ok: false, error: "Invalid JSON body" }, 400);
    }

    const title =
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : "";

    const body =
      typeof input.body === "string" && input.body.trim()
        ? input.body.trim()
        : "";

    const url =
      typeof input.url === "string" && input.url.trim()
        ? input.url.trim()
        : "/";

    if (!title) {
      return jsonResponse(req, { ok: false, error: "title is required" }, 400);
    }

    if (!body) {
      return jsonResponse(req, { ok: false, error: "body is required" }, 400);
    }

    let roles = collectRoles(input);
    let userIds = collectUserIds(input);
    let emails = collectEmails(input);
    const subscriptionIds = uniqueStrings(safeStringArray(input.subscription_ids));
    let allowBroadcast = input.allow_broadcast === true;

    const tag =
      typeof input.tag === "string" && input.tag.trim()
        ? input.tag.trim()
        : "incheck360-push";

    const extraData = {
      ...safeData(input.data),
      ...safeData(input.metadata),
    };

    const hasTarget =
      subscriptionIds.length > 0 ||
      userIds.length > 0 ||
      emails.length > 0 ||
      roles.length > 0;

    if (!hasTarget && !allowBroadcast) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            "Provide roles, user_ids, emails, or subscription_ids unless allow_broadcast=true",
        },
        400,
      );
    }

    const webhookAllowed = isWebhookSecretValid(req);
    const bearerToken = getBearerToken(req);
    const requester = await findRequesterRole(supabaseAdmin, bearerToken);
    const requesterPrivileged =
      webhookAllowed || isPrivilegedRole(requester.role);

    let communicationCentreAllowed = false;
    let communicationCentreReason = "";

    if (!requesterPrivileged) {
      const ccAuth = await verifyCommunicationCentreTargeting(supabaseAdmin, {
        input,
        requester,
        requestedUserIds: userIds,
        requestedEmails: emails,
      });

      communicationCentreAllowed = ccAuth.allowed;
      communicationCentreReason = ccAuth.reason || "";

      if (communicationCentreAllowed) {
        // A normal user may send Communication Centre pushes only to participants
        // in the same conversation. Never use roles/broadcast for private chat.
        userIds = ccAuth.targetUserIds;
        emails = ccAuth.targetEmails;
        roles = [];
        allowBroadcast = false;
      }
    }

    let selfTargetAllowed = false;

    if (!requesterPrivileged && !communicationCentreAllowed && requester.userId) {
      const requesterEmail = normalizeEmail(requester.email);

      const targetsOnlyOwnUser =
        userIds.length > 0 &&
        userIds.every((id) => id === requester.userId) &&
        emails.every((email) => email === requesterEmail) &&
        roles.length === 0 &&
        subscriptionIds.length === 0 &&
        !allowBroadcast;

      const targetsOnlyOwnSubscriptions =
        subscriptionIds.length > 0 &&
        roles.length === 0 &&
        userIds.length === 0 &&
        emails.length === 0 &&
        !allowBroadcast &&
        (await verifySubscriptionOwnership(
          supabaseAdmin,
          requester.userId,
          subscriptionIds,
        ));

      selfTargetAllowed = targetsOnlyOwnUser || targetsOnlyOwnSubscriptions;
    }

    if (!requesterPrivileged && !communicationCentreAllowed && !selfTargetAllowed) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            "Not authorized. Admin/dev/webhook can send broadly. Users can only test-send to their own subscription/user. Communication Centre users can send only to participants in the same conversation.",
          debug: {
            requester_user_id: requester.userId,
            requester_email: requester.email,
            requester_role: requester.role,
            resource: getResource(input),
            action: getAction(input),
            conversation_id: getConversationId(input),
            communication_centre_reason: communicationCentreReason,
            target_user_count: userIds.length,
            target_email_count: emails.length,
            target_role_count: roles.length,
            subscription_id_count: subscriptionIds.length,
          },
        },
        403,
      );
    }

    let webPush: any;
    try {
      const webPushModule = await import("npm:web-push@3.6.7");
      webPush = webPushModule.default || webPushModule;
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error);

      return jsonResponse(
        req,
        {
          ok: false,
          error: "WEB_PUSH_IMPORT_FAILED",
          message,
        },
        500,
      );
    }

    try {
      webPush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error);

      return jsonResponse(
        req,
        {
          ok: false,
          error: "WEB_PUSH_VAPID_SETUP_FAILED",
          message,
        },
        500,
      );
    }

    const { rows: subscriptions, error: fetchError } =
      await fetchSubscriptions(supabaseAdmin, {
        subscriptionIds,
        userIds,
        emails,
        roles,
        allowBroadcast,
      });

    if (fetchError) {
      return jsonResponse(
        req,
        {
          ok: false,
          error: `Failed selecting subscriptions: ${fetchError}`,
        },
        500,
      );
    }

    if (subscriptions.length === 0) {
      return jsonResponse(req, {
        ok: true,
        attempted: 0,
        sent: 0,
        failed: 0,
        deactivated: 0,
        errors: [],
        debug: {
          requester_user_id: requester.userId,
          requester_email: requester.email,
          requester_role: requester.role,
          resource: getResource(input),
          action: getAction(input),
          conversation_id: getConversationId(input),
          communication_centre_allowed: communicationCentreAllowed,
          selected_user_ids: userIds,
          selected_emails: emails,
          selected_roles: roles,
        },
      });
    }

    const notificationPayload: Record<string, unknown> = {
      title,
      body,
      url,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      data: {
        ...extraData,
        resource: getResource(input) || extraData.resource,
        action: getAction(input) || extraData.action,
        conversation_id: getConversationId(input) || extraData.conversation_id,
        url,
      },
    };

    let sent = 0;
    let failed = 0;
    let deactivated = 0;
    const errors: Array<Record<string, unknown>> = [];

    for (const subscription of subscriptions) {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      try {
        await webPush.sendNotification(
          pushSubscription as any,
          JSON.stringify(notificationPayload),
        );

        sent += 1;

        await insertLog(supabaseAdmin, {
          subscription,
          title,
          body,
          url,
          payload: notificationPayload,
          status: "sent",
        });
      } catch (error: any) {
        failed += 1;

        const statusCode =
          error?.statusCode || error?.response?.statusCode || null;

        const message =
          typeof error?.message === "string"
            ? error.message
            : "Web push send failed";

        const errorMessage = `${statusCode ? `${statusCode} ` : ""}${message}`;

        if (statusCode === 404 || statusCode === 410) {
          const didDeactivate = await deactivateSubscription(
            supabaseAdmin,
            subscription.id,
          );

          if (didDeactivate) {
            deactivated += 1;
          }
        }

        try {
          await insertLog(supabaseAdmin, {
            subscription,
            title,
            body,
            url,
            payload: notificationPayload,
            status: "failed",
            errorMessage,
          });
        } catch {
          // Do not let logging failure hide the push error.
        }

        errors.push({
          subscription_id: subscription.id,
          user_id: subscription.user_id,
          email: subscription.email || null,
          role: subscription.role,
          error: errorMessage,
        });
      }
    }

    return jsonResponse(req, {
      ok: true,
      attempted: subscriptions.length,
      sent,
      failed,
      deactivated,
      errors,
      debug: {
        requester_user_id: requester.userId,
        requester_email: requester.email,
        requester_role: requester.role,
        resource: getResource(input),
        action: getAction(input),
        conversation_id: getConversationId(input),
        communication_centre_allowed: communicationCentreAllowed,
        selected_user_ids: userIds,
        selected_emails: emails,
        selected_roles: roles,
      },
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

    return jsonResponse(
      req,
      {
        ok: false,
        error: "EDGE_FUNCTION_UNHANDLED_ERROR",
        message,
      },
      500,
    );
  }
});
