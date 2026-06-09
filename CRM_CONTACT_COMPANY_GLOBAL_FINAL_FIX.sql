-- =========================================================
-- FINAL GLOBAL FIX: COMPANY / CONTACT RELATIONS
-- Purpose:
-- 1) Fix contact dropdowns showing empty for companies.
-- 2) Support contacts assigned to multiple companies.
-- 3) Avoid FK errors caused by contacts.company_id pointing to a company UUID column different from companies.id.
-- 4) Keep future contact creates/updates synced automatically.
--
-- Run this once in Supabase, then deploy the updated JS files.
-- =========================================================

-- Drop return-table functions first to avoid: cannot change return type of existing function.
drop function if exists public.crm_contact_belongs_to_company(text, text);
drop function if exists public.crm_get_contacts_for_company_key(text);
drop function if exists public.crm_get_contacts_for_company(uuid);
drop function if exists public.crm_search_companies_for_select(text, integer);
drop function if exists public.crm_get_company_by_key(text);
drop function if exists public.crm_get_contact_by_key(text);
drop function if exists public.crm_upsert_contact_company_links(text, text[]);
drop function if exists public.crm_sync_contact_company_links_for_contact(uuid);
drop function if exists public.crm_sync_contact_company_links_trigger();
drop function if exists public.crm_contact_json_matches_company(jsonb, uuid);

drop trigger if exists trg_crm_sync_contact_company_links on public.contacts;

create or replace function public.crm_normalize_key(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.crm_digits_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '^0+', ''), '');
$$;

create table if not exists public.crm_contact_company_links (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source text default 'auto',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (contact_id, company_id)
);

-- Detect what value contacts.company_id expects from companies.
-- In some schemas it references companies.id; in others it references companies.company_uuid or another UUID column.
create or replace function public.crm_company_contact_fk_value(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_col text;
  v_value text;
begin
  select ref_att.attname
  into v_ref_col
  from pg_constraint con
  join unnest(con.conkey) with ordinality local_cols(attnum, ord) on true
  join unnest(con.confkey) with ordinality ref_cols(attnum, ord) on ref_cols.ord = local_cols.ord
  join pg_attribute local_att
    on local_att.attrelid = con.conrelid
   and local_att.attnum = local_cols.attnum
  join pg_attribute ref_att
    on ref_att.attrelid = con.confrelid
   and ref_att.attnum = ref_cols.attnum
  where con.contype = 'f'
    and con.conrelid = 'public.contacts'::regclass
    and con.confrelid = 'public.companies'::regclass
    and local_att.attname = 'company_id'
  limit 1;

  if v_ref_col is null then
    return p_company_id::text;
  end if;

  execute format('select %I::text from public.companies where id = $1 limit 1', v_ref_col)
  into v_value
  using p_company_id;

  return coalesce(nullif(v_value, ''), p_company_id::text);
end;
$$;

create or replace function public.crm_resolve_company_uuid(p_company_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_company_key, ''));
  v_norm text;
  v_digits text;
  v_company_id uuid;
begin
  if v_key = '' then
    return null;
  end if;

  v_norm := public.crm_normalize_key(v_key);
  v_digits := public.crm_digits_key(v_key);

  if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select c.id into v_company_id from public.companies c where c.id = v_key::uuid limit 1;
    if v_company_id is not null then return v_company_id; end if;
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where public.crm_normalize_key(c.id::text) = v_norm
     or public.crm_normalize_key(public.crm_company_contact_fk_value(c.id)) = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'company_id') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'company_number') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'company_code') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'reference') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'code') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'legal_name') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'company_name') = v_norm
     or public.crm_normalize_key(to_jsonb(c)->>'name') = v_norm
     or (
       v_digits is not null and (
         public.crm_digits_key(to_jsonb(c)->>'company_id') = v_digits
         or public.crm_digits_key(to_jsonb(c)->>'company_number') = v_digits
         or public.crm_digits_key(to_jsonb(c)->>'company_code') = v_digits
         or public.crm_digits_key(to_jsonb(c)->>'reference') = v_digits
         or public.crm_digits_key(to_jsonb(c)->>'code') = v_digits
       )
     )
     -- Handles labels such as Company#00017 · Company Name
     or position(public.crm_normalize_key(to_jsonb(c)->>'company_id') in v_norm) > 0
     or position(public.crm_normalize_key(to_jsonb(c)->>'company_number') in v_norm) > 0
     or position(public.crm_normalize_key(to_jsonb(c)->>'company_code') in v_norm) > 0
  order by
    case
      when public.crm_normalize_key(to_jsonb(c)->>'company_id') = v_norm then 0
      when public.crm_normalize_key(to_jsonb(c)->>'company_number') = v_norm then 1
      when public.crm_normalize_key(to_jsonb(c)->>'company_code') = v_norm then 2
      when public.crm_normalize_key(to_jsonb(c)->>'legal_name') = v_norm then 3
      when public.crm_normalize_key(to_jsonb(c)->>'company_name') = v_norm then 4
      else 20
    end,
    coalesce(c.updated_at, c.created_at) desc nulls last
  limit 1;

  return v_company_id;
