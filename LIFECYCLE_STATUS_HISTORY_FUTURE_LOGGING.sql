-- Lifecycle status history: durable, append-only logging for all future status changes.
-- Existing historical transitions cannot be reconstructed; the application creates a
-- current-status snapshot when history is first opened for an older entity.

create extension if not exists pgcrypto;

create table if not exists public.lifecycle_status_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  entity_number text,
  title text,
  old_status text,
  new_status text not null,
  status_field text not null default 'status',
  change_reason text,
  notes text,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz not null default now()
);

alter table public.lifecycle_status_logs add column if not exists entity_number text;
alter table public.lifecycle_status_logs add column if not exists title text;
alter table public.lifecycle_status_logs add column if not exists status_field text default 'status';
alter table public.lifecycle_status_logs add column if not exists change_reason text;
alter table public.lifecycle_status_logs add column if not exists notes text;
alter table public.lifecycle_status_logs add column if not exists changed_by uuid;
alter table public.lifecycle_status_logs add column if not exists changed_by_email text;
alter table public.lifecycle_status_logs add column if not exists changed_at timestamptz default now();

create index if not exists lifecycle_status_logs_entity_id_changed_at_idx
  on public.lifecycle_status_logs (entity_type, entity_id, changed_at desc);
create index if not exists lifecycle_status_logs_entity_number_changed_at_idx
  on public.lifecycle_status_logs (entity_type, entity_number, changed_at desc);

create or replace function public.add_lifecycle_status_log(
  p_entity_type text,
  p_entity_id text default null,
  p_entity_number text default null,
  p_title text default null,
  p_old_status text default null,
  p_new_status text default null,
  p_status_field text default 'status',
  p_change_reason text default null,
  p_notes text default null,
  p_changed_by text default null,
  p_changed_by_email text default null
) returns public.lifecycle_status_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lifecycle_status_logs;
  v_changed_by uuid;
