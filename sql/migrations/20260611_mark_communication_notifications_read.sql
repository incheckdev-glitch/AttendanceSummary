-- Mark only the authenticated user's unread notifications that reference an opened Communication Centre conversation.
create or replace function public.mark_conversation_notifications_read(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_recipient_column text;
  v_column text;
  v_json_column text;
  v_json_key text;
  v_set_parts text[] := array[]::text[];
  v_match_parts text[] := array[]::text[];
  v_unread_condition text;
  v_sql text;
  v_marked integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_conversation_id is null or to_regclass('public.notifications') is null then
    return 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_user_id'
  ) then
    v_recipient_column := 'recipient_user_id';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
  ) then
    v_recipient_column := 'user_id';
  else
    return 0;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'read_at') then
    v_set_parts := array_append(v_set_parts, 'read_at = now()');
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'is_read') then
    v_set_parts := array_append(v_set_parts, 'is_read = true');
    v_unread_condition := 'coalesce(n.is_read, false) = false';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'status') then
    v_set_parts := array_append(v_set_parts, 'status = ''read''');
    if v_unread_condition is null then
      v_unread_condition := 'lower(coalesce(n.status::text, ''unread'')) <> ''read''';
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'updated_at') then
    v_set_parts := array_append(v_set_parts, 'updated_at = now()');
  end if;
  if v_unread_condition is null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'read_at'
  ) then
    v_unread_condition := 'n.read_at is null';
  end if;
  if cardinality(v_set_parts) = 0 or v_unread_condition is null then
    return 0;
  end if;

  foreach v_column in array array[
    'conversation_id', 'communication_id', 'related_conversation_id', 'source_id',
    'target_id', 'related_record_id', 'resource_id', 'entity_id'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = v_column
    ) then
      v_match_parts := array_append(v_match_parts, format('n.%I::text = $1::text', v_column));
    end if;
  end loop;

  foreach v_column in array array['deep_link', 'url', 'link_target'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = v_column
    ) then
      v_match_parts := array_append(v_match_parts, format('position($1::text in coalesce(n.%I::text, '''')) > 0', v_column));
    end if;
  end loop;

  foreach v_json_column in array array['metadata', 'meta', 'payload', 'data'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = v_json_column
    ) then
      foreach v_json_key in array array['conversation_id', 'conversationId', 'communication_id', 'related_conversation_id', 'resource_id', 'entity_id'] loop
        v_match_parts := array_append(
          v_match_parts,
          format('coalesce(n.%I::jsonb ->> %L, '''') = $1::text', v_json_column, v_json_key)
        );
      end loop;
    end if;
  end loop;

  if cardinality(v_match_parts) = 0 then
    return 0;
  end if;

  v_sql := format(
    'update public.notifications n set %s where n.%I::text = $2::text and %s and (%s)',
    array_to_string(v_set_parts, ', '),
    v_recipient_column,
    v_unread_condition,
    array_to_string(v_match_parts, ' or ')
  );
  execute v_sql using p_conversation_id, v_user_id;
  get diagnostics v_marked = row_count;
  return coalesce(v_marked, 0);
end;
$$;

revoke all on function public.mark_conversation_notifications_read(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_notifications_read(uuid, uuid) to authenticated;

-- Backward-compatible wrapper for older frontend bundles.
create or replace function public.crm_mark_communication_notifications_read(p_conversation_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.mark_conversation_notifications_read(p_conversation_id, auth.uid());
$$;

revoke all on function public.crm_mark_communication_notifications_read(uuid) from public, anon;
grant execute on function public.crm_mark_communication_notifications_read(uuid) to authenticated;
