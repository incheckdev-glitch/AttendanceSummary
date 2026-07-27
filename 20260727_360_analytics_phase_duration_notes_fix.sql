-- 360 Analytics phase-duration and phase-history note fix.
-- 1) Keeps one status row per real transition.
-- 2) Enriches a same-second trigger-created row with application notes/reason.
-- 3) Captures available note fields directly from the changed source record.

begin;

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

  begin
    v_changed_by := nullif(p_changed_by, '')::uuid;
  exception when invalid_text_representation then
    v_changed_by := null;
  end;

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
  limit 1
  for update;

  if found then
    update public.lifecycle_status_logs
    set
      title = coalesce(nullif(title, ''), nullif(btrim(p_title), '')),
      status_field = coalesce(nullif(status_field, ''), nullif(btrim(p_status_field), ''), 'status'),
      change_reason = coalesce(nullif(change_reason, ''), nullif(btrim(p_change_reason), '')),
      notes = coalesce(nullif(notes, ''), nullif(btrim(p_notes), '')),
      changed_by = coalesce(changed_by, v_changed_by, auth.uid()),
      changed_by_email = coalesce(nullif(changed_by_email, ''), nullif(btrim(p_changed_by_email), ''), auth.jwt() ->> 'email')
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

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
  foreach v_key in array string_to_array(tg_argv[2], ',') loop
    v_entity_number := coalesce(v_entity_number, nullif(btrim(v_new ->> btrim(v_key)), ''));
  end loop;

  foreach v_key in array string_to_array(tg_argv[3], ',') loop
    v_title := coalesce(v_title, nullif(btrim(v_new ->> btrim(v_key)), ''));
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

  foreach v_field in array string_to_array(tg_argv[1], ',') loop
    v_field := btrim(v_field);
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

  return new;
end;
$$;

-- Refresh triggers only on tables that exist in this deployment.
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

grant execute on function public.add_lifecycle_status_log(text,text,text,text,text,text,text,text,text,text,text) to authenticated;

commit;
