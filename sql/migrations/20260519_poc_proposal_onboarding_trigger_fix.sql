-- POC Proposal -> Operations Onboarding fix
-- Run this once in Supabase SQL editor before testing the frontend update.
-- Purpose:
-- 1) Add POC/source columns needed by Operations Onboarding and Technical Admin.
-- 2) Create a SECURITY DEFINER RPC so an accepted POC proposal can create/update its onboarding row
--    even when the proposal owner is not HOO/admin and cannot directly insert operations_onboarding rows.
-- 3) Backfill existing accepted POC proposals that were saved before this fix.

begin;

alter table public.operations_onboarding
  add column if not exists onboarding_type text default 'agreement',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists proposal_id uuid,
  add column if not exists proposal_reference text,
  add column if not exists poc_start_date date,
  add column if not exists poc_end_date date,
  add column if not exists poc_location_count integer,
  add column if not exists poc_notes text,
  add column if not exists poc_details jsonb default '{}'::jsonb,
  add column if not exists technical_admin_request_id uuid;

alter table public.technical_admin_requests
  add column if not exists onboarding_type text default 'agreement',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists proposal_id uuid,
  add column if not exists proposal_reference text,
  add column if not exists poc_start_date date,
  add column if not exists poc_end_date date,
  add column if not exists poc_location_count integer,
  add column if not exists poc_details jsonb default '{}'::jsonb;

create unique index if not exists operations_onboarding_unique_poc_proposal
  on public.operations_onboarding (proposal_id)
  where onboarding_type = 'poc' and proposal_id is not null;

create unique index if not exists technical_admin_requests_unique_active_poc_onboarding
  on public.technical_admin_requests (onboarding_id)
  where lower(coalesce(request_type, technical_request_type, '')) = 'poc'
    and onboarding_id is not null
    and lower(coalesce(request_status, technical_request_status, '')) not in ('cancelled', 'canceled', 'rejected');

create or replace function public.ensure_poc_operations_onboarding_from_proposal(p_proposal_id uuid)
returns public.operations_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.proposals%rowtype;
  existing_row public.operations_onboarding%rowtype;
  saved_row public.operations_onboarding%rowtype;
  v_poc_location_count integer;
  v_poc_notes text;
  v_client_name text;
  v_proposal_reference text;
  v_requested_by uuid;
begin
  select *
    into p
  from public.proposals
  where id = p_proposal_id;

  if not found then
    raise exception 'Proposal % was not found', p_proposal_id;
  end if;

  if lower(coalesce(p.status, '')) <> 'accepted' or coalesce(p.is_poc, false) is not true then
    return null;
  end if;

  v_poc_location_count := greatest(coalesce(p.poc_location_count, p.poc_license_count, 0), 0);
  v_poc_notes := nullif(trim(concat_ws(E'\n\n', p.poc_success_kpis, p.poc_conversion_commitment)), '');
  v_client_name := nullif(trim(coalesce(p.customer_legal_name, p.customer_name, p.company_name, '')), '');
  v_proposal_reference := nullif(trim(coalesce(p.proposal_id, p.ref_number, p.id::text)), '');
  v_requested_by := coalesce(p.created_by, auth.uid());

  select *
    into existing_row
  from public.operations_onboarding
  where onboarding_type = 'poc'
    and proposal_id = p.id
  order by created_at asc nulls last
  limit 1;

  if found then
    update public.operations_onboarding
       set source_type = 'proposal',
           source_id = p.id,
           proposal_reference = v_proposal_reference,
           client_name = v_client_name,
           request_type = 'POC',
           technical_request_type = 'POC',
           onboarding_status = coalesce(nullif(operations_onboarding.onboarding_status, ''), 'Pending Technical Request'),
           request_status = coalesce(nullif(operations_onboarding.request_status, ''), 'Not Requested'),
           technical_request_status = coalesce(nullif(operations_onboarding.technical_request_status, ''), 'Not Requested'),
           request_message = coalesce(nullif(operations_onboarding.request_message, ''), v_poc_notes, 'POC technical onboarding required.'),
           request_details = coalesce(nullif(operations_onboarding.request_details, ''), v_poc_notes),
           technical_request_details = coalesce(nullif(operations_onboarding.technical_request_details, ''), v_poc_notes),
           poc_start_date = p.poc_service_start_date,
           poc_end_date = p.poc_service_end_date,
           poc_location_count = nullif(v_poc_location_count, 0),
           location_count = v_poc_location_count,
           locations_count = v_poc_location_count,
           number_of_locations = v_poc_location_count,
           poc_notes = v_poc_notes,
           requested_by = coalesce(operations_onboarding.requested_by, v_requested_by),
           requested_at = coalesce(operations_onboarding.requested_at, now()),
           updated_at = now()
     where id = existing_row.id
     returning * into saved_row;

    return saved_row;
  end if;

  insert into public.operations_onboarding (
    onboarding_id,
    onboarding_type,
    source_type,
    source_id,
    proposal_id,
    proposal_reference,
    agreement_id,
    agreement_number,
    client_name,
    request_type,
    technical_request_type,
    onboarding_status,
    request_status,
    technical_request_status,
    request_message,
    request_details,
    technical_request_details,
    poc_start_date,
    poc_end_date,
    poc_location_count,
    location_count,
    locations_count,
    number_of_locations,
    poc_notes,
    requested_by,
    requested_at,
    created_at,
    updated_at
  ) values (
    'OP-POC-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text), 1, 5)),
    'poc',
    'proposal',
    p.id,
    p.id,
    v_proposal_reference,
    null,
    null,
    v_client_name,
    'POC',
    'POC',
    'Pending Technical Request',
    'Not Requested',
    'Not Requested',
    coalesce(v_poc_notes, 'POC technical onboarding required.'),
    v_poc_notes,
    v_poc_notes,
    p.poc_service_start_date,
    p.poc_service_end_date,
    nullif(v_poc_location_count, 0),
    v_poc_location_count,
    v_poc_location_count,
    v_poc_location_count,
    v_poc_notes,
    v_requested_by,
    now(),
    now(),
    now()
  )
  returning * into saved_row;

  return saved_row;
end;
$$;

grant execute on function public.ensure_poc_operations_onboarding_from_proposal(uuid) to authenticated;

-- Backfill accepted POC proposals already saved before this fix.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.proposals
    where lower(coalesce(status, '')) = 'accepted'
      and coalesce(is_poc, false) is true
  loop
    perform public.ensure_poc_operations_onboarding_from_proposal(r.id);
  end loop;
end $$;

commit;

-- Verification query:
-- select onboarding_id, onboarding_type, source_type, proposal_reference, client_name,
--        onboarding_status, request_type, technical_request_status,
--        poc_start_date, poc_end_date, poc_location_count, created_at
-- from public.operations_onboarding
-- where onboarding_type = 'poc'
-- order by created_at desc;