end;
$$;

create or replace function public.crm_resolve_contact_uuid(p_contact_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_contact_key, ''));
  v_norm text;
  v_digits text;
  v_contact_id uuid;
begin
  if v_key = '' then
    return null;
  end if;

  v_norm := public.crm_normalize_key(v_key);
  v_digits := public.crm_digits_key(v_key);

  if v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ct.id into v_contact_id from public.contacts ct where ct.id = v_key::uuid limit 1;
    if v_contact_id is not null then return v_contact_id; end if;
  end if;

  select ct.id
  into v_contact_id
  from public.contacts ct
  where public.crm_normalize_key(ct.id::text) = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'contact_id') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'contact_number') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'contact_code') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'reference') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'code') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'name') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'contact_name') = v_norm
     or public.crm_normalize_key(to_jsonb(ct)->>'full_name') = v_norm
     or public.crm_normalize_key(concat_ws(' ', to_jsonb(ct)->>'first_name', to_jsonb(ct)->>'last_name')) = v_norm
     or (
       v_digits is not null and (
         public.crm_digits_key(to_jsonb(ct)->>'contact_id') = v_digits
         or public.crm_digits_key(to_jsonb(ct)->>'contact_number') = v_digits
         or public.crm_digits_key(to_jsonb(ct)->>'contact_code') = v_digits
         or public.crm_digits_key(to_jsonb(ct)->>'reference') = v_digits
         or public.crm_digits_key(to_jsonb(ct)->>'code') = v_digits
       )
     )
     or position(public.crm_normalize_key(to_jsonb(ct)->>'contact_id') in v_norm) > 0
     or position(public.crm_normalize_key(to_jsonb(ct)->>'contact_number') in v_norm) > 0
     or position(public.crm_normalize_key(to_jsonb(ct)->>'contact_code') in v_norm) > 0
  order by
    case
      when public.crm_normalize_key(to_jsonb(ct)->>'contact_id') = v_norm then 0
      when public.crm_normalize_key(to_jsonb(ct)->>'contact_number') = v_norm then 1
      when public.crm_normalize_key(to_jsonb(ct)->>'contact_code') = v_norm then 2
      when public.crm_normalize_key(to_jsonb(ct)->>'full_name') = v_norm then 3
      else 20
    end,
    coalesce(ct.updated_at, ct.created_at) desc nulls last
  limit 1;

  return v_contact_id;
end;
$$;

