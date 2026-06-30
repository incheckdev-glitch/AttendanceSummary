-- E-Agreement public link, customer signing, signed-document upload and IP audit.
-- Run this in Supabase SQL Editor, then deploy the Edge Function: eagreement-action.

begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.agreements
add column if not exists e_agreement_token text,
add column if not exists e_agreement_token_expires_at timestamptz,
add column if not exists e_agreement_link_enabled boolean default false,
add column if not exists e_agreement_generated_at timestamptz,
add column if not exists e_agreement_generated_by uuid,
add column if not exists e_agreement_viewed_at timestamptz,
add column if not exists e_agreement_accepted_at timestamptz,
add column if not exists e_agreement_accepted_by_name text,
add column if not exists e_agreement_accepted_by_email text,
add column if not exists e_agreement_accepted_comment text,
add column if not exists e_agreement_rejected_at timestamptz,
add column if not exists e_agreement_rejection_reason text,
add column if not exists e_agreement_signature_type text,
add column if not exists e_agreement_signature_text text,
add column if not exists e_agreement_signature_image_data_url text,
add column if not exists e_agreement_signed_document_data_url text,
add column if not exists e_agreement_signed_document_file_name text,
add column if not exists e_agreement_signed_document_mime_type text,
add column if not exists e_agreement_signature_signed_at timestamptz,
add column if not exists e_agreement_signature_customer_name text,
add column if not exists e_agreement_signature_customer_email text,
add column if not exists e_agreement_signature_ip_address text,
add column if not exists e_agreement_signature_confirmed boolean default false;

create unique index if not exists agreements_e_agreement_token_uidx
on public.agreements (e_agreement_token)
where e_agreement_token is not null;

