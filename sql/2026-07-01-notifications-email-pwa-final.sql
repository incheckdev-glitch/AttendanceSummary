-- InCheck360 final notification repair
-- Run once in Supabase SQL Editor, then redeploy Vercel with the code changes in this PR.
-- Safe/idempotent: additive schema repair + replace RPCs used by the frontend.

create extension if not exists pgcrypto;

-- 1) Notification rules used by NotificationService.resolveNotificationChannels()
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  event_key text,
  title_template text,
  body_template text,
  deep_link_template text,
  description text,
  recipient_mode text,
  recipient_roles text[] default '{}',
  recipient_user_ids uuid[] default '{}',
  recipient_emails text[] default '{}',
  users_from_record text[] default '{}',
  is_active boolean default true,
  is_enabled boolean default true,
  in_app_enabled boolean default true,
  pwa_enabled boolean default true,
  email_enabled boolean default true,
  exclude_actor boolean default true,
  priority integer default 100,
  dedupe_window_seconds integer default 30,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(resource, action)
);

alter table public.notification_rules add column if not exists event_key text;
alter table public.notification_rules add column if not exists title_template text;
alter table public.notification_rules add column if not exists body_template text;
alter table public.notification_rules add column if not exists deep_link_template text;
alter table public.notification_rules add column if not exists description text;
alter table public.notification_rules add column if not exists recipient_mode text;
alter table public.notification_rules add column if not exists recipient_roles text[] default '{}';
alter table public.notification_rules add column if not exists recipient_user_ids uuid[] default '{}';
alter table public.notification_rules add column if not exists recipient_emails text[] default '{}';
alter table public.notification_rules add column if not exists users_from_record text[] default '{}';
alter table public.notification_rules add column if not exists is_active boolean default true;
alter table public.notification_rules add column if not exists is_enabled boolean default true;
alter table public.notification_rules add column if not exists in_app_enabled boolean default true;
alter table public.notification_rules add column if not exists pwa_enabled boolean default true;
alter table public.notification_rules add column if not exists email_enabled boolean default true;
alter table public.notification_rules add column if not exists exclude_actor boolean default true;
alter table public.notification_rules add column if not exists priority integer default 100;
alter table public.notification_rules add column if not exists dedupe_window_seconds integer default 30;
alter table public.notification_rules add column if not exists updated_at timestamptz default now();

create unique index if not exists notification_rules_resource_action_uidx on public.notification_rules(resource, action);

-- 2) In-app notifications table compatibility aliases.
create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid,
  target_user_id uuid,
  user_id uuid,
  title text not null default 'Notification',
  message text,
  body text,
  type text default 'business',
  resource text,
  resource_id text,
  entity_id text,
  action text,
  link text,
  action_url text,
  deep_link text,
  url text,
  meta jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notifications add column if not exists notification_id uuid default gen_random_uuid();
alter table public.notifications add column if not exists recipient_user_id uuid;
alter table public.notifications add column if not exists target_user_id uuid;
alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists title text default 'Notification';
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists type text default 'business';
alter table public.notifications add column if not exists resource text;
alter table public.notifications add column if not exists resource_id text;
alter table public.notifications add column if not exists entity_id text;
alter table public.notifications add column if not exists action text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists action_url text;
alter table public.notifications add column if not exists deep_link text;
alter table public.notifications add column if not exists url text;
alter table public.notifications add column if not exists meta jsonb default '{}'::jsonb;
alter table public.notifications add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.notifications add column if not exists is_read boolean default false;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists updated_at timestamptz default now();

