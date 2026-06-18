create table if not exists public.notification_event_types (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  module text not null,
  title_template text not null default 'Notification',
  body_template text not null default 'A record needs your attention.',
  deep_link_template text,
  enabled boolean not null default true,
  default_in_app boolean not null default true,
  default_pwa boolean not null default true,
  default_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_user_settings (
  id uuid primary key default gen_random_uuid(),
  event_key text not null references public.notification_event_types(event_key) on delete cascade,
  user_id uuid,
  role_key text,
  in_app_enabled boolean,
  pwa_enabled boolean,
  email_enabled boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_user_settings_target_chk check (user_id is not null or nullif(role_key, '') is not null)
);

create unique index if not exists notification_user_settings_user_event_idx on public.notification_user_settings(event_key, user_id) where user_id is not null;
create unique index if not exists notification_user_settings_role_event_idx on public.notification_user_settings(event_key, role_key) where role_key is not null;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text,
  auth text,
  role text,
  email text,
  user_agent text,
  app_context text,
  permission_status text,
  device_label text,
  browser_name text,
  origin text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.user_push_subscriptions add column if not exists user_agent text;
alter table public.user_push_subscriptions add column if not exists app_context text;
alter table public.user_push_subscriptions add column if not exists permission_status text;
alter table public.user_push_subscriptions add column if not exists device_label text;
alter table public.user_push_subscriptions add column if not exists browser_name text;
alter table public.user_push_subscriptions add column if not exists is_active boolean not null default true;
alter table public.user_push_subscriptions add column if not exists last_seen_at timestamptz;
alter table public.user_push_subscriptions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.notification_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid,
  event_key text not null,
  channel text not null check (channel in ('pwa','email')),
  recipient_user_id uuid,
  recipient_email text,
  title text not null,
  body text not null,
  deep_link text,
  resource text,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_delivery_queue_due_idx on public.notification_delivery_queue(status, next_attempt_at, created_at);

create table if not exists public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.notification_delivery_queue(id) on delete set null,
  notification_id uuid,
  event_key text,
  channel text not null,
  recipient_user_id uuid,
  recipient_email text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function public.render_notification_template(p_template text, p_payload jsonb)
returns text
language plpgsql
stable
as $$
declare
  v_result text := coalesce(p_template, '');
  v_key text;
begin
  if p_payload is null then
    return v_result;
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    v_result := replace(v_result, '{{' || v_key || '}}', coalesce(p_payload ->> v_key, ''));
  end loop;
  return v_result;
end;
$$;

create or replace function public.dispatch_notification(
  p_event_key text,
  p_recipient_user_ids uuid[],
  p_payload jsonb default '{}'::jsonb,
  p_resource text default null,
  p_resource_id text default null,
  p_deep_link text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.notification_event_types%rowtype;
  v_recipient uuid;
  v_notification_id uuid;
  v_title text;
  v_body text;
  v_deep_link text;
  v_email text;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_event from public.notification_event_types where event_key = p_event_key and enabled = true;
  if not found then
    raise exception 'Notification event type % is not enabled or does not exist', p_event_key;
  end if;

  v_title := coalesce(public.render_notification_template(v_event.title_template, p_payload), p_payload ->> 'title', 'Notification');
  v_body := coalesce(nullif(public.render_notification_template(v_event.body_template, p_payload), ''), p_payload ->> 'body', p_payload ->> 'message', 'A record needs your attention.');
  v_deep_link := coalesce(p_deep_link, nullif(public.render_notification_template(v_event.deep_link_template, p_payload), ''));

  foreach v_recipient in array coalesce(p_recipient_user_ids, array[]::uuid[]) loop
    if v_event.default_in_app then
      insert into public.notifications (recipient_user_id, title, message, type, resource, resource_id, status, is_read, link_target, meta)
      values (v_recipient, v_title, v_body, p_event_key, coalesce(p_resource, v_event.module), p_resource_id, 'unread', false, v_deep_link, p_payload)
      returning notification_id into v_notification_id;
    else
      v_notification_id := null;
    end if;

    select email into v_email from public.profiles where id = v_recipient limit 1;

    if v_event.default_pwa then
      insert into public.notification_delivery_queue(notification_id, event_key, channel, recipient_user_id, title, body, deep_link, resource, resource_id, payload)
      values (v_notification_id, p_event_key, 'pwa', v_recipient, v_title, v_body, v_deep_link, coalesce(p_resource, v_event.module), p_resource_id, p_payload);
    end if;

    if v_event.default_email then
      insert into public.notification_delivery_queue(notification_id, event_key, channel, recipient_user_id, recipient_email, title, body, deep_link, resource, resource_id, payload)
      values (v_notification_id, p_event_key, 'email', v_recipient, v_email, v_title, v_body, v_deep_link, coalesce(p_resource, v_event.module), p_resource_id, p_payload);
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object('recipient_user_id', v_recipient, 'notification_id', v_notification_id, 'event_key', p_event_key));
  end loop;

  return v_rows;
end;
$$;

grant execute on function public.dispatch_notification(text, uuid[], jsonb, text, text, text) to authenticated, service_role;
