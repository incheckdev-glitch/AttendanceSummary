-- Agreement internal e-signature complete fix
-- Flow: Customer signs public E-Agreement -> status accepted; SFC signs -> accepted; GM signs last -> signed.
-- Run in Supabase SQL Editor, then run: notify pgrst, 'reload schema';

begin;

create extension if not exists pgcrypto;

-- Customer/public e-agreement fields used by the ERP internal signing UI
alter table public.agreements
add column if not exists e_agreement_signature_confirmed boolean default false,
add column if not exists e_agreement_signature_signed_at timestamptz,
add column if not exists e_agreement_signature_type text,
add column if not exists e_agreement_signature_text text,
add column if not exists e_agreement_signature_image_data_url text,
add column if not exists e_agreement_signature_customer_name text,
add column if not exists e_agreement_signature_customer_email text,
add column if not exists e_agreement_signature_ip_address text,
add column if not exists e_agreement_signed_document_data_url text,
add column if not exists e_agreement_signed_document_file_name text,
add column if not exists e_agreement_signed_document_mime_type text,
add column if not exists e_agreement_accepted_at timestamptz,
add column if not exists e_agreement_accepted_by_name text,
add column if not exists e_agreement_accepted_by_email text,
add column if not exists e_agreement_accepted_comment text,
add column if not exists customer_accepted_at timestamptz,
add column if not exists customer_signed_at timestamptz,
add column if not exists customer_signed_by_name text,
add column if not exists customer_signed_by_email text,
add column if not exists customer_signature_type text,
add column if not exists customer_signature_text text,
add column if not exists customer_signature_image_data_url text,
add column if not exists customer_signed_document_data_url text,
add column if not exists customer_signed_document_file_name text,
add column if not exists customer_signed_document_mime_type text,
add column if not exists customer_signature_confirmed boolean default false,
add column if not exists customer_signature_ip_address text;

-- Audit table if not already created by the e-agreement migration
create table if not exists public.agreement_guest_activity_logs (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid null references public.agreements(id) on delete cascade,
  event_type text not null,
  token text null,
  customer_name text null,
  customer_email text null,
  ip_address text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Internal/provider signature table
create table if not exists public.agreement_internal_signatures (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  signer_user_id uuid null,
  signer_email text null,
  signer_name text not null,
  signer_role text not null,
  signer_title text null,
  signature_type text not null default 'typed',
  signature_text text null,
  signature_image_data_url text null,
  signed_at timestamptz not null default now(),
  signed_by_role text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_internal_signature_type_check
    check (signature_type in ('typed', 'uploaded', 'drawn')),
  constraint agreement_internal_signer_role_check
    check (signer_role in ('SFC', 'GM', 'ADMIN'))
);

create unique index if not exists agreement_internal_signatures_role_unique
on public.agreement_internal_signatures (agreement_id, signer_role);

create index if not exists agreement_internal_signatures_agreement_idx
on public.agreement_internal_signatures (agreement_id);

grant select on public.agreement_internal_signatures to authenticated;
grant insert, update on public.agreement_internal_signatures to authenticated;

create or replace function public.normalize_agreement_signer_role(p_role text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_role, ''))) in ('sfc','senior financial controller','senior_financial_controller','senior-financial-controller','financial controller') then 'SFC'
    when lower(trim(coalesce(p_role, ''))) in ('gm','general manager','general_manager','general-manager') then 'GM'
    when lower(trim(coalesce(p_role, ''))) = 'admin' then 'ADMIN'
    else upper(trim(coalesce(p_role, '')))
  end;
$$;