-- Universal matcher for a contact JSON row against a company.
-- It checks company_id, company_ids array, company_uuid, client_id, company refs/codes, and company names.
create or replace function public.crm_contact_json_matches_company(p_contact jsonb, p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company jsonb;
  v_company_keys text[] := array[]::text[];
  v_contact_values text[] := array[]::text[];
  v_key text;
  v_value text;
  v_json_value jsonb;
  v_item text;
  v_contact_norm text;
  v_key_norm text;
  v_contact_digits text;
  v_key_digits text;
begin
  if p_contact is null or p_company_id is null then
    return false;
  end if;

  select to_jsonb(c) into v_company from public.companies c where c.id = p_company_id limit 1;
  if v_company is null then return false; end if;

  v_company_keys := array_remove(array[
    p_company_id::text,
    public.crm_company_contact_fk_value(p_company_id),
    v_company->>'company_id',
    v_company->>'company_number',
    v_company->>'company_code',
    v_company->>'reference',
    v_company->>'code',
    v_company->>'legal_name',
    v_company->>'company_name',
    v_company->>'name'
  ], null);

  foreach v_key in array array['company_id','company_uuid','client_id','company_ref','company_number','company_code','company_reference','company_name','client_name','company_names','company_ids'] loop
    v_json_value := p_contact -> v_key;
    if v_json_value is null or v_json_value = 'null'::jsonb then
      continue;
    end if;

    if jsonb_typeof(v_json_value) = 'array' then
      for v_item in select jsonb_array_elements_text(v_json_value) loop
        if trim(coalesce(v_item, '')) <> '' then v_contact_values := array_append(v_contact_values, trim(v_item)); end if;
      end loop;
    else
      v_value := trim(coalesce(p_contact ->> v_key, ''));
      if v_value <> '' then
        -- Handle text representations like {uuid1,uuid2} or uuid1, uuid2.
        if v_key in ('company_ids','company_names') and (position(',' in v_value) > 0 or (left(v_value, 1) = '{' and right(v_value, 1) = '}')) then
          for v_item in select regexp_split_to_table(regexp_replace(v_value, '[{}\[\]"]', '', 'g'), '\s*,\s*') loop
            if trim(coalesce(v_item, '')) <> '' then v_contact_values := array_append(v_contact_values, trim(v_item)); end if;
          end loop;
        else
          v_contact_values := array_append(v_contact_values, v_value);
        end if;
      end if;
    end if;
  end loop;

  foreach v_value in array v_contact_values loop
    v_contact_norm := public.crm_normalize_key(v_value);
    v_contact_digits := public.crm_digits_key(v_value);
    if v_contact_norm = '' then continue; end if;

    foreach v_key in array v_company_keys loop
      if trim(coalesce(v_key, '')) = '' then continue; end if;
      v_key_norm := public.crm_normalize_key(v_key);
      v_key_digits := public.crm_digits_key(v_key);
      if v_key_norm <> '' and v_contact_norm = v_key_norm then return true; end if;
      if v_contact_digits is not null and v_key_digits is not null and v_contact_digits = v_key_digits then return true; end if;
    end loop;
  end loop;

  return false;
end;
$$;

create or replace function public.crm_sync_contact_company_links_for_contact(p_contact_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_contact_id is null then return 0; end if;

  -- Remove only automatic links. Manual links are preserved.
  delete from public.crm_contact_company_links
  where contact_id = p_contact_id
    and coalesce(source, '') ilike 'auto%';

  insert into public.crm_contact_company_links (contact_id, company_id, source, updated_at)
  select
    ct.id,
    c.id,
    'auto-sync-from-contact-fields',
    now()
  from public.contacts ct
  cross join public.companies c
  where ct.id = p_contact_id
    and public.crm_contact_json_matches_company(to_jsonb(ct), c.id)
  on conflict (contact_id, company_id)
  do update set updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.crm_sync_contact_company_links_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_sync_contact_company_links_for_contact(new.id);
  return new;
end;
$$;

create trigger trg_crm_sync_contact_company_links
after insert or update on public.contacts
for each row
execute function public.crm_sync_contact_company_links_trigger();

create or replace function public.crm_upsert_contact_company_links(p_contact_key text, p_company_keys text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_company_key text;
  v_company_id uuid;
  v_any boolean := false;
begin
  v_contact_id := public.crm_resolve_contact_uuid(p_contact_key);
  if v_contact_id is null then return false; end if;

  foreach v_company_key in array coalesce(p_company_keys, array[]::text[]) loop
    v_company_id := public.crm_resolve_company_uuid(v_company_key);
    if v_company_id is null then continue; end if;

    insert into public.crm_contact_company_links (contact_id, company_id, source, updated_at)
    values (v_contact_id, v_company_id, 'frontend-explicit-link', now())
    on conflict (contact_id, company_id)
    do update set source = excluded.source, updated_at = now();

    v_any := true;
  end loop;

  return v_any;
end;
$$;

-- Backfill all existing contacts once.
do $$
declare
  r record;
begin
  for r in select id from public.contacts loop
    perform public.crm_sync_contact_company_links_for_contact(r.id);
  end loop;
end $$;

create or replace function public.crm_get_contacts_for_company(p_company_id uuid)
returns table (
  contact_uuid uuid,
  contact_ref text,
  contact_name text,
  email text,
  phone text,
  contact_position text,
  selected_company_uuid uuid,
  selected_company_ref text,
  selected_company_name text,
  is_primary boolean,
  raw_contact jsonb
)
language sql
security definer
set search_path = public
as $$
with selected_company as (
  select
    c.id,
    coalesce(nullif(to_jsonb(c)->>'company_id', ''), nullif(to_jsonb(c)->>'company_number', ''), nullif(to_jsonb(c)->>'company_code', ''), nullif(to_jsonb(c)->>'reference', ''), nullif(to_jsonb(c)->>'code', '')) as company_ref,
    coalesce(nullif(to_jsonb(c)->>'legal_name', ''), nullif(to_jsonb(c)->>'company_name', ''), nullif(to_jsonb(c)->>'name', '')) as company_name
  from public.companies c
  where c.id = p_company_id
  limit 1
),
candidate_contacts as (
  select l.contact_id, 1 as source_rank
  from public.crm_contact_company_links l
  where l.company_id = p_company_id

  union

  select ct.id as contact_id, 2 as source_rank
  from public.contacts ct
  where public.crm_contact_json_matches_company(to_jsonb(ct), p_company_id)
),
deduped as (
  select contact_id, min(source_rank) as source_rank
  from candidate_contacts
  group by contact_id
)
select
  ct.id::uuid as contact_uuid,
  coalesce(nullif(to_jsonb(ct)->>'contact_id', ''), nullif(to_jsonb(ct)->>'contact_number', ''), nullif(to_jsonb(ct)->>'contact_code', ''), nullif(to_jsonb(ct)->>'reference', ''), nullif(to_jsonb(ct)->>'code', '')) as contact_ref,
  coalesce(
    nullif(concat_ws(' ', nullif(to_jsonb(ct)->>'first_name', ''), nullif(to_jsonb(ct)->>'last_name', '')), ''),
    nullif(to_jsonb(ct)->>'name', ''),
    nullif(to_jsonb(ct)->>'contact_name', ''),
    nullif(to_jsonb(ct)->>'full_name', ''),
    'Unnamed Contact'
  ) as contact_name,
  coalesce(nullif(to_jsonb(ct)->>'email', ''), nullif(to_jsonb(ct)->>'contact_email', '')) as email,
  coalesce(nullif(to_jsonb(ct)->>'phone', ''), nullif(to_jsonb(ct)->>'phone_number', ''), nullif(to_jsonb(ct)->>'mobile', '')) as phone,
  coalesce(nullif(to_jsonb(ct)->>'position', ''), nullif(to_jsonb(ct)->>'title', ''), nullif(to_jsonb(ct)->>'job_title', '')) as contact_position,
  sc.id as selected_company_uuid,
  sc.company_ref as selected_company_ref,
  sc.company_name as selected_company_name,
  case when lower(coalesce(to_jsonb(ct)->>'is_primary', to_jsonb(ct)->>'is_primary_contact', 'false')) in ('true','yes','1') then true else false end as is_primary,
  to_jsonb(ct) as raw_contact
from deduped d
join public.contacts ct on ct.id = d.contact_id
cross join selected_company sc
where lower(coalesce(to_jsonb(ct)->>'is_deleted', 'false')) not in ('true', '1', 'yes')
  and lower(coalesce(to_jsonb(ct)->>'is_archived', 'false')) not in ('true', '1', 'yes')
  and lower(coalesce(to_jsonb(ct)->>'status', to_jsonb(ct)->>'contact_status', 'active')) not in ('deleted', 'archived')
order by d.source_rank asc, is_primary desc, contact_name asc;
$$;

create or replace function public.crm_get_contacts_for_company_key(p_company_key text)
returns table (
  contact_uuid uuid,
  contact_ref text,
  contact_name text,
  email text,
  phone text,
  contact_position text,
  selected_company_uuid uuid,
  selected_company_ref text,
  selected_company_name text,
  is_primary boolean,
  raw_contact jsonb
)
language sql
security definer
set search_path = public
as $$
  select * from public.crm_get_contacts_for_company(public.crm_resolve_company_uuid(p_company_key));
$$;

create or replace function public.crm_contact_belongs_to_company(p_contact_key text, p_company_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_company_id uuid;
  v_ok boolean;
begin
  v_contact_id := public.crm_resolve_contact_uuid(p_contact_key);
  v_company_id := public.crm_resolve_company_uuid(p_company_key);
  if v_contact_id is null or v_company_id is null then return false; end if;

  select exists(
    select 1 from public.crm_get_contacts_for_company(v_company_id) x where x.contact_uuid = v_contact_id
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

create or replace function public.crm_get_company_by_key(p_company_key text)
returns table (
  company_uuid uuid,
  company_ref text,
  company_name text,
  legal_name text,
  email text,
  phone text,
  raw_company jsonb
)
language sql
security definer
set search_path = public
as $$
select
  c.id as company_uuid,
  coalesce(nullif(to_jsonb(c)->>'company_id', ''), nullif(to_jsonb(c)->>'company_number', ''), nullif(to_jsonb(c)->>'company_code', ''), nullif(to_jsonb(c)->>'reference', ''), nullif(to_jsonb(c)->>'code', '')) as company_ref,
  coalesce(nullif(to_jsonb(c)->>'legal_name', ''), nullif(to_jsonb(c)->>'company_name', ''), nullif(to_jsonb(c)->>'name', ''), 'Unnamed Company') as company_name,
  nullif(to_jsonb(c)->>'legal_name', '') as legal_name,
  coalesce(nullif(to_jsonb(c)->>'email', ''), nullif(to_jsonb(c)->>'company_email', ''), nullif(to_jsonb(c)->>'billing_email', ''), nullif(to_jsonb(c)->>'main_email', '')) as email,
  coalesce(nullif(to_jsonb(c)->>'phone', ''), nullif(to_jsonb(c)->>'phone_number', ''), nullif(to_jsonb(c)->>'mobile', ''), nullif(to_jsonb(c)->>'main_phone', '')) as phone,
  to_jsonb(c) as raw_company
from public.companies c
where c.id = public.crm_resolve_company_uuid(p_company_key)
limit 1;
$$;

create or replace function public.crm_get_contact_by_key(p_contact_key text)
returns table (
  contact_uuid uuid,
  contact_ref text,
  contact_name text,
  company_uuid uuid,
  email text,
  phone text,
  contact_position text,
  raw_contact jsonb
)
language sql
security definer
set search_path = public
as $$
select
  ct.id as contact_uuid,
  coalesce(nullif(to_jsonb(ct)->>'contact_id', ''), nullif(to_jsonb(ct)->>'contact_number', ''), nullif(to_jsonb(ct)->>'contact_code', ''), nullif(to_jsonb(ct)->>'reference', ''), nullif(to_jsonb(ct)->>'code', '')) as contact_ref,
  coalesce(nullif(concat_ws(' ', nullif(to_jsonb(ct)->>'first_name', ''), nullif(to_jsonb(ct)->>'last_name', '')), ''), nullif(to_jsonb(ct)->>'name', ''), nullif(to_jsonb(ct)->>'contact_name', ''), nullif(to_jsonb(ct)->>'full_name', ''), 'Unnamed Contact') as contact_name,
  (select l.company_id from public.crm_contact_company_links l where l.contact_id = ct.id order by l.updated_at desc nulls last limit 1) as company_uuid,
  coalesce(nullif(to_jsonb(ct)->>'email', ''), nullif(to_jsonb(ct)->>'contact_email', '')) as email,
  coalesce(nullif(to_jsonb(ct)->>'phone', ''), nullif(to_jsonb(ct)->>'phone_number', ''), nullif(to_jsonb(ct)->>'mobile', '')) as phone,
  coalesce(nullif(to_jsonb(ct)->>'position', ''), nullif(to_jsonb(ct)->>'title', ''), nullif(to_jsonb(ct)->>'job_title', '')) as contact_position,
  to_jsonb(ct) as raw_contact
from public.contacts ct
where ct.id = public.crm_resolve_contact_uuid(p_contact_key)
limit 1;
$$;

create or replace function public.crm_search_companies_for_select(p_search text default '', p_limit integer default 300)
returns table (
  company_uuid uuid,
  company_ref text,
  company_name text,
  legal_name text,
  display_label text,
  email text,
  phone text,
  city text,
  country text,
  raw_company jsonb
)
language sql
security definer
set search_path = public
as $$
with q as (
  select lower(trim(coalesce(p_search, ''))) as search_text, public.crm_normalize_key(coalesce(p_search, '')) as search_norm
), rows as (
  select c.id, to_jsonb(c) cj
  from public.companies c cross join q
  where lower(coalesce(to_jsonb(c)->>'is_deleted', 'false')) not in ('true', '1', 'yes')
    and lower(coalesce(to_jsonb(c)->>'is_archived', 'false')) not in ('true', '1', 'yes')
    and lower(coalesce(to_jsonb(c)->>'status', 'active')) not in ('deleted', 'archived')
    and (
      q.search_text = ''
      or lower(coalesce(to_jsonb(c)->>'legal_name', '')) ilike '%' || q.search_text || '%'
      or lower(coalesce(to_jsonb(c)->>'company_name', '')) ilike '%' || q.search_text || '%'
      or lower(coalesce(to_jsonb(c)->>'name', '')) ilike '%' || q.search_text || '%'
      or lower(coalesce(to_jsonb(c)->>'company_id', '')) ilike '%' || q.search_text || '%'
      or lower(coalesce(to_jsonb(c)->>'company_number', '')) ilike '%' || q.search_text || '%'
      or lower(coalesce(to_jsonb(c)->>'company_code', '')) ilike '%' || q.search_text || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'legal_name', '')) like '%' || q.search_norm || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'company_name', '')) like '%' || q.search_norm || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'name', '')) like '%' || q.search_norm || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'company_id', '')) like '%' || q.search_norm || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'company_number', '')) like '%' || q.search_norm || '%'
      or public.crm_normalize_key(coalesce(to_jsonb(c)->>'company_code', '')) like '%' || q.search_norm || '%'
    )
)
select
  r.id as company_uuid,
  coalesce(nullif(r.cj->>'company_id', ''), nullif(r.cj->>'company_number', ''), nullif(r.cj->>'company_code', ''), nullif(r.cj->>'reference', ''), nullif(r.cj->>'code', '')) as company_ref,
  coalesce(nullif(r.cj->>'legal_name', ''), nullif(r.cj->>'company_name', ''), nullif(r.cj->>'name', ''), 'Unnamed Company') as company_name,
  nullif(r.cj->>'legal_name', '') as legal_name,
  concat_ws(' · ', coalesce(nullif(r.cj->>'company_id', ''), nullif(r.cj->>'company_number', ''), nullif(r.cj->>'company_code', ''), nullif(r.cj->>'reference', ''), nullif(r.cj->>'code', '')), coalesce(nullif(r.cj->>'legal_name', ''), nullif(r.cj->>'company_name', ''), nullif(r.cj->>'name', ''), 'Unnamed Company')) as display_label,
  coalesce(nullif(r.cj->>'email', ''), nullif(r.cj->>'company_email', ''), nullif(r.cj->>'billing_email', ''), nullif(r.cj->>'main_email', '')) as email,
  coalesce(nullif(r.cj->>'phone', ''), nullif(r.cj->>'phone_number', ''), nullif(r.cj->>'mobile', ''), nullif(r.cj->>'main_phone', '')) as phone,
  nullif(r.cj->>'city', '') as city,
  nullif(r.cj->>'country', '') as country,
  r.cj as raw_company
