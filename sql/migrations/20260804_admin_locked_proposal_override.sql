-- Transactional, audited Admin-only editing for locked proposals and their line items.
create table if not exists public.proposal_admin_override_audit (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  proposal_number text,
  previous_values jsonb not null,
  new_values jsonb not null,
  previous_status text,
  admin_user_id uuid not null,
  admin_name text,
  override_reason text not null,
  agreement_existed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.proposal_admin_override_audit enable row level security;
revoke all on public.proposal_admin_override_audit from public, anon, authenticated;

create or replace function public.enforce_accepted_proposal_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed_fields text[] := array[
    'e_signed_document_data_url', 'e_signed_document_file_name',
    'e_signed_document_mime_type', 'signed_document_path',
    'signed_document_name', 'signed_document_uploaded_at',
    'signed_document_uploaded_by', 'updated_at', 'updated_by'
  ];
begin
  -- Only the SECURITY DEFINER RPC below can establish this transaction-local context.
  if current_setting('app.admin_proposal_override', true) = 'on' then
    return new;
  end if;
  if lower(coalesce(old.status, '')) in ('accepted', 'expired', 'sent', 'rejected', 'converted', 'converted_to_agreement')
     and (to_jsonb(new) - v_allowed_fields) is distinct from (to_jsonb(old) - v_allowed_fields) then
    raise exception 'This proposal is locked.';
  end if;
  return new;
end;
$$;

create or replace function public.admin_update_locked_proposal(
  p_proposal_id uuid,
  p_changes jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.proposals%rowtype;
  v_new public.proposals%rowtype;
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_header jsonb := coalesce(p_changes->'proposal', '{}'::jsonb);
  v_items jsonb := coalesce(p_changes->'items', '[]'::jsonb);
  v_allowed_header constant text[] := array[
    'proposal_title','proposal_date','proposal_valid_until','valid_until','customer_name','customer_legal_name',
    'company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile',
    'customer_address','customer_contact_name','customer_contact_mobile','customer_contact_email',
    'currency','billing_frequency','payment_term','payment_terms','terms_conditions','internal_notes',
    'service_start_date','contract_term','account_number','po_number','is_poc','poc_location_count',
    'poc_license_count','poc_license_months','poc_service_start_date','poc_service_end_date','poc_success_kpis',
    'poc_conversion_commitment','customer_signatory_name','customer_signatory_title','customer_sign_date',
    'customer_signed_at','provider_signatory_name','provider_signatory_title','provider_sign_date','status',
    'subtotal_locations','subtotal_one_time','total_discount','grand_total'
  ];
  v_allowed_item constant text[] := array[
    'item_id','section','line_no','location_name','location_address','item_name','unit_price','discount_percent',
    'discounted_unit_price','quantity','license_quantity','line_total','service_start_date','service_end_date',
    'capability_name','capability_value','notes'
  ];
  v_cols text;
  v_assignments text;
  v_agreement_exists boolean;
  v_old_items jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select to_jsonb(p) into v_profile from public.profiles p where p.id = v_user_id;
  if lower(coalesce(v_profile->>'role', v_profile->>'role_key', '')) <> 'admin' then
    raise exception 'Admin role is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Reason for editing locked proposal is required.'; end if;

  select * into v_old from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal was not found.'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no, i.created_at), '[]'::jsonb)
    into v_old_items from public.proposal_items i where i.proposal_id = p_proposal_id;
  perform set_config('app.admin_proposal_override', 'on', true);

  select string_agg(format('%1$I = r.%1$I', c.column_name), ', ' order by c.ordinal_position)
    into v_assignments
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'proposals'
     and c.column_name = any(v_allowed_header) and v_header ? c.column_name;
  if v_assignments is not null then
    execute format('update public.proposals p set %s, updated_at = now() from (select (jsonb_populate_record(null::public.proposals, $1)).*) r where p.id = $2 returning p.*', v_assignments)
      into v_new using v_header, p_proposal_id;
  else
    update public.proposals set updated_at = now() where id = p_proposal_id returning * into v_new;
  end if;

  if jsonb_typeof(v_items) <> 'array' then raise exception 'Proposal items must be an array.'; end if;
  delete from public.proposal_items where proposal_id = p_proposal_id;
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'proposal_items'
     and c.column_name = any(v_allowed_item);
  if jsonb_array_length(v_items) > 0 then
    execute format('insert into public.proposal_items (proposal_id, %1$s) select $2, %1$s from jsonb_populate_recordset(null::public.proposal_items, $1)', v_cols)
      using v_items, p_proposal_id;
  end if;

  select exists(select 1 from public.agreements a where a.proposal_id = p_proposal_id) into v_agreement_exists;
  insert into public.proposal_admin_override_audit (
    proposal_id, proposal_number, previous_values, new_values, previous_status,
    admin_user_id, admin_name, override_reason, agreement_existed
  ) values (
    p_proposal_id, coalesce(v_old.ref_number, v_old.proposal_id),
    jsonb_build_object('proposal', to_jsonb(v_old), 'items', v_old_items),
    jsonb_build_object('proposal', to_jsonb(v_new), 'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.line_no, i.created_at) from public.proposal_items i where i.proposal_id = p_proposal_id), '[]'::jsonb)),
    v_old.status, v_user_id,
    coalesce(v_profile->>'full_name', v_profile->>'name', v_profile->>'email'), btrim(p_reason), v_agreement_exists
  );
  return jsonb_build_object(
    'proposal', to_jsonb(v_new),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.line_no, i.created_at) from public.proposal_items i where i.proposal_id = p_proposal_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_update_locked_proposal(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_update_locked_proposal(uuid, jsonb, text) to authenticated;