create index if not exists notifications_recipient_created_idx on public.notifications(recipient_user_id, created_at desc);
create index if not exists notifications_target_created_idx on public.notifications(target_user_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

-- 3) Delivery queue + logs consumed by /api/notifications/process-queue.
create table if not exists public.notification_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid,
  event_key text,
  channel text not null,
  recipient_user_id uuid,
  recipient_email text,
  title text,
  body text,
  resource text,
  resource_id text,
  action text,
  deep_link text,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  attempts integer default 0,
  next_attempt_at timestamptz default now(),
  processed_at timestamptz,
  last_error text,
  provider_response jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notification_delivery_queue add column if not exists notification_id uuid;
alter table public.notification_delivery_queue add column if not exists event_key text;
alter table public.notification_delivery_queue add column if not exists channel text;
alter table public.notification_delivery_queue add column if not exists recipient_user_id uuid;
alter table public.notification_delivery_queue add column if not exists recipient_email text;
alter table public.notification_delivery_queue add column if not exists title text;
alter table public.notification_delivery_queue add column if not exists body text;
alter table public.notification_delivery_queue add column if not exists resource text;
alter table public.notification_delivery_queue add column if not exists resource_id text;
alter table public.notification_delivery_queue add column if not exists action text;
alter table public.notification_delivery_queue add column if not exists deep_link text;
alter table public.notification_delivery_queue add column if not exists payload jsonb default '{}'::jsonb;
alter table public.notification_delivery_queue add column if not exists status text default 'queued';
alter table public.notification_delivery_queue add column if not exists attempts integer default 0;
alter table public.notification_delivery_queue add column if not exists next_attempt_at timestamptz default now();
alter table public.notification_delivery_queue add column if not exists processed_at timestamptz;
alter table public.notification_delivery_queue add column if not exists last_error text;
alter table public.notification_delivery_queue add column if not exists provider_response jsonb;
alter table public.notification_delivery_queue add column if not exists updated_at timestamptz default now();

create index if not exists notification_delivery_queue_status_next_idx on public.notification_delivery_queue(status, next_attempt_at, created_at);
create index if not exists notification_delivery_queue_recipient_idx on public.notification_delivery_queue(recipient_user_id, created_at desc);

create table if not exists public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid,
  notification_id uuid,
  event_key text,
  channel text,
  recipient_user_id uuid,
  recipient_email text,
  status text,
  error_message text,
  provider_response jsonb,
  created_at timestamptz default now()
);

alter table public.notification_delivery_logs add column if not exists queue_id uuid;
alter table public.notification_delivery_logs add column if not exists notification_id uuid;
alter table public.notification_delivery_logs add column if not exists event_key text;
alter table public.notification_delivery_logs add column if not exists channel text;
alter table public.notification_delivery_logs add column if not exists recipient_user_id uuid;
alter table public.notification_delivery_logs add column if not exists recipient_email text;
alter table public.notification_delivery_logs add column if not exists status text;
alter table public.notification_delivery_logs add column if not exists error_message text;
alter table public.notification_delivery_logs add column if not exists provider_response jsonb;

-- Backward-compatible singular view for older debug screens.
drop view if exists public.notification_delivery_log;
create view public.notification_delivery_log as select * from public.notification_delivery_logs;

-- 4) Push subscription table + registration RPC. This avoids browser RLS upsert errors.
create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  auth_user_id uuid,
  endpoint text not null unique,
  p256dh text,
  auth text,
  user_agent text,
  app_context text default 'erp',
  permission_status text default 'granted',
  device_label text,
  browser_name text,
  is_active boolean default true,
  active boolean default true,
  enabled boolean default true,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_push_subscriptions add column if not exists user_id uuid;