from rows r
order by coalesce(r.cj->>'updated_at', r.cj->>'created_at') desc nulls last, company_name asc
limit greatest(20, least(coalesce(p_limit, 300), 1000));
$$;

grant execute on function public.crm_normalize_key(text) to authenticated;
grant execute on function public.crm_digits_key(text) to authenticated;
grant execute on function public.crm_company_contact_fk_value(uuid) to authenticated;
grant execute on function public.crm_resolve_company_uuid(text) to authenticated;
grant execute on function public.crm_resolve_contact_uuid(text) to authenticated;
grant execute on function public.crm_contact_json_matches_company(jsonb, uuid) to authenticated;
grant execute on function public.crm_sync_contact_company_links_for_contact(uuid) to authenticated;
grant execute on function public.crm_upsert_contact_company_links(text, text[]) to authenticated;
grant execute on function public.crm_get_contacts_for_company(uuid) to authenticated;
grant execute on function public.crm_get_contacts_for_company_key(text) to authenticated;
grant execute on function public.crm_contact_belongs_to_company(text, text) to authenticated;
grant execute on function public.crm_get_company_by_key(text) to authenticated;
grant execute on function public.crm_get_contact_by_key(text) to authenticated;
grant execute on function public.crm_search_companies_for_select(text, integer) to authenticated;

-- Verification examples:
select count(*) as total_contact_company_links from public.crm_contact_company_links;
-- Replace Company#00017 with any company code to test:
select * from public.crm_get_contacts_for_company_key('Company#00017');
