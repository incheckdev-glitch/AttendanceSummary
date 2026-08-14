-- Administrative data correction for Agreement#00101 only.
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
    'contact_id', 'customer_contact_id', 'signatory_id', 'customer_signatory_id',
    'contact_name', 'contact_email', 'contact_phone', 'contact_mobile',
    'customer_contact_name', 'customer_contact_email', 'customer_contact_phone', 'customer_contact_mobile',
    'customer_email', 'customer_phone', 'customer_phone_number',
    'customer_official_signatory_name', 'customer_official_signatory_title', 'customer_official_sign_date',
    'customer_signatory_name', 'customer_signatory_title', 'customer_authorized_signatory_name',
    'customer_authorized_signatory_title', 'customer_signature', 'customer_signature_name', 'customer_signature_title',
    'customer_sign_date', 'customer_signature_date', 'customer_signatory_email', 'customer_signatory_phone',
    'customer_signed_at', ];
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
  where lower(regexp_replace(trim(coalesce(a.agreement_number, '')), '\s+', '', 'g')) in ('agreement#00101', 'agreement#101', '00101', '101')
     or lower(regexp_replace(trim(coalesce(a.agreement_id, '')), '\s+', '', 'g')) in ('agreement#00101', 'agreement#101', '00101', '101');

  if v_match_count <> 1 then
    raise exception 'Expected exactly one Agreement#00101 row, found %. No correction was applied.', v_match_count;
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
    raise exception 'Expected to update exactly one Agreement#00101 row, updated %.', v_updated_count;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_provider_after
  from jsonb_each((select to_jsonb(a) from public.agreements a where a.id = v_agreement_id))
  where key = any(v_provider_fields);

  if v_provider_after is distinct from v_provider_before then
    raise exception 'Provider signatories changed unexpectedly; Agreement#00101 correction was rolled back.';
  end if;
end $$;

-- Verification: `all_customer_fields_empty` must be true and `remaining_values`
-- must be {}. The key list is evaluated against the real deployed schema, so
-- this query does not assume that every historical alias is a physical column.
with target as (
  select to_jsonb(a) as row_data
  from public.agreements a
  where lower(regexp_replace(trim(coalesce(a.agreement_number, '')), '\s+', '', 'g')) in
          ('agreement#00101', 'agreement#101', '00101', '101')
     or lower(regexp_replace(trim(coalesce(a.agreement_id, '')), '\s+', '', 'g')) in
          ('agreement#00101', 'agreement#101', '00101', '101')
), customer_keys(key) as (
  select unnest(array[
    'contact_id', 'customer_contact_id', 'signatory_id', 'customer_signatory_id',
    'contact_name', 'contact_email', 'contact_phone', 'contact_mobile',
    'customer_contact_name', 'customer_contact_email', 'customer_contact_phone', 'customer_contact_mobile',
    'customer_official_signatory_name', 'customer_official_signatory_title', 'customer_official_sign_date',
    'customer_signatory_name', 'customer_signatory_title', 'customer_signatory_email', 'customer_signatory_phone',
    'customer_authorized_signatory_name', 'customer_authorized_signatory_title',
    'customer_signature', 'customer_signature_name', 'customer_signature_title', 'customer_sign_date',
    'customer_signature_date', 'customer_signed_at', ]::text[])
), remaining as (
  select e.key, e.value
  from target t
  cross join lateral jsonb_each(t.row_data) e
  join customer_keys k on k.key = e.key
  where e.value not in ('null'::jsonb, '""'::jsonb, 'false'::jsonb)
)
select
  (select count(*) from target) = 1 as exactly_one_target,
  not exists (select 1 from remaining) as all_customer_fields_empty,
  coalesce((select jsonb_object_agg(key, value) from remaining), '{}'::jsonb) as remaining_values;