alter table public.user_push_subscriptions add column if not exists auth_user_id uuid;
alter table public.user_push_subscriptions add column if not exists endpoint text;
alter table public.user_push_subscriptions add column if not exists p256dh text;
alter table public.user_push_subscriptions add column if not exists auth text;
alter table public.user_push_subscriptions add column if not exists user_agent text;
alter table public.user_push_subscriptions add column if not exists app_context text default 'erp';
alter table public.user_push_subscriptions add column if not exists permission_status text default 'granted';
alter table public.user_push_subscriptions add column if not exists device_label text;
alter table public.user_push_subscriptions add column if not exists browser_name text;
alter table public.user_push_subscriptions add column if not exists is_active boolean default true;
alter table public.user_push_subscriptions add column if not exists active boolean default true;
alter table public.user_push_subscriptions add column if not exists enabled boolean default true;
alter table public.user_push_subscriptions add column if not exists last_seen_at timestamptz default now();
alter table public.user_push_subscriptions add column if not exists updated_at timestamptz default now();

create unique index if not exists user_push_subscriptions_endpoint_uidx on public.user_push_subscriptions(endpoint);
create index if not exists user_push_subscriptions_user_active_idx on public.user_push_subscriptions(user_id, is_active, last_seen_at desc);
create index if not exists user_push_subscriptions_auth_active_idx on public.user_push_subscriptions(auth_user_id, is_active, last_seen_at desc);

create or replace function public.incheck360_current_profile_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_profile_id uuid;
begin
  if v_auth_id is not null then
    select p.id into v_profile_id from public.profiles p where p.id = v_auth_id limit 1;
  end if;

  if v_profile_id is null and v_email is not null then
    select p.id into v_profile_id from public.profiles p where lower(p.email) = lower(v_email) limit 1;
  end if;

  return coalesce(v_profile_id, v_auth_id);
end;
$$;

grant execute on function public.incheck360_current_profile_id() to authenticated;