create table if not exists public.agreement_guest_activity_logs (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid,
  event_type text not null,
  token text,
  customer_name text,
  customer_email text,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agreement_guest_activity_logs_agreement_idx on public.agreement_guest_activity_logs (agreement_id);
create index if not exists agreement_guest_activity_logs_token_idx on public.agreement_guest_activity_logs (token);
create index if not exists agreement_guest_activity_logs_created_idx on public.agreement_guest_activity_logs (created_at desc);
create index if not exists agreement_guest_activity_logs_ip_idx on public.agreement_guest_activity_logs (ip_address);

create or replace function public.eagreement_public_url(p_token text, p_base_url text default null)
returns text
language plpgsql
stable
as $$
declare
  v_base text;
begin
  v_base := nullif(trim(coalesce(p_base_url, '')), '');
  if v_base is null then
    v_base := 'https://incheck360.com';
  end if;
  v_base := regexp_replace(v_base, '/+$', '');
  return v_base || '/e-agreement/' || p_token;
end;
$$;

create or replace function public.eagreement_generate_link(
  p_agreement_id uuid,
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
  v_token text;
  v_expires_at timestamptz;
  v_base_url text;
  v_url text;
begin
  select * into v_agreement
  from public.agreements
  where id = p_agreement_id
  limit 1;

  if not found then
    raise exception 'Agreement was not found.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';
  v_base_url := nullif(trim(coalesce(p_base_url, '')), '');
  v_url := public.eagreement_public_url(v_token, v_base_url);

  update public.agreements
  set
    e_agreement_token = v_token,
    e_agreement_token_expires_at = v_expires_at,
    e_agreement_link_enabled = true,
    e_agreement_generated_at = now(),
    e_agreement_generated_by = auth.uid(),
    updated_at = now()
  where id = v_agreement.id
  returning * into v_agreement;

  insert into public.agreement_guest_activity_logs (
    agreement_id, event_type, token, metadata
  ) values (
    v_agreement.id,
    'link_generated',
    v_token,
    jsonb_build_object('url', v_url)
  );

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'url', v_url,
    'public_url', v_url,
    'expires_at', v_expires_at,
    'agreement', to_jsonb(v_agreement)
  );
end;
$$;

create or replace function public.eagreement_disable_link(p_agreement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
begin
  update public.agreements
  set
    e_agreement_link_enabled = false,
    updated_at = now()
  where id = p_agreement_id
  returning * into v_agreement;

  if not found then
    raise exception 'Agreement was not found.';
  end if;

  insert into public.agreement_guest_activity_logs (
    agreement_id, event_type, token, metadata
  ) values (
    v_agreement.id,
    'link_disabled',
    v_agreement.e_agreement_token,
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'agreement', to_jsonb(v_agreement));
end;
$$;

create or replace function public.eagreement_public_view_with_ip(
  p_token text,
  p_user_agent text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
  v_items jsonb;
begin
  select * into v_agreement
  from public.agreements
  where e_agreement_token = p_token
    and coalesce(e_agreement_link_enabled, false) = true
  limit 1;

  if not found then
    raise exception 'This agreement link is no longer available.';
  end if;

  if v_agreement.e_agreement_token_expires_at is not null and v_agreement.e_agreement_token_expires_at < now() then
    raise exception 'This agreement link has expired.';
  end if;

  update public.agreements
  set e_agreement_viewed_at = coalesce(e_agreement_viewed_at, now())
  where id = v_agreement.id;

  insert into public.agreement_guest_activity_logs (
    agreement_id, event_type, token, ip_address, user_agent, metadata
  ) values (
    v_agreement.id,
    'agreement_viewed',
    p_token,
    p_ip_address,
    p_user_agent,
    '{}'::jsonb
  );

  select coalesce(jsonb_agg(to_jsonb(ai) order by ai.line_no nulls last, ai.created_at), '[]'::jsonb)
  into v_items
  from public.agreement_items ai
  where ai.agreement_id = v_agreement.id
     or ai.agreement_id::text = v_agreement.agreement_id;

  return jsonb_build_object(
    'ok', true,
    'agreement', to_jsonb(v_agreement),
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

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
  v_next_status text;
begin
  select * into v_agreement
  from public.agreements
  where e_agreement_token = p_token
    and coalesce(e_agreement_link_enabled, false) = true
  limit 1;

  if not found then
    raise exception 'This agreement link is no longer available.';
  end if;

  if v_agreement.e_agreement_token_expires_at is not null and v_agreement.e_agreement_token_expires_at < now() then
    raise exception 'This agreement link has expired.';
  end if;

  if lower(coalesce(v_agreement.status, '')) in ('signed', 'active', 'signed_active', 'cancelled', 'canceled') then
    raise exception 'This agreement has already been completed.';
  end if;

  v_next_status := case
    when v_agreement.provider_official_signatory_1_sign_date is not null
     and v_agreement.provider_official_signatory_2_sign_date is not null
      then 'signed'
    else 'awaiting_provider_signature'
  end;

  update public.agreements
  set
    status = v_next_status,
    customer_official_sign_date = coalesce(customer_official_sign_date, v_today),
    customer_sign_date = coalesce(customer_sign_date, v_today),
    signed_date = case when v_next_status = 'signed' then coalesce(signed_date, v_today) else signed_date end,
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
    signed_document_uploaded_at = case when p_signature_type = 'signed_document_upload' then coalesce(signed_document_uploaded_at, v_now) else signed_document_uploaded_at end,
    signed_document_name = case when p_signature_type = 'signed_document_upload' then coalesce(nullif(p_signed_document_file_name, ''), signed_document_name) else signed_document_name end,
    updated_at = v_now
  where id = v_agreement.id
  returning * into v_agreement;

  insert into public.agreement_guest_activity_logs (
    agreement_id, event_type, token, customer_name, customer_email, ip_address, user_agent, metadata
  ) values (
    v_agreement.id,
    'accepted',
    p_token,
    btrim(p_customer_name),
    btrim(coalesce(p_customer_email, 'not-provided@customer.local')),
    p_ip_address,
    p_user_agent,
    jsonb_build_object(
      'signature_type', coalesce(nullif(p_signature_type, ''), 'typed'),
      'signed_document_file_name', p_signed_document_file_name,
      'next_status', v_next_status
    )
  );

  return jsonb_build_object('ok', true, 'agreement', to_jsonb(v_agreement));
end;
$$;

create or replace function public.eagreement_reject_with_ip(
  p_token text,
  p_customer_name text default null,
  p_customer_email text default null,
  p_rejection_reason text default null,
  p_user_agent text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
begin
  select * into v_agreement
  from public.agreements
  where e_agreement_token = p_token
    and coalesce(e_agreement_link_enabled, false) = true
  limit 1;

  if not found then
    raise exception 'This agreement link is no longer available.';
  end if;

  if lower(coalesce(v_agreement.status, '')) in ('signed', 'active', 'signed_active') then
    raise exception 'Signed agreements cannot be rejected.';
  end if;

  update public.agreements
  set
    status = 'rejected',
    e_agreement_rejected_at = now(),
    e_agreement_rejection_reason = p_rejection_reason,
    e_agreement_link_enabled = false,
    updated_at = now()
  where id = v_agreement.id
  returning * into v_agreement;

  insert into public.agreement_guest_activity_logs (
    agreement_id, event_type, token, customer_name, customer_email, ip_address, user_agent, metadata
  ) values (
    v_agreement.id,
    'rejected',
    p_token,
    p_customer_name,
    p_customer_email,
    p_ip_address,
    p_user_agent,
    jsonb_build_object('reason', p_rejection_reason)
  );

  return jsonb_build_object('ok', true, 'agreement', to_jsonb(v_agreement));
end;
$$;

grant execute on function public.eagreement_generate_link(uuid, text) to authenticated;
grant execute on function public.eagreement_disable_link(uuid) to authenticated;
grant execute on function public.eagreement_public_view_with_ip(text, text, text) to anon, authenticated;
grant execute on function public.eagreement_accept_with_ip(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.eagreement_reject_with_ip(text, text, text, text, text, text) to anon, authenticated;

grant select, insert, update on public.agreement_guest_activity_logs to authenticated;
grant insert on public.agreement_guest_activity_logs to anon;

notify pgrst, 'reload schema';

commit;
