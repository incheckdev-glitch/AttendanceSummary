-- =========================================================
-- Communication Centre realtime auto-update setup
-- Enables Supabase Realtime for conversations, messages, reactions,
-- participants, and read receipts so chats update automatically.
-- Safe to run multiple times.
-- =========================================================

-- Realtime needs full row images for reliable update/delete payloads.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'communication_centre_conversations',
    'communication_centre_messages',
    'communication_centre_participants',
    'communication_centre_read_receipts',
    'communication_centre_message_reactions'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      begin
        execute format('alter table public.%I replica identity full', v_table);
      exception when others then
        raise notice 'Could not set replica identity full for %. Error: %', v_table, sqlerrm;
      end;

      begin
        execute format('grant select on public.%I to authenticated', v_table);
      exception when others then
        raise notice 'Could not grant select on %. Error: %', v_table, sqlerrm;
      end;

      begin
        execute format('alter publication supabase_realtime add table public.%I', v_table);
        raise notice 'Added % to supabase_realtime publication.', v_table;
      exception
        when duplicate_object then
          raise notice '% is already in supabase_realtime publication.', v_table;
        when undefined_object then
          raise notice 'supabase_realtime publication does not exist in this project. Skipping %.', v_table;
        when others then
          raise notice 'Could not add % to supabase_realtime publication. Error: %', v_table, sqlerrm;
      end;
    else
      raise notice 'Table public.% does not exist. Skipping.', v_table;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verify current realtime publication membership for Communication Centre tables.
select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename ilike 'communication_centre%'
order by tablename;
