-- Receipt save hotfix after the 360 Analytics status-history migration.
-- Analytics logging must never block receipt creation or receipt updates.

begin;

-- Receipt creation is a multi-step financial transaction. Remove the database
-- analytics trigger from receipts and let the application log the receipt only
-- after the receipt header and receipt items have been saved successfully.
drop trigger if exists lifecycle_status_history_trigger on public.receipts;

-- Make the shared lifecycle trigger fail-safe for every other module. A logging
-- problem is written as a PostgreSQL warning, but the source record still saves.
create or replace function public.log_lifecycle_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := to_jsonb(new);
  v_field text;
  v_old_status text;
  v_new_status text;
  v_entity_number text;
  v_title text;
  v_key text;
  v_notes text;
  v_change_reason text;
begin
  begin
    foreach v_key in array string_to_array(coalesce(tg_argv[2], ''), ',') loop
      if nullif(btrim(v_key), '') is not null then
        v_entity_number := coalesce(v_entity_number, nullif(btrim(v_new ->> btrim(v_key)), ''));
      end if;
    end loop;

    foreach v_key in array string_to_array(coalesce(tg_argv[3], ''), ',') loop
      if nullif(btrim(v_key), '') is not null then
        v_title := coalesce(v_title, nullif(btrim(v_new ->> btrim(v_key)), ''));
      end if;
    end loop;

    v_change_reason := coalesce(
      nullif(btrim(v_new ->> 'change_reason'), ''),
      nullif(btrim(v_new ->> 'reason'), '')
    );

    v_notes := coalesce(
      nullif(btrim(v_new ->> 'status_note'), ''),
      nullif(btrim(v_new ->> 'status_notes'), ''),
      nullif(btrim(v_new ->> 'notes'), ''),
      nullif(btrim(v_new ->> 'note'), ''),
      nullif(btrim(v_new ->> 'internal_notes'), ''),
      nullif(btrim(v_new ->> 'internal_note'), ''),
      nullif(btrim(v_new ->> 'proposal_notes'), ''),
      nullif(btrim(v_new ->> 'comments'), ''),
      nullif(btrim(v_new ->> 'comment'), ''),
      nullif(btrim(v_new ->> 'remarks'), ''),
      nullif(btrim(v_new ->> 'description'), ''),
      v_change_reason
    );

    foreach v_field in array string_to_array(coalesce(tg_argv[1], ''), ',') loop
      v_field := btrim(v_field);
      if v_field = '' then
        continue;
      end if;

      v_old_status := nullif(btrim(v_old ->> v_field), '');
      v_new_status := nullif(btrim(v_new ->> v_field), '');

      if v_new_status is not null
         and lower(coalesce(v_old_status, '')) <> lower(v_new_status) then
        perform public.add_lifecycle_status_log(
          tg_argv[0],
          v_new ->> 'id',
          v_entity_number,
          v_title,
          v_old_status,
          v_new_status,
          v_field,
          v_change_reason,
          v_notes,
          auth.uid()::text,
          auth.jwt() ->> 'email'
        );
      end if;
    end loop;
  exception when others then
    raise warning 'Lifecycle status logging skipped for %.%: %', tg_table_schema, tg_table_name, sqlerrm;
  end;

  return new;
end;
$$;

commit;

-- Verification: this should return zero rows for the receipts table.
select
  trigger_name,
  event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'receipts'
  and trigger_name = 'lifecycle_status_history_trigger';
