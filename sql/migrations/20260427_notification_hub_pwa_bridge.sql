-- Bridge Notification Hub events to PWA push tracking.
-- Safe additive migration.

alter table if exists public.notifications
  add column if not exists push_sent_at timestamptz null,
  add column if not exists push_status text null,
  add column if not exists push_error text null;

create index if not exists notifications_push_status_idx
  on public.notifications (push_status, created_at desc);

create or replace function public.create_notification_event(
  p_title text,
  p_message text,
  p_type text default 'general',
  p_resource text default 'notifications',
  p_resource_id text default null,
  p_priority text default 'normal',
  p_link_target text default null,
  p_meta jsonb default '{}'::jsonb,
  p_target_user_id uuid default null,
  p_target_role text default null,
  p_target_roles text[] default null,
  p_dedupe_key text default null
)
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_roles text[] := array(
    select lower(trim(value))
    from unnest(coalesce(p_target_roles, array[]::text[]) || coalesce(p_target_role, '')) as value
    where trim(value) <> ''
  );
  v_priority text := case when lower(coalesce(p_priority, 'normal')) in ('low','normal','high') then lower(coalesce(p_priority,'normal')) else 'normal' end;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  with targets as (
    select distinct p.id as recipient_id
    from public.profiles p
    where p.is_active = true
      and (
        (p_target_user_id is not null and p.id = p_target_user_id)
        or (coalesce(array_length(v_roles, 1), 0) > 0 and lower(coalesce(p.role_key, '')) = any(v_roles))
      )
  ), inserted as (
    insert into public.notifications (
      recipient_user_id,
      title,
      message,
      type,
      resource,
      resource_id,
      priority,
      status,
      is_read,
      link_target,
      meta,
      actor_user_id,
      actor_role,
      push_status
    )
    select
      t.recipient_id,
      coalesce(nullif(trim(p_title), ''), 'Notification'),
      coalesce(nullif(trim(p_message), ''), ''),
      coalesce(nullif(trim(lower(p_type)), ''), 'general'),
      coalesce(nullif(trim(lower(p_resource)), ''), 'notifications'),
      nullif(trim(p_resource_id), ''),
      v_priority,
      'unread',
      false,
      nullif(trim(p_link_target), ''),
      v_meta || jsonb_build_object('dedupe_key', coalesce(nullif(trim(p_dedupe_key), ''), '')),
      v_actor,
      (select role_key from public.profiles where id = v_actor limit 1),
      'pending'
    from targets t
    where not exists (
      select 1
      from public.notifications n
      where n.recipient_user_id = t.recipient_id
        and coalesce(n.meta->>'dedupe_key', '') = coalesce(nullif(trim(p_dedupe_key), ''), '')
        and coalesce(nullif(trim(p_dedupe_key), ''), '') <> ''
        and n.created_at >= timezone('utc', now()) - interval '24 hours'
    )
    returning notifications.notification_id, notifications.recipient_user_id
  )
  select inserted.notification_id, inserted.recipient_user_id
  from inserted;
end;
$$;

create or replace function public.update_notification_push_status(
  p_notification_ids uuid[],
  p_status text,
  p_error text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set
    push_status = lower(coalesce(nullif(trim(p_status), ''), 'failed')),
    push_error = nullif(trim(coalesce(p_error, '')), ''),
    push_sent_at = case when lower(coalesce(nullif(trim(p_status), ''), '')) = 'sent' then timezone('utc', now()) else push_sent_at end,
    updated_at = timezone('utc', now())
  where notification_id = any(coalesce(p_notification_ids, array[]::uuid[]));

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.create_notification_event(text, text, text, text, text, text, text, jsonb, uuid, text, text[], text) from public, anon;
revoke execute on function public.update_notification_push_status(uuid[], text, text) from public, anon;
grant execute on function public.create_notification_event(text, text, text, text, text, text, text, jsonb, uuid, text, text[], text) to authenticated;
grant execute on function public.update_notification_push_status(uuid[], text, text) to authenticated;
