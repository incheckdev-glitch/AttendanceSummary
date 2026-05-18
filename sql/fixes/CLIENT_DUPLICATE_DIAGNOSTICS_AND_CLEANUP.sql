-- CLIENT_DUPLICATE_DIAGNOSTICS_AND_CLEANUP.sql
-- Purpose: diagnose duplicate client/company rows safely before any cleanup.
-- IMPORTANT: The first section is SELECT-only. Do not run the cleanup section
-- until the preview results have been reviewed and backups are confirmed.

-- ================================================================
-- 1) SELECT-ONLY DIAGNOSTICS
-- ================================================================

-- Duplicate clients by normalized legal/company_name used as legal display in the current clients schema.
select
  lower(trim(company_name)) as normalized_legal_name,
  count(*) as duplicate_count,
  array_agg(id order by created_at nulls last, id) as client_ids,
  array_agg(client_id order by created_at nulls last, id) as display_client_ids,
  min(created_at) as first_created,
  max(created_at) as last_created
from public.clients
where coalesce(trim(company_name), '') <> ''
group by lower(trim(company_name))
having count(*) > 1
order by duplicate_count desc;

-- Duplicate clients by normalized client/company display name.
select
  lower(trim(client_name)) as normalized_company_name,
  count(*) as duplicate_count,
  array_agg(id order by created_at nulls last, id) as client_ids,
  array_agg(client_id order by created_at nulls last, id) as display_client_ids,
  min(created_at) as first_created,
  max(created_at) as last_created
from public.clients
where coalesce(trim(client_name), '') <> ''
group by lower(trim(client_name))
having count(*) > 1
order by duplicate_count desc;

-- If your deployed schema has a legal_name column, run this optional diagnostic.
-- select
--   lower(trim(legal_name)) as normalized_legal_name,
--   count(*) as duplicate_count,
--   array_agg(id order by created_at nulls last, id) as client_ids,
--   array_agg(client_id order by created_at nulls last, id) as display_client_ids,
--   min(created_at) as first_created,
--   max(created_at) as last_created
-- from public.clients
-- where coalesce(trim(legal_name), '') <> ''
-- group by lower(trim(legal_name))
-- having count(*) > 1
-- order by duplicate_count desc;

-- Child-record references attached to duplicate legal/company names.
with duplicate_clients as (
  select
    lower(trim(company_name)) as normalized_name,
    array_agg(id::text) as client_uuids,
    array_agg(client_id::text) as display_client_ids
  from public.clients
  where coalesce(trim(company_name), '') <> ''
  group by lower(trim(company_name))
  having count(*) > 1
)
select
  dc.normalized_name,
  dc.client_uuids,
  dc.display_client_ids,
  count(distinct a.id) as agreements_count,
  count(distinct i.id) as invoices_count,
  count(distinct r.id) as receipts_count
from duplicate_clients dc
left join public.agreements a on a.client_id::text = any(dc.client_uuids) or a.client_id::text = any(dc.display_client_ids)
left join public.invoices i on i.client_id::text = any(dc.client_uuids) or i.client_id::text = any(dc.display_client_ids)
left join public.receipts r on r.client_id::text = any(dc.client_uuids) or r.client_id::text = any(dc.display_client_ids)
group by dc.normalized_name, dc.client_uuids, dc.display_client_ids
order by (count(distinct a.id) + count(distinct i.id) + count(distinct r.id)) desc;