create or replace function public.register_user_push_subscription(
  p_endpoint text,
  p_p256dh text default null,
  p_auth text default null,
  p_user_agent text default null,
  p_app_context text default 'erp',
  p_permission_status text default 'granted',
  p_device_label text default null,
  p_browser_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.incheck360_current_profile_id();
  v_auth_id uuid := auth.uid();
  v_id uuid;
begin
  if v_profile_id is null then
    raise exception 'register_user_push_subscription requires an authenticated user';
  end if;

  insert into public.user_push_subscriptions (
    user_id, auth_user_id, endpoint, p256dh, auth, user_agent, app_context, permission_status,
    device_label, browser_name, is_active, active, enabled, last_seen_at, updated_at
  ) values (
    v_profile_id, v_auth_id, p_endpoint, p_p256dh, p_auth, p_user_agent, coalesce(nullif(p_app_context, ''), 'erp'),
    coalesce(nullif(p_permission_status, ''), 'granted'), p_device_label, p_browser_name, true, true, true, now(), now()
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    auth_user_id = excluded.auth_user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    app_context = excluded.app_context,
    permission_status = excluded.permission_status,
    device_label = excluded.device_label,
    browser_name = excluded.browser_name,
    is_active = true,
    active = true,
    enabled = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.register_user_push_subscription(text,text,text,text,text,text,text,text) to authenticated;

-- 5) Dispatch RPC called by src/services/notificationDispatcher.js.
drop function if exists public.dispatch_notification(text, uuid[], jsonb, text, text, text);
drop function if exists public.dispatch_notification(text, text[], jsonb, text, text, text);

create or replace function public.dispatch_notification(
  p_event_key text,
  p_recipient_user_ids text[],
  p_payload jsonb default '{}'::jsonb,
  p_resource text default null,
  p_resource_id text default null,
  p_deep_link text default null
)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid_text text;
  v_uid uuid;
  v_notification_id uuid;
  v_title text := coalesce(nullif(p_payload ->> 'title', ''), 'InCheck360 Notification');
  v_body text := coalesce(nullif(p_payload ->> 'body', ''), nullif(p_payload ->> 'message', ''), 'A business event requires your attention.');
  v_resource text := coalesce(nullif(p_resource, ''), nullif(p_payload ->> 'resource', ''));
  v_action text := coalesce(nullif(p_payload ->> 'action', ''), p_event_key);
  v_resource_id text := coalesce(nullif(p_resource_id, ''), nullif(p_payload ->> 'record_id', ''), nullif(p_payload ->> 'resource_id', ''));
  v_link text := coalesce(nullif(p_deep_link, ''), nullif(p_payload ->> 'url', ''), nullif(p_payload ->> 'deep_link', ''), '/');
  v_channels text[] := array(select lower(value::text) from jsonb_array_elements_text(coalesce(p_payload -> 'channels', '["in_app"]'::jsonb)) value);
  v_should_email boolean := v_channels && array['email'];
  v_should_pwa boolean := v_channels && array['pwa','push','web_push','web-push'];
  v_email text;
  v_direct_email text;
begin
  foreach v_uid_text in array coalesce(p_recipient_user_ids, array[]::text[]) loop
    if v_uid_text is null or v_uid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;

    v_uid := v_uid_text::uuid;
    v_notification_id := gen_random_uuid();

    insert into public.notifications (
      notification_id, recipient_user_id, target_user_id, user_id, title, message, body, type,
      resource, resource_id, entity_id, action, link, action_url, deep_link, url,
      meta, metadata, is_read, created_at, updated_at
    ) values (
      v_notification_id, v_uid, v_uid, v_uid, v_title, v_body, v_body, 'business',
      v_resource, v_resource_id, v_resource_id, v_action, v_link, v_link, v_link, v_link,
      p_payload, p_payload, false, now(), now()
    );

    if v_should_email then
      select lower(p.email) into v_email from public.profiles p where p.id = v_uid and p.email is not null limit 1;
      if v_email is not null and v_email <> '' then
        insert into public.notification_delivery_queue (
          notification_id, event_key, channel, recipient_user_id, recipient_email, title, body,
          resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
        ) values (
          v_notification_id, p_event_key, 'email', v_uid, v_email, v_title, v_body,
          v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
        );
      end if;
    end if;

    if v_should_pwa then
      insert into public.notification_delivery_queue (
        notification_id, event_key, channel, recipient_user_id, title, body,
        resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
      ) values (
        v_notification_id, p_event_key, 'pwa', v_uid, v_title, v_body,
        v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
      );
    end if;

    notification_id := v_notification_id;
    recipient_user_id := v_uid;
    return next;
  end loop;

  if v_should_email and jsonb_typeof(p_payload -> 'emails') = 'array' then
    for v_direct_email in select lower(value::text) from jsonb_array_elements_text(p_payload -> 'emails') value loop
      if v_direct_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        insert into public.notification_delivery_queue (
          event_key, channel, recipient_email, title, body, resource, resource_id, action, deep_link, payload, status, next_attempt_at, created_at, updated_at
        ) values (
          p_event_key, 'email', v_direct_email, v_title, v_body, v_resource, v_resource_id, v_action, v_link, p_payload, 'queued', now(), now(), now()
        );
      end if;
    end loop;
  end if;

  return;
end;
$$;

grant execute on function public.dispatch_notification(text, text[], jsonb, text, text, text) to authenticated;

-- 6) RLS/grants for browser reads/writes through RPCs and own subscription diagnostics.
alter table public.user_push_subscriptions enable row level security;
drop policy if exists user_push_subscriptions_select_own on public.user_push_subscriptions;
create policy user_push_subscriptions_select_own on public.user_push_subscriptions
for select to authenticated
using (user_id = public.incheck360_current_profile_id() or auth_user_id = auth.uid());

drop policy if exists user_push_subscriptions_update_own on public.user_push_subscriptions;
create policy user_push_subscriptions_update_own on public.user_push_subscriptions
for update to authenticated
using (user_id = public.incheck360_current_profile_id() or auth_user_id = auth.uid())
with check (user_id = public.incheck360_current_profile_id() or auth_user_id = auth.uid());