begin
  if nullif(btrim(coalesce(p_new_status, '')), '') is null
     or lower(btrim(coalesce(p_old_status, ''))) = lower(btrim(coalesce(p_new_status, ''))) then
    return null;
  end if;

  begin v_changed_by := nullif(p_changed_by, '')::uuid; exception when invalid_text_representation then v_changed_by := null; end;

  -- A database trigger and the application fallback may observe the same transition.
  -- Return the existing row instead of inserting it twice when they run in one second.
  select * into v_row
  from public.lifecycle_status_logs l
  where l.entity_type = btrim(p_entity_type)
    and coalesce(l.entity_id, '') = coalesce(nullif(btrim(p_entity_id), ''), '')
    and coalesce(l.entity_number, '') = coalesce(nullif(btrim(p_entity_number), ''), '')
    and lower(coalesce(l.old_status, '')) = lower(coalesce(nullif(btrim(p_old_status), ''), ''))
    and lower(l.new_status) = lower(btrim(p_new_status))
    and l.changed_at >= date_trunc('second', clock_timestamp())
    and l.changed_at < date_trunc('second', clock_timestamp()) + interval '1 second'
  order by l.changed_at desc
  limit 1;
  if found then return v_row; end if;

  insert into public.lifecycle_status_logs (
    entity_type, entity_id, entity_number, title, old_status, new_status,
    status_field, change_reason, notes, changed_by, changed_by_email
  ) values (
    btrim(p_entity_type), nullif(btrim(p_entity_id), ''), nullif(btrim(p_entity_number), ''), nullif(btrim(p_title), ''),
    nullif(btrim(p_old_status), ''), btrim(p_new_status), coalesce(nullif(btrim(p_status_field), ''), 'status'),
    nullif(btrim(p_change_reason), ''), nullif(btrim(p_notes), ''), coalesce(v_changed_by, auth.uid()),
    coalesce(nullif(btrim(p_changed_by_email), ''), auth.jwt() ->> 'email')
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.get_lifecycle_status_history(
  p_entity_type text,
  p_entity_id text default null,
  p_entity_number text default null
) returns setof public.lifecycle_status_logs
language sql
stable
security definer
set search_path = public
as $$
  select l.*
  from public.lifecycle_status_logs l
  where l.entity_type = btrim(p_entity_type)
    and (
      (nullif(btrim(p_entity_id), '') is not null and l.entity_id = btrim(p_entity_id))
      or (nullif(btrim(p_entity_number), '') is not null and l.entity_number = btrim(p_entity_number))
    )
  order by l.changed_at desc;
$$;

grant execute on function public.add_lifecycle_status_log(text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_lifecycle_status_history(text,text,text) to authenticated;

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
begin
  foreach v_key in array string_to_array(tg_argv[2], ',') loop
    v_entity_number := coalesce(v_entity_number, nullif(btrim(v_new ->> btrim(v_key)), ''));
  end loop;
  foreach v_key in array string_to_array(tg_argv[3], ',') loop
    v_title := coalesce(v_title, nullif(btrim(v_new ->> btrim(v_key)), ''));
  end loop;

  foreach v_field in array string_to_array(tg_argv[1], ',') loop
    v_field := btrim(v_field);
    v_old_status := nullif(btrim(v_old ->> v_field), '');
    v_new_status := nullif(btrim(v_new ->> v_field), '');
    if v_new_status is not null and lower(coalesce(v_old_status, '')) <> lower(v_new_status) then
      perform public.add_lifecycle_status_log(
        tg_argv[0], v_new ->> 'id', v_entity_number, v_title, v_old_status, v_new_status,
        v_field, null, null, auth.uid()::text, auth.jwt() ->> 'email'
      );
    end if;
  end loop;
  return new;
end;
$$;

-- Install triggers only for tables that exist in this environment. Re-running this
-- migration refreshes every trigger without failing deployments that omit a module.
do $$
declare
  cfg text[];
  configs text[][] := array[
    array['leads','lead','status','lead_id,lead_number','company_name,title,full_name'],
    array['deals','deal','stage,status','deal_id,deal_number','title,deal_name,company_name'],
    array['proposals','proposal','status','proposal_number,proposal_id,ref_number','title,proposal_title,company_name'],
    array['agreements','agreement','status,agreement_status','agreement_number,agreement_id','title,agreement_title,customer_name'],
    array['invoices','invoice','status,payment_status,payment_state','invoice_number,invoice_id','title,customer_name,client_name'],
    array['receipts','receipt','status,receipt_status','receipt_number,receipt_id','title,customer_name,client_name'],
    array['credit_notes','credit_note','status','credit_note_number,credit_note_id','title,customer_name,reason'],
    array['operations_onboarding','operations_onboarding','onboarding_status,status','onboarding_id,agreement_id','title,client_name,company_name'],
    array['technical_admin_requests','technical_admin_request','request_status,technical_request_status,status','request_id,technical_request_id','title,request_title,company_name'],
    array['tickets','ticket','status','ticket_id','title,subject'],
    array['events','event','status','event_id','title,event_title,subject'],
    array['biners_entries','biners_entry','status,entry_status,payment_status','entry_number,biners_id','title,client_name,description'],
    array['biners_payment_schedules','biners_schedule','status,schedule_status,payment_status','schedule_number,schedule_no','title,client_name,description'],
    array['payment_forecast_followups','payment_forecast_follow_up','follow_up_status,status','followup_id,invoice_number','title,client_name']
  ];
begin
  foreach cfg slice 1 in array configs loop
    if to_regclass('public.' || cfg[1]) is not null then
      execute format('drop trigger if exists lifecycle_status_history_trigger on public.%I', cfg[1]);
      execute format(
        'create trigger lifecycle_status_history_trigger after insert or update on public.%I for each row execute function public.log_lifecycle_status_change(%L,%L,%L,%L)',
        cfg[1], cfg[2], cfg[3], cfg[4], cfg[5]
      );
    end if;
  end loop;
end $$;
