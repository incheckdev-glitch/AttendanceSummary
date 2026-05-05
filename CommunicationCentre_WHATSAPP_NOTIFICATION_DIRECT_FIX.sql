-- =========================================================
-- Communication Centre WhatsApp-style direct notifications
-- This bypasses Notification Setup for CC reliability.
-- New conversation: notify assigned participants except creator.
-- Reply: notify all participants except sender.
-- Close/Reopen: notify all participants except actor.
-- =========================================================

-- Ensure notification hub can store CC records safely.
alter table if exists public.notifications
  add column if not exists push_sent_at timestamptz null,
  add column if not exists push_status text null,
  add column if not exists push_error text null;

create index if not exists idx_cc_participants_conversation_user
on public.communication_centre_participants (conversation_id, user_id);

create index if not exists idx_notifications_cc_resource
on public.notifications (resource, resource_id, created_at desc)
where resource = 'communication_centre';

-- Direct recipient resolver used by the direct notification function.
drop function if exists public.resolve_communication_centre_whatsapp_recipients(uuid, uuid, text);

create or replace function public.resolve_communication_centre_whatsapp_recipients(
  p_conversation_id uuid,
  p_actor_id uuid default null,
  p_action text default 'reply_added'
)
returns table (
  recipient_user_id uuid,
  recipient_name text,
  recipient_type text
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_action text := lower(coalesce(p_action, 'reply_added'));
begin
  if p_conversation_id is null then
    return;
  end if;

  -- New conversation: notify assigned users / role snapshot / manual participants only.
  -- We also exclude participant_type='creator' and exclude the actor/creator.
  if v_action = 'conversation_created' then
    return query
    select distinct
      p.user_id as recipient_user_id,
      coalesce(nullif(p.user_name, ''), p.user_id::text) as recipient_name,
      coalesce(nullif(p.participant_type, ''), 'participant') as recipient_type
    from public.communication_centre_participants p
    where p.conversation_id = p_conversation_id
      and p.user_id is not null
      and (p_actor_id is null or p.user_id <> p_actor_id)
      and lower(coalesce(p.participant_type, 'participant')) not in ('creator', 'created_by', 'owner')
      and lower(coalesce(p.participant_type, 'participant')) in (
        'assigned_user',
        'assigned_role_snapshot',
        'manual',
        'participant'
      );
    return;
  end if;

  -- Reply / close / reopen: notify everyone in the conversation except actor.
  return query
  select distinct
    p.user_id as recipient_user_id,
    coalesce(nullif(p.user_name, ''), p.user_id::text) as recipient_name,
    coalesce(nullif(p.participant_type, ''), 'participant') as recipient_type
  from public.communication_centre_participants p
  where p.conversation_id = p_conversation_id
    and p.user_id is not null
    and (p_actor_id is null or p.user_id <> p_actor_id);
end;
$$;

grant execute on function public.resolve_communication_centre_whatsapp_recipients(uuid, uuid, text) to authenticated;

-- Main direct notification RPC called by communication-centre.js after successful actions.
drop function if exists public.notify_communication_centre_event(uuid, text);

create or replace function public.notify_communication_centre_event(
  p_conversation_id uuid,
  p_action text
)
returns table (
  notification_id uuid,
  recipient_user_id uuid,
  title text,
  message text,
  link_target text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := public.cc_current_app_user_id();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_conversation public.communication_centre_conversations%rowtype;
  v_title text;
  v_message text;
  v_link text;
  v_recipient record;
  v_inserted record;
  v_dedupe text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_conversation_id is null or v_action = '' then
    return;
  end if;

  select *
  into v_conversation
  from public.communication_centre_conversations c
  where c.id = p_conversation_id
  limit 1;

  if not found then
    return;
  end if;

  if v_actor_id is null then
    v_actor_id := auth.uid();
  end if;

  -- Keep notifications scoped to users who can access this conversation.
  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    return;
  end if;

  v_link := '#communication_centre?conversation_id=' || p_conversation_id::text;

  v_title := case v_action
    when 'conversation_created' then 'New Communication Centre conversation'
    when 'reply_added' then 'New Communication Centre reply'
    when 'conversation_closed' then 'Communication Centre conversation closed'
    when 'conversation_reopened' then 'Communication Centre conversation reopened'
    else 'Communication Centre notification'
  end;

  v_message := case v_action
    when 'conversation_created' then coalesce(public.cc_current_user_name(), 'A user') || ' created “' || coalesce(v_conversation.title, v_conversation.conversation_no, 'a conversation') || '”.'
    when 'reply_added' then coalesce(public.cc_current_user_name(), 'A user') || ' replied to “' || coalesce(v_conversation.title, v_conversation.conversation_no, 'a conversation') || '”.'
    when 'conversation_closed' then coalesce(public.cc_current_user_name(), 'A user') || ' closed “' || coalesce(v_conversation.title, v_conversation.conversation_no, 'a conversation') || '”.'
    when 'conversation_reopened' then coalesce(public.cc_current_user_name(), 'A user') || ' reopened “' || coalesce(v_conversation.title, v_conversation.conversation_no, 'a conversation') || '”.'
    else coalesce(public.cc_current_user_name(), 'A user') || ' updated “' || coalesce(v_conversation.title, v_conversation.conversation_no, 'a conversation') || '”.'
  end;

  for v_recipient in
    select *
    from public.resolve_communication_centre_whatsapp_recipients(p_conversation_id, v_actor_id, v_action)
  loop
    v_dedupe := 'cc:' || v_action || ':' || p_conversation_id::text || ':' || v_recipient.recipient_user_id::text || ':' || extract(epoch from clock_timestamp())::bigint::text;

    for v_inserted in
      select * from public.create_notification_event(
        p_title => v_title,
        p_message => v_message,
        p_type => v_action,
        p_resource => 'communication_centre',
        p_resource_id => p_conversation_id::text,
        p_priority => case when lower(coalesce(v_conversation.priority, 'normal')) in ('low','normal','high') then lower(v_conversation.priority) else 'normal' end,
        p_link_target => v_link,
        p_meta => jsonb_build_object(
          'conversation_id', p_conversation_id::text,
          'conversation_no', coalesce(v_conversation.conversation_no, ''),
          'conversation_title', coalesce(v_conversation.title, ''),
          'notification_source', 'communication_centre_direct',
          'recipient_type', coalesce(v_recipient.recipient_type, 'participant')
        ),
        p_target_user_id => v_recipient.recipient_user_id,
        p_target_role => null,
        p_target_roles => null,
        p_dedupe_key => v_dedupe
      )
    loop
      notification_id := v_inserted.notification_id;
      recipient_user_id := v_inserted.recipient_user_id;
      title := v_title;
      message := v_message;
      link_target := v_link;
      return next;
    end loop;
  end loop;
end;
$$;

grant execute on function public.notify_communication_centre_event(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Verification helper: run after testing a CC action.
select
  'Communication Centre direct notification RPC installed' as status,
  now() as installed_at;
