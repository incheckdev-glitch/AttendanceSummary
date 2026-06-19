-- Enforce the permanent single notification pipeline:
-- modules/RPCs create exactly one in-app row in public.notifications; this
-- trigger fans that row out to at most one email queue row and one PWA queue row.

create unique index if not exists notification_delivery_queue_notification_channel_idx
  on public.notification_delivery_queue(notification_id, channel)
  where notification_id is not null;

create or replace function public.notification_meta_has_channel(p_meta jsonb, p_channel text, p_default boolean)
returns boolean
language sql
stable
as $$
  select case
    when p_meta ? 'channels' then exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_meta -> 'channels', '[]'::jsonb)) as c(channel)
      where lower(c.channel) = lower(p_channel)
         or (lower(p_channel) = 'pwa' and lower(c.channel) in ('push', 'web_push'))
    )
    else p_default
  end;
$$;

create or replace function public.enqueue_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.notification_event_types%rowtype;
  v_email text;
  v_title text;
  v_body text;
  v_deep_link text;
  v_payload jsonb;
begin
  if new.recipient_user_id is null then
    return new;
  end if;

  v_payload := coalesce(new.meta, '{}'::jsonb);
  v_title := coalesce(nullif(new.title, ''), 'Notification');
  v_body := coalesce(nullif(new.message, ''), nullif(v_payload ->> 'body', ''), 'A record needs your attention.');
  v_deep_link := coalesce(nullif(new.link_target, ''), nullif(v_payload ->> 'deep_link', ''), nullif(v_payload ->> 'url', ''));

  select * into v_event
  from public.notification_event_types
  where event_key = new.type and enabled = true;

  if not found then
    return new;
  end if;

  select recipient_email into v_email
  from public.get_notification_user_identity(new.recipient_user_id);

  if public.notification_meta_has_channel(v_payload, 'pwa', v_event.default_pwa) then
    insert into public.notification_delivery_queue(notification_id, event_key, channel, recipient_user_id, title, body, deep_link, resource, resource_id, payload)
    values (new.notification_id, new.type, 'pwa', new.recipient_user_id, v_title, v_body, v_deep_link, coalesce(new.resource, v_event.module), new.resource_id, v_payload)
    on conflict (notification_id, channel) where notification_id is not null do nothing;
  end if;

  if public.notification_meta_has_channel(v_payload, 'email', v_event.default_email) then
    insert into public.notification_delivery_queue(notification_id, event_key, channel, recipient_user_id, recipient_email, title, body, deep_link, resource, resource_id, payload)
    values (new.notification_id, new.type, 'email', new.recipient_user_id, v_email, v_title, v_body, v_deep_link, coalesce(new.resource, v_event.module), new.resource_id, v_payload)
    on conflict (notification_id, channel) where notification_id is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notification_unified_queue on public.notifications;
create trigger trg_notification_unified_queue
after insert on public.notifications
for each row execute function public.enqueue_notification_deliveries();

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
  v_user_id uuid;
  v_notification_id uuid;
  v_title text;
  v_body text;
  v_deep_link text;
  v_email text;
  v_name text;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_event from public.notification_event_types where event_key = p_event_key and enabled = true;
  if not found then
    raise exception 'Notification event type % is not enabled or does not exist', p_event_key;
  end if;

  v_title := coalesce(nullif(public.render_notification_template(v_event.title_template, p_payload), ''), p_payload ->> 'title', 'Notification');
  v_body := coalesce(nullif(public.render_notification_template(v_event.body_template, p_payload), ''), p_payload ->> 'body', p_payload ->> 'message', 'A record needs your attention.');
  v_deep_link := coalesce(p_deep_link, nullif(public.render_notification_template(v_event.deep_link_template, p_payload), ''), p_payload ->> 'deep_link', p_payload ->> 'url');

  foreach v_user_id in array coalesce(p_recipient_user_ids, array[]::uuid[]) loop
    insert into public.notifications (recipient_user_id, title, message, type, resource, resource_id, status, is_read, link_target, meta)
    values (v_user_id, v_title, v_body, p_event_key, coalesce(p_resource, v_event.module), p_resource_id, 'unread', false, v_deep_link, coalesce(p_payload, '{}'::jsonb))
    returning notification_id into v_notification_id;

    select recipient_email, recipient_name into v_email, v_name
    from public.get_notification_user_identity(v_user_id);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object('recipient_user_id', v_user_id, 'recipient_email', v_email, 'recipient_name', v_name, 'notification_id', v_notification_id, 'event_key', p_event_key));
  end loop;

  return v_rows;
end;
$$;
