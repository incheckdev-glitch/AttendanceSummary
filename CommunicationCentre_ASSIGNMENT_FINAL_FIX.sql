-- =========================================================
-- Communication Centre assignment final fix
-- Fixes:
-- - assign to person in New Conversation
-- - assign to role snapshot in New Conversation
-- - add person/role assignment from Details panel
-- Notes:
-- - No attachments
-- - Role assignment remains snapshot-based through participants
-- - Normal Communication Centre access remains simple/manage-based
-- =========================================================

-- 1. Ensure needed columns exist safely
alter table if exists public.communication_centre_conversations
  add column if not exists assigned_role text;
alter table if exists public.communication_centre_conversations
  add column if not exists related_module text;
alter table if exists public.communication_centre_conversations
  add column if not exists related_record_id text;
alter table if exists public.communication_centre_conversations
  add column if not exists participant_count integer not null default 0;
alter table if exists public.communication_centre_conversations
  add column if not exists last_message_preview text;
alter table if exists public.communication_centre_conversations
  add column if not exists last_message_at timestamptz;
alter table if exists public.communication_centre_conversations
  add column if not exists updated_at timestamptz not null default now();
alter table if exists public.communication_centre_conversations
  add column if not exists created_by uuid;
alter table if exists public.communication_centre_conversations
  add column if not exists created_by_name text;
alter table if exists public.communication_centre_conversations
  add column if not exists status text not null default 'Open';
alter table if exists public.communication_centre_conversations
  add column if not exists category text not null default 'General';
alter table if exists public.communication_centre_conversations
  add column if not exists priority text not null default 'Normal';
alter table if exists public.communication_centre_conversations
  add column if not exists conversation_no text;
alter table if exists public.communication_centre_conversations
  add column if not exists title text;
alter table if exists public.communication_centre_conversations
  add column if not exists description text;

alter table if exists public.communication_centre_messages
  add column if not exists sender_id uuid;
alter table if exists public.communication_centre_messages
  add column if not exists sender_name text;
alter table if exists public.communication_centre_messages
  add column if not exists message_body text;
alter table if exists public.communication_centre_messages
  add column if not exists message_type text not null default 'message';
alter table if exists public.communication_centre_messages
  add column if not exists is_system_message boolean not null default false;
alter table if exists public.communication_centre_messages
  add column if not exists reply_to_message_id uuid;
alter table if exists public.communication_centre_messages
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.communication_centre_participants
  add column if not exists user_id uuid;
alter table if exists public.communication_centre_participants
  add column if not exists user_name text;
alter table if exists public.communication_centre_participants
  add column if not exists role_key text;
alter table if exists public.communication_centre_participants
  add column if not exists participant_type text not null default 'participant';
alter table if exists public.communication_centre_participants
  add column if not exists added_by uuid;
alter table if exists public.communication_centre_participants
  add column if not exists added_at timestamptz not null default now();

-- 2. A sequence for readable CC numbers
create sequence if not exists public.communication_centre_conversation_no_seq;

do $$
declare
  v_max bigint;
  v_last bigint;
begin
  select coalesce(max(nullif(regexp_replace(conversation_no, '\\D', '', 'g'), '')::bigint), 0)
  into v_max
  from public.communication_centre_conversations
  where conversation_no is not null;

  select last_value into v_last from public.communication_centre_conversation_no_seq;
  if v_last < v_max then
    perform setval('public.communication_centre_conversation_no_seq', v_max, true);
  end if;
exception when others then
  null;
end $$;

-- 3. Recreate safe assignable user/role loaders
-- Drop first in case earlier versions had incompatible return types.
drop function if exists public.list_communication_centre_assignable_users();
drop function if exists public.list_communication_centre_assignable_roles();

