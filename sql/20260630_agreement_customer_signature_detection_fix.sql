begin;

alter table public.agreements
add column if not exists accepted_at timestamptz,
add column if not exists customer_signature_date date,
add column if not exists customer_accepted_at timestamptz,
add column if not exists customer_signed_at timestamptz,
add column if not exists customer_signature_confirmed boolean default false,
add column if not exists customer_signed_document_data_url text,
add column if not exists e_agreement_signature_confirmed boolean default false,
add column if not exists e_agreement_signature_signed_at timestamptz,
add column if not exists e_agreement_accepted_at timestamptz,
add column if not exists e_agreement_signed_document_data_url text;

-- Normalize customer-signature detection for agreement internal signing.
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
    coalesce(v_agreement.customer_signature_confirmed, false) = true
    or v_agreement.customer_signed_at is not null
    or v_agreement.customer_accepted_at is not null
    or v_agreement.accepted_at is not null
    or coalesce(v_agreement.e_agreement_signature_confirmed, false) = true
    or v_agreement.e_agreement_signature_signed_at is not null
    or v_agreement.customer_sign_date is not null
    or v_agreement.customer_signature_date is not null
    or nullif(v_agreement.customer_signed_document_data_url, '') is not null
    or nullif(v_agreement.e_agreement_signed_document_data_url, '') is not null;

  if not v_has_customer then
    return jsonb_build_object('agreement_id', p_agreement_id, 'status', v_agreement.status, 'has_customer_signature', false);
  end if;

  select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'SFC') into v_has_sfc;
  select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'GM') into v_has_gm;

  v_new_status := case when v_has_sfc and v_has_gm then 'signed' else 'accepted' end;

  update public.agreements
  set
    status = v_new_status,
    customer_signature_confirmed = true,
    customer_signed_at = coalesce(customer_signed_at, customer_accepted_at, accepted_at, e_agreement_signature_signed_at, e_agreement_accepted_at, now()),
    customer_accepted_at = coalesce(customer_accepted_at, customer_signed_at, accepted_at, e_agreement_accepted_at, e_agreement_signature_signed_at, now()),
    updated_at = now()
  where id = p_agreement_id;

  return jsonb_build_object('agreement_id', p_agreement_id, 'status', v_new_status, 'has_customer_signature', v_has_customer, 'has_sfc_signature', v_has_sfc, 'has_gm_signature', v_has_gm);
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
  if auth.uid() is null then raise exception 'You must be logged in to sign this agreement.'; end if;
  v_role := public.normalize_agreement_signer_role(p_signer_role);
  if v_role not in ('SFC', 'GM') then raise exception 'Invalid internal signer role. Only SFC and GM can sign agreements.'; end if;
  if p_signature_type not in ('typed', 'uploaded', 'drawn') then raise exception 'Invalid signature type.'; end if;
  if nullif(trim(coalesce(p_signer_name, '')), '') is null then raise exception 'Signer name is required.'; end if;
  if nullif(trim(coalesce(p_signer_title, '')), '') is null then raise exception 'Signer title is required.'; end if;

  select * into v_agreement from public.agreements where id = p_agreement_id;
  if not found then raise exception 'Agreement not found.'; end if;

  v_has_customer :=
    coalesce(v_agreement.customer_signature_confirmed, false) = true
    or v_agreement.customer_signed_at is not null
    or v_agreement.customer_accepted_at is not null
    or v_agreement.accepted_at is not null
    or coalesce(v_agreement.e_agreement_signature_confirmed, false) = true
    or v_agreement.e_agreement_signature_signed_at is not null
    or v_agreement.customer_sign_date is not null
    or v_agreement.customer_signature_date is not null
    or nullif(v_agreement.customer_signed_document_data_url, '') is not null
    or nullif(v_agreement.e_agreement_signed_document_data_url, '') is not null;
  if not v_has_customer then raise exception 'Customer must accept and sign the agreement before internal signing.'; end if;
  if lower(coalesce(v_agreement.status, '')) not in ('accepted', 'awaiting_provider_signature', 'awaiting_internal_signature', 'signed') then raise exception 'Agreement must be accepted by the customer before internal signing.'; end if;
  if v_role = 'GM' then
    select exists(select 1 from public.agreement_internal_signatures where agreement_id = p_agreement_id and signer_role = 'SFC') into v_has_sfc;
    if not v_has_sfc then raise exception 'Senior Financial Controller must sign before General Manager.'; end if;
  end if;

  insert into public.agreement_internal_signatures (agreement_id, signer_user_id, signer_email, signer_name, signer_role, signer_title, signature_type, signature_text, signature_image_data_url, signed_at, signed_by_role, updated_at)
  values (p_agreement_id, auth.uid(), auth.email(), trim(p_signer_name), v_role, trim(p_signer_title), p_signature_type, p_signature_text, p_signature_image_data_url, now(), v_role, now())
  on conflict (agreement_id, signer_role) do update set signer_user_id = excluded.signer_user_id, signer_email = excluded.signer_email, signer_name = excluded.signer_name, signer_title = excluded.signer_title, signature_type = excluded.signature_type, signature_text = excluded.signature_text, signature_image_data_url = excluded.signature_image_data_url, signed_at = now(), signed_by_role = excluded.signed_by_role, updated_at = now();

  if v_role = 'SFC' then
    update public.agreements set provider_official_signatory_1_sign_date = coalesce(provider_official_signatory_1_sign_date, current_date), provider_sign_date = coalesce(provider_sign_date, current_date), financial_controller_signed = true, updated_at = now() where id = p_agreement_id;
  elsif v_role = 'GM' then
    update public.agreements set provider_official_signatory_2_sign_date = coalesce(provider_official_signatory_2_sign_date, current_date), gm_signed = true, updated_at = now() where id = p_agreement_id;
  end if;

  v_status_result := public.refresh_agreement_signature_status(p_agreement_id);
  return jsonb_build_object('ok', true, 'agreement_id', p_agreement_id, 'signer_role', v_role, 'status_result', v_status_result);
end;
$$;

grant execute on function public.refresh_agreement_signature_status(uuid) to authenticated;
grant execute on function public.agreement_internal_sign(uuid, text, text, text, text, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
