-- InCheck360 · Agreement Annex for Additional Locations (V31)
-- Trigger-safe replacement for V30.
-- Run this full migration in the Supabase SQL Editor.
-- It does NOT update any existing signed agreement row.

begin;

-- Lifecycle linkage fields for originals, annexes, amendments, and sub-agreements.
-- PostgreSQL applies the defaults at schema level without issuing a normal UPDATE
-- against locked signed agreement records.
alter table public.agreements
  add column if not exists parent_agreement_id text,
  add column if not exists root_agreement_id text,
  add column if not exists source_agreement_id text,
  add column if not exists agreement_relationship_type text not null default 'original',
  add column if not exists agreement_version integer not null default 1,
  add column if not exists relationship_notes text;

-- Preserve the optional physical address of the additional location.
alter table public.agreement_items
  add column if not exists location_address text;

-- Defaults for newly inserted agreements only. Existing signed agreements are untouched.
alter table public.agreements
  alter column agreement_relationship_type set default 'original',
  alter column agreement_version set default 1;

-- Populate lifecycle defaults on future INSERTS only.
create or replace function public.set_agreement_lifecycle_insert_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.agreement_relationship_type := coalesce(
    nullif(btrim(new.agreement_relationship_type), ''),
    'original'
  );

  if new.agreement_version is null or new.agreement_version < 1 then
    new.agreement_version := 1;
  end if;

  -- Original agreements may point to themselves as the lifecycle root.
  -- Annexes already receive root_agreement_id from the application.
  if new.agreement_relationship_type = 'original'
     and (new.root_agreement_id is null or btrim(new.root_agreement_id) = '')
     and new.id is not null then
    new.root_agreement_id := new.id::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_agreement_lifecycle_insert_defaults
  on public.agreements;

create trigger trg_set_agreement_lifecycle_insert_defaults
before insert on public.agreements
for each row
execute function public.set_agreement_lifecycle_insert_defaults();

create index if not exists idx_agreements_parent_agreement_id
  on public.agreements (parent_agreement_id);

create index if not exists idx_agreements_root_agreement_id
  on public.agreements (root_agreement_id);

create index if not exists idx_agreements_relationship_type
  on public.agreements (agreement_relationship_type);

comment on column public.agreements.parent_agreement_id is
  'Database UUID stored as text of the signed agreement that owns this annex or sub-agreement.';
comment on column public.agreements.root_agreement_id is
  'Database UUID stored as text of the root agreement in the lifecycle.';
comment on column public.agreements.source_agreement_id is
  'Database UUID stored as text of the agreement from which this record was created.';
comment on column public.agreements.agreement_relationship_type is
  'Agreement lifecycle type: original, annex, amendment, or sub_agreement.';
comment on column public.agreements.agreement_version is
  'Sequential lifecycle version used for annex numbering.';
comment on column public.agreements.relationship_notes is
  'Human-readable lifecycle linkage note or parent agreement reference.';
comment on column public.agreement_items.location_address is
  'Optional physical address for an additional agreement location.';

commit;

-- Verification. Seven rows should be returned.
select table_name, column_name, data_type, column_default
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
