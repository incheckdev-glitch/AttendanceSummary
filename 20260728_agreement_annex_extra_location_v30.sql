-- InCheck360 · Agreement Annex for Additional Locations (V30)
-- Run once in the Supabase SQL Editor before deploying the frontend files.
-- This migration is idempotent and does not modify signed agreement values.

begin;

-- Link every annex to its signed parent/master agreement.
alter table public.agreements
  add column if not exists parent_agreement_id text,
  add column if not exists root_agreement_id text,
  add column if not exists source_agreement_id text,
  add column if not exists agreement_relationship_type text not null default 'original',
  add column if not exists agreement_version integer not null default 1,
  add column if not exists relationship_notes text;

update public.agreements
set agreement_relationship_type = 'original'
where agreement_relationship_type is null
   or btrim(agreement_relationship_type) = '';

update public.agreements
set agreement_version = 1
where agreement_version is null
   or agreement_version < 1;

-- Existing master agreements point to themselves as the lifecycle root.
update public.agreements
set root_agreement_id = id::text
where (root_agreement_id is null or btrim(root_agreement_id) = '')
  and coalesce(nullif(btrim(agreement_relationship_type), ''), 'original') = 'original';

create index if not exists idx_agreements_parent_agreement_id
  on public.agreements (parent_agreement_id);

create index if not exists idx_agreements_root_agreement_id
  on public.agreements (root_agreement_id);

create index if not exists idx_agreements_relationship_type
  on public.agreements (agreement_relationship_type);

-- Preserve the optional physical address of the additional location.
alter table public.agreement_items
  add column if not exists location_address text;

comment on column public.agreements.parent_agreement_id is
  'Database UUID (stored as text) of the signed agreement that owns this annex/sub-agreement.';
comment on column public.agreements.root_agreement_id is
  'Database UUID (stored as text) of the root/master agreement in the lifecycle.';
comment on column public.agreements.agreement_relationship_type is
  'Agreement lifecycle type, such as original, annex, amendment, or sub_agreement.';
comment on column public.agreements.agreement_version is
  'Sequential lifecycle version used for annex numbering.';

commit;

-- Verification: all six agreement lifecycle fields and the location address field should appear.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'agreements' and column_name in (
      'parent_agreement_id',
      'root_agreement_id',
      'source_agreement_id',
      'agreement_relationship_type',
      'agreement_version',
      'relationship_notes'
    ))
    or (table_name = 'agreement_items' and column_name = 'location_address')
  )
order by table_name, column_name;