create or replace function public.refresh_agreement_signature_status(p_agreement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement record;
  v_has_customer boolean := false;
  v_has_sfc boolean := false;
  v_has_gm boolean := false;
  v_new_status text;
begin
  select * into v_agreement from public.agreements where id = p_agreement_id;
  if not found then raise exception 'Agreement not found.'; end if;

  if lower(coalesce(v_agreement.status, '')) = 'rejected' then
    return jsonb_build_object('agreement_id', p_agreement_id, 'status', v_agreement.status, 'message', 'Agreement is rejected.');
  end if;

  v_has_customer :=
    (coalesce(v_agreement.e_agreement_signature_confirmed, false) = true and v_agreement.e_agreement_signature_signed_at is not null)
    or (coalesce(v_agreement.customer_signature_confirmed, false) = true and v_agreement.customer_signed_at is not null);

  if not v_has_customer then
    return jsonb_build_object('agreement_id', p_agreement_id, 'status', v_agreement.status, 'has_customer_signature', false);
  end if;

  select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'SFC') into v_has_sfc;
  select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'GM') into v_has_gm;

  v_new_status := case when v_has_sfc and v_has_gm then 'signed' else 'accepted' end;

  update public.agreements
  set
    status = v_new_status,
    financial_controller_signed = case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='agreements' and column_name='financial_controller_signed') then v_has_sfc else financial_controller_signed end,
    gm_signed = case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='agreements' and column_name='gm_signed') then v_has_gm else gm_signed end,
    updated_at = now()
  where id = p_agreement_id;

  return jsonb_build_object(
    'agreement_id', p_agreement_id,
    'status', v_new_status,
    'has_customer_signature', v_has_customer,
    'has_sfc_signature', v_has_sfc,
    'has_gm_signature', v_has_gm
  );
end;
$$;

create or replace function public.agreement_internal_sign(
  p_agreement_id uuid,
  p_signer_role text,
  p_signer_name text,
  p_signer_title text,
  p_signature_type text default 'typed',
  p_signature_text text default null,
  p_signature_image_data_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement record;
  v_role text;
  v_has_customer boolean := false;
  v_has_sfc boolean := false;
  v_status_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to sign this agreement.';
  end if;

  v_role := public.normalize_agreement_signer_role(p_signer_role);

  if v_role not in ('SFC', 'GM') then
    raise exception 'Invalid internal signer role. Only SFC and GM can sign agreements.';
  end if;

  if p_signature_type not in ('typed', 'uploaded', 'drawn') then
    raise exception 'Invalid signature type.';
  end if;

  if nullif(trim(coalesce(p_signer_name, '')), '') is null then
    raise exception 'Signer name is required.';
  end if;

  if nullif(trim(coalesce(p_signer_title, '')), '') is null then
    raise exception 'Signer title is required.';
  end if;

  select * into v_agreement from public.agreements where id = p_agreement_id;
  if not found then raise exception 'Agreement not found.'; end if;

  v_has_customer :=
    (coalesce(v_agreement.e_agreement_signature_confirmed, false) = true and v_agreement.e_agreement_signature_signed_at is not null)
    or (coalesce(v_agreement.customer_signature_confirmed, false) = true and v_agreement.customer_signed_at is not null);

  if not v_has_customer then
    raise exception 'Customer must accept and sign the agreement before internal signing.';
  end if;

  if lower(coalesce(v_agreement.status, '')) not in ('accepted', 'awaiting_provider_signature', 'awaiting_internal_signature') then
    raise exception 'Agreement must be accepted by the customer before internal signing.';
  end if;

  if v_role = 'GM' then
    select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'SFC') into v_has_sfc;
    if not v_has_sfc then
      raise exception 'Senior Financial Controller must sign before General Manager.';
    end if;
  end if;

  insert into public.agreement_internal_signatures (
    agreement_id, signer_user_id, signer_email, signer_name, signer_role, signer_title,
    signature_type, signature_text, signature_image_data_url, signed_at, signed_by_role, updated_at
  ) values (
    p_agreement_id, auth.uid(), auth.email(), trim(p_signer_name), v_role, trim(p_signer_title),
    p_signature_type, p_signature_text, p_signature_image_data_url, now(), v_role, now()
  )
  on conflict (agreement_id, signer_role)
  do update set
    signer_user_id = excluded.signer_user_id,
    signer_email = excluded.signer_email,
    signer_name = excluded.signer_name,
    signer_title = excluded.signer_title,
    signature_type = excluded.signature_type,
    signature_text = excluded.signature_text,
    signature_image_data_url = excluded.signature_image_data_url,
    signed_at = now(),
    signed_by_role = excluded.signed_by_role,
    updated_at = now();

  -- Keep existing legacy date fields in sync when present.
  if v_role = 'SFC' then
    update public.agreements
    set
      provider_official_signatory_1_sign_date = coalesce(provider_official_signatory_1_sign_date, current_date),
      provider_sign_date = coalesce(provider_sign_date, current_date),
      financial_controller_signed = true,
      updated_at = now()
    where id = p_agreement_id;
  elsif v_role = 'GM' then
    update public.agreements
    set
      provider_official_signatory_2_sign_date = coalesce(provider_official_signatory_2_sign_date, current_date),
      gm_signed = true,
      updated_at = now()
    where id = p_agreement_id;
  end if;

  v_status_result := public.refresh_agreement_signature_status(p_agreement_id);

  return jsonb_build_object('ok', true, 'agreement_id', p_agreement_id, 'signer_role', v_role, 'status_result', v_status_result);
