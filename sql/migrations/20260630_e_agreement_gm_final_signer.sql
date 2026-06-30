-- E-Agreement signing workflow: Customer -> SFC -> GM, with GM as final signer.

begin;

create or replace function public.refresh_agreement_signature_status(p_agreement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
  v_has_customer_signature boolean := false;
  v_has_sfc_signature boolean := false;
  v_has_gm_signature boolean := false;
begin
  select * into v_agreement
  from public.agreements
  where id = p_agreement_id
  limit 1;

  if not found then
    return;
  end if;

  if lower(coalesce(v_agreement.status, '')) = 'rejected' then
    return;
  end if;

  v_has_customer_signature := coalesce(v_agreement.e_agreement_signature_confirmed, false) = true
    and v_agreement.e_agreement_signature_signed_at is not null;

  if not v_has_customer_signature then
    return;
  end if;

  v_has_sfc_signature := v_agreement.provider_official_signatory_1_sign_date is not null;
  v_has_gm_signature := v_agreement.provider_official_signatory_2_sign_date is not null;

  update public.agreements
  set
    status = case when v_has_sfc_signature and v_has_gm_signature then 'signed' else 'accepted' end,
    signed_date = case
      when v_has_sfc_signature and v_has_gm_signature then coalesce(signed_date, greatest(
        coalesce(customer_official_sign_date, customer_sign_date),
        provider_official_signatory_1_sign_date,
        provider_official_signatory_2_sign_date
      ))
      else null
    end,
    gm_signed = v_has_gm_signature,
    financial_controller_signed = v_has_sfc_signature,
    provider_sign_date = provider_official_signatory_1_sign_date,
    updated_at = now()
  where id = p_agreement_id;
end;
$$;

create or replace function public.agreement_internal_sign(
  p_agreement_id uuid,
  p_signer_role text,
  p_signed_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.agreements%rowtype;
  v_role text := lower(regexp_replace(btrim(coalesce(p_signer_role, '')), '[^a-z0-9]+', '_', 'g'));
  v_sign_date date := coalesce(p_signed_date, current_date);
  v_has_customer_signature boolean := false;
  v_has_sfc_signature boolean := false;
begin
  select * into v_agreement
  from public.agreements
  where id = p_agreement_id
  limit 1;

  if not found then
    raise exception 'Agreement was not found.';
  end if;

  v_has_customer_signature := coalesce(v_agreement.e_agreement_signature_confirmed, false) = true
    and v_agreement.e_agreement_signature_signed_at is not null;

  if not v_has_customer_signature then
    raise exception 'Customer must accept and sign the agreement before internal signing.';
  end if;

  if lower(coalesce(v_agreement.status, '')) <> 'accepted' then
    raise exception 'Agreement must be accepted before internal signing.';
  end if;

  if v_role in ('senior_financial_controller', 'financial_controller', 'senior_fc', 'sfc') then
    update public.agreements
    set
      provider_official_signatory_1_sign_date = v_sign_date,
      provider_sign_date = v_sign_date,
      financial_controller_signed = true,
      updated_at = now()
    where id = p_agreement_id;
  elsif v_role in ('general_manager', 'gm') then
    v_has_sfc_signature := v_agreement.provider_official_signatory_1_sign_date is not null;
    if not v_has_sfc_signature then
      raise exception 'Senior Financial Controller must sign before General Manager.';
    end if;

    update public.agreements
    set
      provider_official_signatory_2_sign_date = v_sign_date,
      gm_signed = true,
      updated_at = now()
    where id = p_agreement_id;
  else
    raise exception 'Internal signer role must be SFC or GM.';
  end if;

  perform public.refresh_agreement_signature_status(p_agreement_id);

  select * into v_agreement from public.agreements where id = p_agreement_id;
  return jsonb_build_object('ok', true, 'agreement', to_jsonb(v_agreement));
end;
$$;

-- Customer acceptance should never fully sign the agreement. It only moves the
-- record to accepted, then waits for SFC and GM internal signatures.
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
    signed_document_uploaded_at = case when p_signature_type = 'signed_document_upload' then coalesce(signed_document_uploaded_at, v_now) else signed_document_uploaded_at end,
    signed_document_name = case when p_signature_type = 'signed_document_upload' then coalesce(nullif(p_signed_document_file_name, ''), signed_document_name) else signed_document_name end,
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
grant execute on function public.agreement_internal_sign(uuid, text, date) to authenticated;
grant execute on function public.eagreement_accept_with_ip(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

commit;
