-- Fix Admin Override persistence for accepted, expired, sent, rejected, or otherwise locked proposals.
-- The RPC signature intentionally matches the frontend schema-cache lookup exactly:
-- public.admin_update_locked_proposal(p_changes jsonb, p_proposal_id uuid, p_reason text)

create table if not exists public.proposal_admin_override_audit (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  proposal_number text,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  previous_status text,
  new_status text,
  admin_user_id uuid not null,
  admin_name text,
  override_reason text not null,
  agreement_existed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.proposal_admin_override_audit
  add column if not exists proposal_number text,
  add column if not exists previous_values jsonb not null default '{}'::jsonb,
  add column if not exists new_values jsonb not null default '{}'::jsonb,
  add column if not exists previous_status text,
  add column if not exists new_status text,
  add column if not exists admin_user_id uuid,
  add column if not exists admin_name text,
  add column if not exists override_reason text,
  add column if not exists agreement_existed boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

alter table public.proposal_admin_override_audit enable row level security;
revoke all on public.proposal_admin_override_audit from public, anon, authenticated;

-- Resolve the current role from JWT metadata first, then from public.profiles.
create or replace function public.current_user_is_proposal_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_role text := '';
  v_profile jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    return false;
  end if;

  v_role := lower(trim(coalesce(
    v_jwt #>> '{app_metadata,role_key}',
    v_jwt #>> '{app_metadata,role}',
    v_jwt #>> '{user_metadata,role_key}',
    v_jwt #>> '{user_metadata,role}',
    v_jwt ->> 'role_key',
    v_jwt ->> 'app_role',
    ''
  )));

  if v_role in ('admin', 'super_admin', 'superadmin') then
    return true;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute 'select to_jsonb(p) from public.profiles p where p.id = $1 limit 1'
        into v_profile
        using v_user_id;
    exception
      when undefined_column then
        begin
          execute 'select to_jsonb(p) from public.profiles p where p.user_id = $1 limit 1'
            into v_profile
            using v_user_id;
        exception
          when undefined_column then
            v_profile := '{}'::jsonb;
        end;
    end;
  end if;

  v_role := lower(trim(coalesce(
    v_profile ->> 'role_key',
    v_profile ->> 'role',
    v_profile ->> 'app_role',
    ''
  )));

  return v_role in ('admin', 'super_admin', 'superadmin');
end;
$$;

-- Keep normal proposal locking in place, but allow the secure RPC to bypass it
-- only for the current transaction.
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
  if current_setting('app.admin_proposal_override', true) = 'on' then
    return new;
  end if;

  if lower(coalesce(old.status::text, '')) in (
      'accepted', 'expired', 'sent', 'rejected', 'converted', 'converted_to_agreement'
    )
    and (to_jsonb(new) - v_allowed_fields) is distinct from (to_jsonb(old) - v_allowed_fields)
  then
    raise exception 'This proposal is locked.';
  end if;

  return new;
end;
$$;

-- Remove both historical overloads so PostgREST cannot keep resolving an old RPC.
drop function if exists public.admin_update_locked_proposal(uuid, jsonb, text);
drop function if exists public.admin_update_locked_proposal(jsonb, uuid, text);

create function public.admin_update_locked_proposal(
  p_changes jsonb,
  p_proposal_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_old public.proposals%rowtype;
  v_new public.proposals%rowtype;
  v_old_items jsonb := '[]'::jsonb;
  v_new_items jsonb := '[]'::jsonb;
  v_header_source jsonb := '{}'::jsonb;
  v_header_normalized jsonb := '{}'::jsonb;
  v_header jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_items_supplied boolean := false;
  v_assignments text;
  v_update_sql text;
  v_item_columns text;
  v_agreement_exists boolean := false;
  v_admin_name text := '';
  v_received_keys text := '';
  v_valid_header_keys text := '';
  v_key text;
  v_value jsonb;
  v_snake_key text;
  v_allowed_header constant text[] := array[
    'proposal_title', 'proposal_date', 'proposal_valid_until', 'valid_until',
    'deal_id', 'company_id', 'company_name', 'contact_id', 'contact_name',
    'contact_email', 'contact_phone', 'contact_mobile',
    'customer_name', 'customer_legal_name', 'customer_address',
    'customer_contact_name', 'customer_contact_mobile', 'customer_contact_email',
    'customer_contact_phone', 'provider_contact_name', 'provider_contact_mobile',
    'provider_contact_email', 'provider_signatory_user_id',
    'service_start_date', 'service_end_date', 'contract_term', 'account_number',
    'billing_frequency', 'payment_term', 'payment_terms', 'po_number', 'currency',
    'is_poc', 'poc_location_count', 'poc_license_count', 'poc_license_months',
    'poc_service_start_date', 'poc_service_end_date', 'poc_success_kpis',
    'poc_conversion_commitment', 'terms_conditions', 'internal_notes',
    'customer_official_signatory_name', 'customer_official_signatory_title',
    'customer_signatory_name', 'customer_signatory_title',
    'customer_signature_name', 'customer_signature_title',
    'customer_signatory_email', 'customer_signatory_phone',
    'customer_sign_date', 'customer_signed_at',
    'provider_signatory_name', 'provider_signatory_title', 'provider_sign_date',
    'subtotal_locations', 'saas_total', 'subtotal_one_time', 'one_time_total',
    'total_discount', 'grand_total', 'status', 'generated_by', 'updated_by',
    'approved_annual_saas_discount_percent',
    'approved_one_time_fee_discount_percent',
    'approved_hardware_discount_percent', 'approved_discount_percent',
    'discount_approval_status', 'discount_approved_at', 'discount_approved_by',
    'last_discount_approval_request_id', 'approval_required_reason'
  ];
  v_allowed_item constant text[] := array[
    'item_id', 'section', 'line_no', 'location_name', 'location_address',
    'item_name', 'description', 'unit_price', 'discount_percent',
    'discounted_unit_price', 'quantity', 'license_quantity', 'line_total',
    'service_start_date', 'service_end_date', 'capability_name',
    'capability_value', 'notes'
  ];
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.current_user_is_proposal_admin() then
    raise exception 'Admin role is required.' using errcode = '42501';
  end if;

  if p_proposal_id is null then
    raise exception 'Proposal ID is required.';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes must be a JSON object.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason for editing locked proposal is required.';
  end if;

  select *
    into v_old
    from public.proposals
   where id = p_proposal_id
   for update;

  if not found then
    raise exception 'Proposal was not found.';
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute 'select to_jsonb(p) from public.profiles p where p.id = $1 limit 1'
        into v_profile
        using v_user_id;
    exception
      when undefined_column then
        begin
          execute 'select to_jsonb(p) from public.profiles p where p.user_id = $1 limit 1'
            into v_profile
            using v_user_id;
        exception
          when undefined_column then
            v_profile := '{}'::jsonb;
        end;
    end;
  end if;

  v_admin_name := coalesce(
    nullif(v_profile ->> 'name', ''),
    nullif(v_profile ->> 'full_name', ''),
    nullif(v_profile ->> 'email', ''),
    v_user_id::text
  );

  select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no nulls last, i.created_at nulls last), '[]'::jsonb)
    into v_old_items
    from public.proposal_items i
   where i.proposal_id = p_proposal_id;

  -- Accept current and older frontend payload shapes.
  if jsonb_typeof(p_changes -> 'proposal') = 'object' then
    v_header_source := p_changes -> 'proposal';
  elsif jsonb_typeof(p_changes -> 'changes') = 'object' then
    v_header_source := p_changes -> 'changes';
  elsif jsonb_typeof(p_changes -> 'updates') = 'object' then
    v_header_source := p_changes -> 'updates';
  elsif jsonb_typeof(p_changes -> 'form_data') = 'object' then
    v_header_source := p_changes -> 'form_data';
  elsif jsonb_typeof(p_changes -> 'formData') = 'object' then
    v_header_source := p_changes -> 'formData';
  else
    v_header_source := p_changes
      - 'items'
      - 'proposal_items'
      - 'payload_version';
  end if;

  v_items_supplied := jsonb_typeof(p_changes -> 'items') = 'array'
    or jsonb_typeof(p_changes -> 'proposal_items') = 'array';

  if jsonb_typeof(p_changes -> 'items') = 'array' then
    v_items := p_changes -> 'items';
  elsif jsonb_typeof(p_changes -> 'proposal_items') = 'array' then
    v_items := p_changes -> 'proposal_items';
  end if;

  -- Normalize camelCase or spaced keys to snake_case.
  for v_key, v_value in select key, value from jsonb_each(v_header_source)
  loop
    v_snake_key := lower(regexp_replace(
      regexp_replace(v_key, '([a-z0-9])([A-Z])', '\1_\2', 'g'),
      '[^a-zA-Z0-9]+', '_', 'g'
    ));
    v_header_normalized := v_header_normalized || jsonb_build_object(v_snake_key, v_value);
  end loop;

  -- Keep common aliases synchronized.
  if v_header_normalized ? 'payment_terms' and not (v_header_normalized ? 'payment_term') then
    v_header_normalized := v_header_normalized || jsonb_build_object('payment_term', v_header_normalized -> 'payment_terms');
  end if;
  if v_header_normalized ? 'payment_term' and not (v_header_normalized ? 'payment_terms') then
    v_header_normalized := v_header_normalized || jsonb_build_object('payment_terms', v_header_normalized -> 'payment_term');
  end if;
  if v_header_normalized ? 'valid_until' and not (v_header_normalized ? 'proposal_valid_until') then
    v_header_normalized := v_header_normalized || jsonb_build_object('proposal_valid_until', v_header_normalized -> 'valid_until');
  end if;
  if v_header_normalized ? 'proposal_valid_until' and not (v_header_normalized ? 'valid_until') then
    v_header_normalized := v_header_normalized || jsonb_build_object('valid_until', v_header_normalized -> 'proposal_valid_until');
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_header
    from jsonb_each(v_header_normalized) e
    join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'proposals'
     and c.column_name = e.key
     and c.is_generated = 'NEVER'
     and c.is_identity = 'NO'
   where e.key = any(v_allowed_header)
     and e.key not in ('id', 'proposal_id', 'ref_number', 'created_at', 'created_by', 'updated_at');

  select string_agg(key, ', ' order by key)
    into v_received_keys
    from jsonb_object_keys(v_header_source) as x(key);

  select string_agg(key, ', ' order by key)
    into v_valid_header_keys
    from jsonb_object_keys(v_header) as x(key);

  if jsonb_object_length(v_header) = 0 and not v_items_supplied then
    raise exception 'No valid proposal fields or proposal items were supplied. Received keys: [%].',
      coalesce(v_received_keys, 'none');
  end if;

  -- Transaction-local bypass consumed by the proposal lock trigger.
  perform set_config('app.admin_proposal_override', 'on', true);

  select string_agg(
           format('%1$I = (jsonb_populate_record(null::public.proposals, $1)).%1$I', c.column_name),
           ', ' order by c.ordinal_position
         )
    into v_assignments
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'proposals'
     and v_header ? c.column_name;

  if nullif(v_assignments, '') is not null then
    v_update_sql := format(
      'update public.proposals
          set %s%s
        where id = $2
        returning *',
      v_assignments,
      case when exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'proposals' and column_name = 'updated_at'
      ) then ', updated_at = now()' else '' end
    );

    execute v_update_sql
      into v_new
      using v_header, p_proposal_id;
  else
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'proposals' and column_name = 'updated_at'
    ) then
      update public.proposals
         set updated_at = now()
       where id = p_proposal_id
       returning * into v_new;
    else
      select * into v_new from public.proposals where id = p_proposal_id;
    end if;
  end if;

  if v_items_supplied then
    if jsonb_typeof(v_items) <> 'array' then
      raise exception 'Proposal items must be an array.';
    end if;

    delete from public.proposal_items where proposal_id = p_proposal_id;

    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
      into v_item_columns
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'proposal_items'
       and c.column_name = any(v_allowed_item)
       and c.column_name not in ('id', 'proposal_id', 'created_at', 'created_by', 'updated_at', 'updated_by')
       and c.is_generated = 'NEVER'
       and c.is_identity = 'NO';

    if jsonb_array_length(v_items) > 0 then
      if nullif(v_item_columns, '') is null then
        raise exception 'No writable proposal item columns were found.';
      end if;

      execute format(
        'insert into public.proposal_items (proposal_id, %1$s)
         select $2, %1$s
           from jsonb_populate_recordset(null::public.proposal_items, $1)',
        v_item_columns
      ) using v_items, p_proposal_id;
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no nulls last, i.created_at nulls last), '[]'::jsonb)
    into v_new_items
    from public.proposal_items i
   where i.proposal_id = p_proposal_id;

  select exists(
    select 1
      from public.agreements a
     where a.proposal_id = p_proposal_id
        or a.proposal_id::text = coalesce(v_old.proposal_id::text, '')
  ) into v_agreement_exists;

  insert into public.proposal_admin_override_audit (
    proposal_id,
    proposal_number,
    previous_values,
    new_values,
    previous_status,
    new_status,
    admin_user_id,
    admin_name,
    override_reason,
    agreement_existed
  ) values (
    p_proposal_id,
    coalesce(v_old.ref_number::text, v_old.proposal_id::text),
    jsonb_build_object('proposal', to_jsonb(v_old), 'items', v_old_items),
    jsonb_build_object('proposal', to_jsonb(v_new), 'items', v_new_items),
    v_old.status::text,
    v_new.status::text,
    v_user_id,
    v_admin_name,
    trim(p_reason),
    v_agreement_exists
  );

  return jsonb_build_object(
    'success', true,
    'proposal', to_jsonb(v_new),
    'items', v_new_items,
    'updated_fields', coalesce(v_valid_header_keys, ''),
    'agreement_exists', v_agreement_exists
  );
end;
$$;

revoke all on function public.current_user_is_proposal_admin() from public, anon;
grant execute on function public.current_user_is_proposal_admin() to authenticated;

revoke all on function public.admin_update_locked_proposal(jsonb, uuid, text) from public, anon;
grant execute on function public.admin_update_locked_proposal(jsonb, uuid, text) to authenticated;

notify pgrst, 'reload schema';
