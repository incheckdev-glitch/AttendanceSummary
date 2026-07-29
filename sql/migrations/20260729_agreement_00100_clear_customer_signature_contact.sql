-- Administrative data correction for Agreement#00100 only.
-- Customer signature/contact snapshots are removed without changing provider
-- signatories, commercial terms, lifecycle state, client, locations, or items.

do $$
declare
  v_agreement_id uuid;
  v_match_count integer;
  v_set_clause text;
  v_updated_count integer;
  v_provider_before jsonb;
  v_provider_after jsonb;
  v_customer_fields text[] := array[
    'contact_id', 'contact_name', 'contact_email', 'contact_phone', 'contact_mobile',
    'customer_contact_name', 'customer_contact_email', 'customer_contact_phone', 'customer_contact_mobile',
    'customer_email', 'customer_phone', 'customer_phone_number',
    'customer_official_signatory_name', 'customer_official_signatory_title', 'customer_official_sign_date',
    'customer_signatory_name', 'customer_signatory_title', 'customer_authorized_signatory_name',
    'customer_authorized_signatory_title', 'customer_signature_name', 'customer_signature_title',
    'customer_sign_date', 'customer_signature_date', 'customer_signatory_email', 'customer_signatory_phone',
    'customer_signed_by_name', 'customer_signed_by_email', 'customer_signed_at', 'customer_accepted_at',
    'customer_signature_type', 'customer_signature_text', 'customer_signature_image_data_url',
    'customer_signed_document_data_url', 'customer_signed_document_file_name',
    'customer_signed_document_mime_type', 'customer_signature_ip_address', 'customer_signature_confirmed',
    'e_signature_customer_name', 'e_signature_customer_email', 'e_signature_signed_at',
    'e_signature_type', 'e_signature_text', 'e_signature_image_data_url', 'e_signature_ip_address',
    'e_signature_confirmed', 'e_signed_document_data_url', 'e_signed_document_file_name',
    'e_signed_document_mime_type', 'e_agreement_accepted_at', 'e_agreement_accepted_by_name',
    'e_agreement_accepted_by_email', 'e_agreement_accepted_comment', 'e_agreement_signature_type',
    'e_agreement_signature_text', 'e_agreement_signature_image_data_url',
    'e_agreement_signed_document_data_url', 'e_agreement_signed_document_file_name',
    'e_agreement_signed_document_mime_type', 'e_agreement_signature_signed_at',
    'e_agreement_signature_customer_name', 'e_agreement_signature_customer_email',
    'e_agreement_signature_ip_address', 'e_agreement_signature_confirmed'
  ];
  v_provider_fields text[] := array[
    'provider_official_signatory_1_name', 'provider_official_signatory_1_title',
    'provider_official_signatory_1_sign_date', 'provider_official_signatory_2_name',
    'provider_official_signatory_2_title', 'provider_official_signatory_2_sign_date',
    'provider_signatory_name_primary', 'provider_signatory_title_primary',
    'provider_signatory_name_secondary', 'provider_signatory_title_secondary',
    'provider_signatory_name', 'provider_signatory_title', 'provider_sign_date'
  ];
begin
  select count(*), min(a.id)
    into v_match_count, v_agreement_id
  from public.agreements a
  where lower(regexp_replace(trim(coalesce(a.agreement_number, '')), '\s+', '', 'g')) in ('agreement#00100', 'agreement#100', '00100', '100')
     or lower(regexp_replace(trim(coalesce(a.agreement_id, '')), '\s+', '', 'g')) in ('agreement#00100', 'agreement#100', '00100', '100');

  if v_match_count <> 1 then
    raise exception 'Expected exactly one Agreement#00100 row, found %. No correction was applied.', v_match_count;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_provider_before
  from jsonb_each((select to_jsonb(a) from public.agreements a where a.id = v_agreement_id))
  where key = any(v_provider_fields);

  select string_agg(
           format('%I = %s', c.column_name,
             case when c.data_type = 'boolean' then 'false' else 'NULL' end),
           ', '
         )
    into v_set_clause
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'agreements'
    and c.column_name = any(v_customer_fields);

  if coalesce(v_set_clause, '') = '' then
    raise exception 'No supported customer signature/contact columns exist on public.agreements.';
  end if;

  -- This owner-run migration intentionally bypasses application signed/locked UI guards.
  execute format('update public.agreements set %s where id = $1', v_set_clause)
    using v_agreement_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'Expected to update exactly one Agreement#00100 row, updated %.', v_updated_count;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_provider_after
  from jsonb_each((select to_jsonb(a) from public.agreements a where a.id = v_agreement_id))
  where key = any(v_provider_fields);

  if v_provider_after is distinct from v_provider_before then
    raise exception 'Provider signatories changed unexpectedly; Agreement#00100 correction was rolled back.';
  end if;
end $$;