-- Master-client candidate preview. Preference order:
-- 1. most linked agreements/invoices/receipts, 2. earliest created_at, 3. most complete profile.
with duplicate_clients as (
  select lower(trim(company_name)) as normalized_name
  from public.clients
  where coalesce(trim(company_name), '') <> ''
  group by lower(trim(company_name))
  having count(*) > 1
), scored as (
  select
    c.*,
    dc.normalized_name,
    count(distinct a.id) as agreements_count,
    count(distinct i.id) as invoices_count,
    count(distinct r.id) as receipts_count,
    (
      (case when coalesce(trim(c.client_name), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(c.company_name), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(c.primary_email), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(c.primary_phone), '') <> '' then 1 else 0 end)
    ) as completeness_score
  from public.clients c
  join duplicate_clients dc on lower(trim(c.company_name)) = dc.normalized_name
  left join public.agreements a on a.client_id::text = c.id::text or a.client_id::text = c.client_id::text
  left join public.invoices i on i.client_id::text = c.id::text or i.client_id::text = c.client_id::text
  left join public.receipts r on r.client_id::text = c.id::text or r.client_id::text = c.client_id::text
  group by c.id, dc.normalized_name
), ranked as (
  select
    scored.*,
    row_number() over (
      partition by normalized_name
      order by (agreements_count + invoices_count + receipts_count) desc,
               created_at asc nulls last,
               completeness_score desc,
               id asc
    ) as master_rank
  from scored
)
select
  normalized_name,
  id,
  client_id,
  client_name,
  company_name,
  agreements_count,
  invoices_count,
  receipts_count,
  completeness_score,
  created_at,
  case when master_rank = 1 then 'MASTER_CANDIDATE' else 'DUPLICATE_CANDIDATE' end as cleanup_role
from ranked
order by normalized_name, master_rank;

-- ================================================================
-- 2) REVIEWED CLEANUP PLAN (COMMENTED OUT BY DEFAULT)
-- ================================================================
-- This section intentionally does not delete financial records.
-- Review the master preview above first, then adapt table/column names to your schema.

-- begin;
--
-- -- Build a reviewed mapping table manually from the preview above.
-- -- duplicate_client_id and master_client_id are public.clients.id UUIDs.
-- create temporary table client_duplicate_cleanup_map (
--   duplicate_client_id uuid primary key,
--   master_client_id uuid not null references public.clients(id),
--   reason text not null
-- ) on commit drop;
--
-- -- Example only; replace with reviewed UUIDs.
-- -- insert into client_duplicate_cleanup_map (duplicate_client_id, master_client_id, reason)
-- -- values ('duplicate-uuid-here', 'master-uuid-here', 'Reviewed duplicate normalized legal/company name');
--
-- -- Repoint child records. These updates preserve invoices, receipts, agreements,
-- -- invoice_items, payment history, and onboarding history.
-- update public.agreements a
-- set client_id = m.master_client_id
-- from client_duplicate_cleanup_map m
-- where a.client_id = m.duplicate_client_id;
--
-- update public.invoices i
-- set client_id = m.master_client_id
-- from client_duplicate_cleanup_map m
-- where i.client_id = m.duplicate_client_id;
--
-- update public.receipts r
-- set client_id = m.master_client_id
-- from client_duplicate_cleanup_map m
-- where r.client_id = m.duplicate_client_id;
--
-- -- Run only if these tables/columns exist in your database.
-- -- update public.operations_onboarding o
-- -- set client_id = m.master_client_id
-- -- from client_duplicate_cleanup_map m
-- -- where o.client_id = m.duplicate_client_id;
--
-- -- update public.technical_admin_requests t
-- -- set client_id = m.master_client_id
-- -- from client_duplicate_cleanup_map m
-- -- where t.client_id = m.duplicate_client_id;
--
-- -- If public.clients has is_active, soft-disable duplicates after children are repointed.
-- -- update public.clients c
-- -- set is_active = false, updated_at = now()
-- -- from client_duplicate_cleanup_map m
-- -- where c.id = m.duplicate_client_id;
--
-- -- If is_active does not exist, leave duplicate client rows untouched.
-- -- Do not delete duplicate clients unless a separate reviewed delete script confirms
-- -- no remaining child references and business approval has been given.
--
-- -- rollback; -- Change to commit only after reviewing row counts in the same transaction.

-- ================================================================
-- 3) PREVENTION INDEXES AFTER CLEANUP ONLY (COMMENTED OUT)
-- ================================================================
-- Do not create these until duplicate preview queries return zero rows.
-- create unique index concurrently if not exists clients_unique_normalized_company_name
--   on public.clients (lower(trim(company_name)))
--   where coalesce(trim(company_name), '') <> '';
--
-- create unique index concurrently if not exists clients_unique_normalized_client_name
--   on public.clients (lower(trim(client_name)))
--   where coalesce(trim(client_name), '') <> '';