create or replace function public.list_communication_centre_assignable_users()
returns table (
  user_id uuid,
  user_name text,
  email text,
  role_key text
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_table regclass;
begin
  if auth.uid() is null then
    return;
  end if;

  foreach v_table in array array[
    to_regclass('public.profile'),
    to_regclass('public.profiles'),
    to_regclass('public.users')
  ]
  loop
    if v_table is not null then
      return query execute format(
        $q$
        select distinct on (user_id)
          user_id,
          user_name,
          email,
          role_key
        from (
          select
            coalesce(
              nullif(to_jsonb(x)->>'id', ''),
              nullif(to_jsonb(x)->>'user_id', ''),
              nullif(to_jsonb(x)->>'auth_user_id', ''),
              nullif(to_jsonb(x)->>'auth_id', ''),
              nullif(to_jsonb(x)->>'supabase_user_id', '')
            ) as raw_user_id,
            coalesce(
              nullif(to_jsonb(x)->>'full_name', ''),
              nullif(to_jsonb(x)->>'name', ''),
              nullif(to_jsonb(x)->>'display_name', ''),
              nullif(to_jsonb(x)->>'username', ''),
              nullif(to_jsonb(x)->>'email', ''),
              nullif(to_jsonb(x)->>'id', '')
            ) as user_name,
            nullif(to_jsonb(x)->>'email', '') as email,
            lower(coalesce(
              nullif(to_jsonb(x)->>'role_key', ''),
              nullif(to_jsonb(x)->>'app_role', ''),
              nullif(to_jsonb(x)->>'role', ''),
              nullif(to_jsonb(x)->>'user_role', ''),
              nullif(to_jsonb(x)->>'role_name', '')
            )) as role_key,
            coalesce(to_jsonb(x)->>'is_active', 'true') as active_value
          from %s x
        ) s
        cross join lateral (select s.raw_user_id::uuid as user_id) casted
        where s.raw_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and lower(coalesce(s.active_value, 'true')) not in ('false','0','no','inactive','disabled')
        order by user_id, user_name
        $q$,
        v_table
      );
      return;
    end if;
  end loop;
end;
$$;

create or replace function public.list_communication_centre_assignable_roles()
returns table (
  role_key text,
  role_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if to_regclass('public.roles') is not null then
    return query execute
    $q$
      select distinct
        lower(coalesce(
          nullif(to_jsonb(r)->>'role_key', ''),
          nullif(to_jsonb(r)->>'key', ''),
          nullif(to_jsonb(r)->>'name', ''),
          nullif(to_jsonb(r)->>'role_name', '')
        )) as role_key,
        coalesce(
          nullif(to_jsonb(r)->>'name', ''),
          nullif(to_jsonb(r)->>'role_name', ''),
          nullif(to_jsonb(r)->>'label', ''),
          nullif(to_jsonb(r)->>'role_key', ''),
          nullif(to_jsonb(r)->>'key', '')
        ) as role_name
      from public.roles r
      where coalesce(
          nullif(to_jsonb(r)->>'role_key', ''),
          nullif(to_jsonb(r)->>'key', ''),
          nullif(to_jsonb(r)->>'name', ''),
          nullif(to_jsonb(r)->>'role_name', '')
        ) is not null
        and lower(coalesce(to_jsonb(r)->>'is_active', 'true')) not in ('false','0','no','inactive','disabled')
      order by role_name
    $q$;
    return;
  end if;

  return query
  select x.role_key, x.role_name
  from (
    values
      ('admin', 'Admin'),
      ('dev', 'Dev'),
      ('csm', 'CSM'),
      ('hoo', 'HOO'),
      ('viewer', 'Viewer')
  ) as x(role_key, role_name);
end;
$$;

grant execute on function public.list_communication_centre_assignable_users() to authenticated;
grant execute on function public.list_communication_centre_assignable_roles() to authenticated;

-- 4. Helper: add user/role snapshot participants to a conversation
-- Drops first to avoid return/signature conflicts during iterative development.
drop function if exists public.add_communication_centre_assignment(uuid, uuid[], text);

create or replace function public.add_communication_centre_assignment(
  p_conversation_id uuid,
  p_assigned_user_ids uuid[] default array[]::uuid[],
  p_assigned_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := coalesce(public.cc_current_app_user_id(), auth.uid());
  v_role text := nullif(lower(trim(coalesce(p_assigned_role, ''))), '');
  v_user record;
  v_inserted integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Forbidden: login is required';
  end if;

  if p_conversation_id is null then
    raise exception 'Conversation id is required';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  -- Direct assigned users
  for v_user in
    select *
    from public.list_communication_centre_assignable_users() u
    where u.user_id = any(coalesce(p_assigned_user_ids, array[]::uuid[]))
  loop
    insert into public.communication_centre_participants (
      conversation_id,
      user_id,
      user_name,
      role_key,
      participant_type,
      added_by,
      added_at
    )
    select
      p_conversation_id,
      v_user.user_id,
      coalesce(v_user.user_name, v_user.email, v_user.user_id::text),
      v_user.role_key,
      'assigned_user',
      v_actor_id,
      now()
    where not exists (
      select 1
      from public.communication_centre_participants p
      where p.conversation_id = p_conversation_id
        and p.user_id = v_user.user_id
    );
    get diagnostics v_inserted = row_count;
  end loop;

  -- Role snapshot users
  if v_role is not null then
    for v_user in
      select *
      from public.list_communication_centre_assignable_users() u
      where lower(coalesce(u.role_key, '')) = v_role
    loop
      insert into public.communication_centre_participants (
        conversation_id,
        user_id,
        user_name,
        role_key,
        participant_type,
        added_by,
        added_at
      )
      select
        p_conversation_id,
        v_user.user_id,
        coalesce(v_user.user_name, v_user.email, v_user.user_id::text),
        v_user.role_key,
        'assigned_role_snapshot',
        v_actor_id,
        now()
      where not exists (
        select 1
        from public.communication_centre_participants p
        where p.conversation_id = p_conversation_id
          and p.user_id = v_user.user_id
      );
    end loop;

    update public.communication_centre_conversations
    set assigned_role = v_role,
        updated_at = now()
    where id = p_conversation_id;
  end if;

  update public.communication_centre_conversations c
  set participant_count = coalesce((
        select count(distinct p.user_id)::integer
        from public.communication_centre_participants p
        where p.conversation_id = c.id
      ), 0),
      updated_at = now()
  where c.id = p_conversation_id;
end;
$$;

grant execute on function public.add_communication_centre_assignment(uuid, uuid[], text) to authenticated;

-- 5. Recreate conversation RPC with reliable direct-user + role-snapshot assignment
-- Drop first because previous versions may have different return type.
drop function if exists public.create_communication_centre_conversation(text, text, text, text, uuid[], text, text, text);

create or replace function public.create_communication_centre_conversation(
  p_title text,
  p_description text,
  p_category text default 'General',
  p_priority text default 'Normal',
  p_assigned_user_ids uuid[] default array[]::uuid[],
  p_assigned_role text default null,
  p_related_resource text default null,
  p_related_record_id text default null
)
returns table (
  id uuid,
  conversation_no text,
  title text,
  created_by uuid,
  created_by_name text,
  assigned_role text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := coalesce(public.cc_current_app_user_id(), auth.uid());
  v_actor_name text := coalesce(public.cc_current_user_name(), (auth.jwt()->>'email'), 'User');
  v_conversation_id uuid;
  v_conversation_no text;
  v_clean_title text := nullif(trim(coalesce(p_title, '')), '');
  v_clean_message text := nullif(trim(coalesce(p_description, '')), '');
begin
  if v_actor_id is null then
    raise exception 'Forbidden: login is required';
  end if;

  if v_clean_title is null then
    raise exception 'Title is required';
  end if;

  if v_clean_message is null then
    raise exception 'First message is required';
  end if;

  if coalesce(array_length(p_assigned_user_ids, 1), 0) = 0
     and nullif(trim(coalesce(p_assigned_role, '')), '') is null then
    raise exception 'Select at least one assigned user or assigned role';
  end if;

  v_conversation_id := gen_random_uuid();
  v_conversation_no := 'CC#' || lpad(nextval('public.communication_centre_conversation_no_seq')::text, 5, '0');

  insert into public.communication_centre_conversations (
    id,
    conversation_no,
    title,
    description,
    category,
    priority,
    status,
    assigned_role,
    related_module,
    related_record_id,
    created_by,
    created_by_name,
    created_at,
    updated_at,
    last_message_preview,
    last_message_at,
    participant_count
  )
  values (
    v_conversation_id,
    v_conversation_no,
    v_clean_title,
    v_clean_message,
    coalesce(nullif(trim(p_category), ''), 'General'),
    coalesce(nullif(trim(p_priority), ''), 'Normal'),
    'Open',
    nullif(lower(trim(coalesce(p_assigned_role, ''))), ''),
    nullif(trim(coalesce(p_related_resource, '')), ''),
    nullif(trim(coalesce(p_related_record_id, '')), ''),
    v_actor_id,
    v_actor_name,
    now(),
    now(),
    left(v_clean_message, 240),
    now(),
    0
  );

  -- Creator participant
  insert into public.communication_centre_participants (
    conversation_id,
    user_id,
    user_name,
    role_key,
    participant_type,
    added_by,
    added_at
  )
  values (
    v_conversation_id,
    v_actor_id,
    v_actor_name,
    public.cc_current_role_key(),
    'creator',
    v_actor_id,
    now()
  );

  -- First message
  insert into public.communication_centre_messages (
    id,
    conversation_id,
    sender_id,
    sender_name,
    message_body,
    message_type,
    is_system_message,
    created_at
  )
  values (
    gen_random_uuid(),
    v_conversation_id,
    v_actor_id,
    v_actor_name,
    v_clean_message,
    'message',
    false,
    now()
  );

  perform public.add_communication_centre_assignment(
    v_conversation_id,
    coalesce(p_assigned_user_ids, array[]::uuid[]),
    nullif(trim(coalesce(p_assigned_role, '')), '')
  );

  update public.communication_centre_conversations c
  set participant_count = coalesce((
        select count(distinct p.user_id)::integer
        from public.communication_centre_participants p
        where p.conversation_id = c.id
      ), 0)
  where c.id = v_conversation_id;

  return query
  select
    c.id,
    c.conversation_no,
    c.title,
    c.created_by,
    c.created_by_name,
    c.assigned_role
  from public.communication_centre_conversations c
  where c.id = v_conversation_id;
end;
$$;

grant execute on function public.create_communication_centre_conversation(text, text, text, text, uuid[], text, text, text) to authenticated;

-- 6. Reload schema cache
notify pgrst, 'reload schema';

-- 7. Verification helpers
select 'assignable_users' as check_name, count(*) as rows_found
from public.list_communication_centre_assignable_users()
union all
select 'assignable_roles' as check_name, count(*) as rows_found
from public.list_communication_centre_assignable_roles();