grant select, insert, update on public.user_push_subscriptions to authenticated;
grant select on public.notification_rules to authenticated;
grant select, update on public.notifications to authenticated;
grant insert, select, update on public.notification_delivery_queue to authenticated;
grant insert, select on public.notification_delivery_logs to authenticated;

-- 7) Default channel rules. Keep the channels enabled by default; Notification Setup can tune roles later.
with defaults(resource, action, event_key, title_template, body_template, deep_link_template, recipient_roles, users_from_record, recipient_mode) as (
  values
    ('tickets','ticket_created','tickets.ticket_created','New ticket: {record_ref}','A new ticket was created by {actor_name}.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array[]::text[], null),
    ('tickets','ticket_high_priority','tickets.ticket_high_priority','High priority ticket: {record_ref}','A high priority ticket requires attention.','/#tickets?ticket_id={record_id}', array['admin','dev']::text[], array[]::text[], null),
    ('tickets','ticket_status_changed','tickets.ticket_status_changed','Ticket status changed: {record_ref}','Ticket status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','dev_team_status_changed','tickets.dev_team_status_changed','Dev status changed: {record_ref}','Development team status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_dev_team_status_changed','tickets.ticket_dev_team_status_changed','Dev status changed: {record_ref}','Development team status was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_under_development','tickets.ticket_under_development','Ticket under development: {record_ref}','A ticket moved under development.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array['requester_email']::text[], null),
    ('tickets','ticket_youtrack_changed','tickets.ticket_youtrack_changed','YouTrack changed: {record_ref}','YouTrack reference was updated.','/#tickets?ticket_id={record_id}', array['admin','dev']::text[], array[]::text[], null),
    ('tickets','ticket_issue_related_changed','tickets.ticket_issue_related_changed','Ticket relation changed: {record_ref}','Ticket related field was updated.','/#tickets?ticket_id={record_id}', array['admin','dev','csm']::text[], array[]::text[], null),

    ('leads','lead_created','leads.lead_created','New lead: {record_ref}','A new lead was created.','/#crm?tab=leads&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('leads','lead_updated','leads.lead_updated','Lead updated: {record_ref}','A lead was updated.','/#crm?tab=leads&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('leads','lead_converted_to_deal','leads.lead_converted_to_deal','Lead converted: {record_ref}','A lead was converted to a deal.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('deals','deal_created','deals.deal_created','New deal: {record_ref}','A new deal was created.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_updated','deals.deal_updated','Deal updated: {record_ref}','A deal was updated.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_created_from_lead','deals.deal_created_from_lead','Deal created from lead: {record_ref}','A deal was created from a qualified lead.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('deals','deal_important_stage','deals.deal_important_stage','Deal stage changed: {record_ref}','A deal moved to an important stage.','/#crm?tab=deals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('proposals','proposal_created','proposals.proposal_created','Proposal created: {record_ref}','A proposal was created.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_updated','proposals.proposal_updated','Proposal updated: {record_ref}','A proposal was updated.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_requires_approval','proposals.proposal_requires_approval','Proposal approval required: {record_ref}','A proposal requires approval.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','general_manager','gm']::text[], array[]::text[], null),
    ('proposals','proposal_approved','proposals.proposal_approved','Proposal approved: {record_ref}','A proposal was approved.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_rejected','proposals.proposal_rejected','Proposal rejected: {record_ref}','A proposal was rejected.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),
    ('proposals','proposal_created_from_deal','proposals.proposal_created_from_deal','Proposal created from deal: {record_ref}','A proposal was created from a deal.','/#crm?tab=proposals&id={record_id}', array['admin','sales_executive','head_of_sales']::text[], array['owner_email']::text[], null),

    ('agreements','agreement_created','agreements.agreement_created','Agreement created: {record_ref}','An agreement was created.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),
    ('agreements','agreement_created_from_proposal','agreements.agreement_created_from_proposal','Agreement created: {record_ref}','An agreement was created from a proposal.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),
    ('agreements','agreement_requires_signature','agreements.agreement_requires_signature','Agreement signature required: {record_ref}','An agreement requires internal signature.','/#crm?tab=agreements&id={record_id}', array['admin','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('agreements','agreement_signed','agreements.agreement_signed','Agreement signed: {record_ref}','An agreement was signed.','/#crm?tab=agreements&id={record_id}', array['admin','sales_executive','head_of_sales','accounting']::text[], array['owner_email']::text[], null),

    ('invoices','invoice_created','invoices.invoice_created','Invoice created: {record_ref}','An invoice was created.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('invoices','invoice_created_from_agreement','invoices.invoice_created_from_agreement','Invoice created: {record_ref}','An invoice was created from an agreement.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('invoices','invoice_payment_state_changed','invoices.invoice_payment_state_changed','Invoice payment updated: {record_ref}','Invoice payment state changed.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('invoices','invoice_fully_paid','invoices.invoice_fully_paid','Invoice paid: {record_ref}','An invoice was fully paid.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('invoice_payment_schedule','payment_due_reminder','invoice_payment_schedule.payment_due_reminder','Payment due reminder: {record_ref}','A scheduled payment is due.','/#finance?tab=invoices&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),

    ('receipts','receipt_created','receipts.receipt_created','Receipt created: {record_ref}','A receipt was created.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('receipts','receipt_created_from_invoice','receipts.receipt_created_from_invoice','Receipt created: {record_ref}','A receipt was created from an invoice.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),
    ('receipts','receipt_updated','receipts.receipt_updated','Receipt updated: {record_ref}','A receipt was updated.','/#finance?tab=receipts&id={record_id}', array['admin','accounting','senior_financial_controller','sfc']::text[], array[]::text[], null),

    ('operations_onboarding','onboarding_created','operations_onboarding.onboarding_created','Onboarding created: {record_ref}','An onboarding row was created.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','operations_onboarding_created','operations_onboarding.operations_onboarding_created','Onboarding created: {record_ref}','An onboarding row was created.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','onboarding_status_changed','operations_onboarding.onboarding_status_changed','Onboarding status changed: {record_ref}','Onboarding status was updated.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','onboarding_request_submitted','operations_onboarding.onboarding_request_submitted','Onboarding request submitted: {record_ref}','An onboarding request was submitted.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),
    ('operations_onboarding','assigned_csm','operations_onboarding.assigned_csm','CSM assigned: {record_ref}','A CSM was assigned.','/#operations-onboarding?onboarding_id={record_id}', array['admin','csm','hoo']::text[], array['owner_email']::text[], null),

    ('technical_admin_requests','technical_request_submitted','technical_admin_requests.technical_request_submitted','Technical request submitted: {record_ref}','A technical admin request was submitted.','/#tickets', array['admin','dev','hoo']::text[], array['requester_email']::text[], null),
    ('technical_admin_requests','technical_request_status_changed','technical_admin_requests.technical_request_status_changed','Technical request updated: {record_ref}','Technical admin request status changed.','/#tickets', array['admin','dev','hoo']::text[], array['requester_email']::text[], null),

    ('events','event_created','events.event_created','Event created: {record_ref}','A new event was created.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_updated','events.event_updated','Event updated: {record_ref}','An event was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_status_changed','events.event_status_changed','Event status changed: {record_ref}','Event status was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_schedule_changed','events.event_schedule_changed','Event schedule changed: {record_ref}','Event schedule was updated.','/#events?id={record_id}', array['admin','csm','dev']::text[], array['owner_email']::text[], null),
    ('events','event_deleted','events.event_deleted','Event deleted: {record_ref}','An event was deleted.','/#events', array['admin','csm','dev']::text[], array[]::text[], null),

    ('workflow','workflow_approval_requested','workflow.workflow_approval_requested','Workflow approval requested: {record_ref}','A workflow approval is waiting.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array[]::text[], null),
    ('workflow','workflow_approved','workflow.workflow_approved','Workflow approved: {record_ref}','A workflow request was approved.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),
    ('workflow','workflow_rejected','workflow.workflow_rejected','Workflow rejected: {record_ref}','A workflow request was rejected.','/#workflow?approval_id={record_id}', array['admin','head_of_sales','senior_financial_controller','sfc','general_manager','gm']::text[], array['owner_email']::text[], null),

    ('communication_centre','conversation_created','communication_centre.conversation_created','New conversation: {conversation_title}','A conversation was created by {actor_name}.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_participants_except_actor']::text[], 'assigned_participants_except_actor'),
    ('communication_centre','reply_added','communication_centre.reply_added','New reply: {conversation_title}','A reply was added by {actor_name}.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','conversation_closed','communication_centre.conversation_closed','Conversation closed: {conversation_title}','A conversation was closed.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','conversation_reopened','communication_centre.conversation_reopened','Conversation reopened: {conversation_title}','A conversation was reopened.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),
    ('communication_centre','user_mentioned','communication_centre.user_mentioned','You were mentioned: {conversation_title}','You were mentioned in a conversation.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_users_except_actor']::text[], 'assigned_users_except_actor'),
    ('communication_centre','role_mentioned','communication_centre.role_mentioned','Role mentioned: {conversation_title}','A role was mentioned in a conversation.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_role_snapshot_except_actor']::text[], 'assigned_role_snapshot_except_actor'),
    ('communication_centre','conversation_escalated','communication_centre.conversation_escalated','Conversation escalated: {conversation_title}','A conversation was escalated.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_participants_except_actor']::text[], 'assigned_participants_except_actor'),
    ('communication_centre','action_item_assigned','communication_centre.action_item_assigned','Action item assigned: {conversation_title}','An action item was assigned.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['assigned_users_except_actor']::text[], 'assigned_users_except_actor'),
    ('communication_centre','action_item_completed','communication_centre.action_item_completed','Action item completed: {conversation_title}','An action item was completed.','/#communication_centre?conversation_id={record_id}', array[]::text[], array['participants_except_actor']::text[], 'participants_except_actor'),

    ('biners','biners_entry_created','biners.biners_entry_created','Biners entry created: {record_ref}','A new Biners entry was created.','/#biners?entryId={record_id}', array['admin','accounting','senior_financial_controller','sfc','general_manager','gm','dev']::text[], array[]::text[], null)
)
insert into public.notification_rules (
  resource, action, event_key, title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode, is_active, is_enabled,
  in_app_enabled, pwa_enabled, email_enabled, updated_at
)
select resource, action, event_key, title_template, body_template, deep_link_template,
  recipient_roles, users_from_record, recipient_mode, true, true, true, true, true, now()
from defaults
on conflict (resource, action) do update set
  event_key = excluded.event_key,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  deep_link_template = excluded.deep_link_template,
  recipient_roles = excluded.recipient_roles,
  users_from_record = excluded.users_from_record,
  recipient_mode = excluded.recipient_mode,
  is_active = true,
  is_enabled = true,
  in_app_enabled = true,
  pwa_enabled = true,
  email_enabled = true,
  updated_at = now();

-- 8) Sanity check result.
select
  (select count(*) from public.notification_rules where is_enabled and in_app_enabled and pwa_enabled and email_enabled) as enabled_rules,
  (to_regclass('public.notification_delivery_queue') is not null) as delivery_queue_ready,
  (to_regclass('public.user_push_subscriptions') is not null) as push_subscriptions_ready,
  (to_regprocedure('public.dispatch_notification(text,text[],jsonb,text,text,text)') is not null) as dispatch_rpc_ready,
  (to_regprocedure('public.register_user_push_subscription(text,text,text,text,text,text,text,text)') is not null) as register_push_rpc_ready;

notify pgrst, 'reload schema';
