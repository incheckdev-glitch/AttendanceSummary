alter table if exists public.communication_centre_conversations
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create or replace function public.pin_communication_centre_conversation(p_conversation_id uuid, p_is_pinned boolean)
returns public.communication_centre_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.communication_centre_conversations;
begin
  if not public.cc_has_permission('manage') then
    raise exception 'missing manage permission';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'access denied';
  end if;

  update public.communication_centre_conversations
     set is_pinned = coalesce(p_is_pinned, false),
         pinned_at = case when coalesce(p_is_pinned, false) then now() else null end,
         pinned_by = case when coalesce(p_is_pinned, false) then auth.uid() else null end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.pin_communication_centre_conversation(uuid, boolean) to authenticated;

create or replace function public.archive_communication_centre_conversation(p_conversation_id uuid, p_is_archived boolean)
returns public.communication_centre_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.communication_centre_conversations;
begin
  if not public.cc_has_permission('manage') then
    raise exception 'missing manage permission';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'access denied';
  end if;

  update public.communication_centre_conversations
     set is_archived = coalesce(p_is_archived, false),
         archived_at = case when coalesce(p_is_archived, false) then now() else null end,
         archived_by = case when coalesce(p_is_archived, false) then auth.uid() else null end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.archive_communication_centre_conversation(uuid, boolean) to authenticated;