end;
$$;

-- Customer public accept should set accepted, not signed. It then waits for SFC and GM.
-- This replaces any previous version that set awaiting_provider_signature.
create or replace function public.eagreement_accept_with_ip(
  p_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_comment text default null,
  p_user_agent text default null,
  p_ip_address text default null,
  p_signature_type text default 'typed',
  p_signature_text text default null,
  p_signature_image_data_url text default null,
  p_signed_document_data_url text default null,
  p_signed_document_file_name text default null,
  p_signed_document_mime_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
  v_now timestamptz := now();
  v_today date := current_date;
begin
  select * into v_agreement
  from public.agreements
  where e_agreement_token = p_token
    and coalesce(e_agreement_link_enabled, false) = true
  limit 1;

  if not found then raise exception 'This agreement link is no longer available.'; end if;
  if v_agreement.e_agreement_token_expires_at is not null and v_agreement.e_agreement_token_expires_at < now() then raise exception 'This agreement link has expired.'; end if;
  if lower(coalesce(v_agreement.status, '')) in ('signed', 'active', 'signed_active', 'cancelled', 'canceled') then raise exception 'This agreement has already been completed.'; end if;

  update public.agreements
  set
    status = 'accepted',
    customer_official_sign_date = coalesce(customer_official_sign_date, v_today),
    customer_sign_date = coalesce(customer_sign_date, v_today),
    customer_signed_at = v_now,
    customer_accepted_at = v_now,
    customer_signed_by_name = btrim(p_customer_name),
    customer_signed_by_email = btrim(coalesce(p_customer_email, 'not-provided@customer.local')),
    customer_signature_type = coalesce(nullif(p_signature_type, ''), 'typed'),
    customer_signature_text = p_signature_text,
    customer_signature_image_data_url = p_signature_image_data_url,
    customer_signed_document_data_url = p_signed_document_data_url,
    customer_signed_document_file_name = p_signed_document_file_name,
    customer_signed_document_mime_type = p_signed_document_mime_type,
    customer_signature_confirmed = true,
    customer_signature_ip_address = p_ip_address,
    signed_date = null,
    e_agreement_accepted_at = v_now,
    e_agreement_accepted_by_name = btrim(p_customer_name),
    e_agreement_accepted_by_email = btrim(coalesce(p_customer_email, 'not-provided@customer.local')),
    e_agreement_accepted_comment = p_customer_comment,
    e_agreement_signature_type = coalesce(nullif(p_signature_type, ''), 'typed'),
    e_agreement_signature_text = p_signature_text,
    e_agreement_signature_image_data_url = p_signature_image_data_url,
    e_agreement_signed_document_data_url = p_signed_document_data_url,
    e_agreement_signed_document_file_name = p_signed_document_file_name,
    e_agreement_signed_document_mime_type = p_signed_document_mime_type,
    e_agreement_signature_signed_at = v_now,
    e_agreement_signature_customer_name = btrim(p_customer_name),
    e_agreement_signature_customer_email = btrim(coalesce(p_customer_email, 'not-provided@customer.local')),
    e_agreement_signature_ip_address = p_ip_address,
    e_agreement_signature_confirmed = true,
    e_agreement_link_enabled = false,
    updated_at = v_now
  where id = v_agreement.id
  returning * into v_agreement;

  insert into public.agreement_guest_activity_logs (agreement_id, event_type, token, customer_name, customer_email, ip_address, user_agent, metadata)
  values (v_agreement.id, 'accepted', p_token, btrim(p_customer_name), btrim(coalesce(p_customer_email, 'not-provided@customer.local')), p_ip_address, p_user_agent,
    jsonb_build_object('signature_type', coalesce(nullif(p_signature_type, ''), 'typed'), 'signed_document_file_name', p_signed_document_file_name, 'next_status', 'accepted'));

  perform public.refresh_agreement_signature_status(v_agreement.id);
  select * into v_agreement from public.agreements where id = v_agreement.id;
  return jsonb_build_object('ok', true, 'agreement', to_jsonb(v_agreement));
end;
$$;

grant execute on function public.refresh_agreement_signature_status(uuid) to authenticated;
grant execute on function public.agreement_internal_sign(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.eagreement_accept_with_ip(text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
