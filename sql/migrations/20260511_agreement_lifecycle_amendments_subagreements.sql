-- Agreement Lifecycle: amendments + sub-agreements
-- Apply once in Supabase before using the new Agreement Lifecycle buttons.

-- 1) Add relationship fields to agreements so sub-agreements can stay linked to the original/master agreement.
alter table public.agreements
  add column if not exists parent_agreement_id text,
  add column if not exists root_agreement_id text,
  add column if not exists source_agreement_id text,
  add column if not exists agreement_relationship_type text not null default 'original',
  add column if not exists agreement_version integer not null default 1,
  add column if not exists relationship_notes text;

update public.agreements
set agreement_relationship_type = 'original'
where agreement_relationship_type is null or trim(agreement_relationship_type) = '';

update public.agreements
set root_agreement_id = coalesce(nullif(root_agreement_id, ''), id::text)
where root_agreement_id is null or trim(root_agreement_id) = '';

create index if not exists idx_agreements_parent_agreement_id
on public.agreements (parent_agreement_id);

create index if not exists idx_agreements_root_agreement_id
on public.agreements (root_agreement_id);

create index if not exists idx_agreements_relationship_type
on public.agreements (agreement_relationship_type);

-- 2) Separate amendment header table.
-- Amendments are controlled changes to a signed agreement; they are not normal edits to the signed agreement.
create table if not exists public.agreement_amendments (
  id uuid primary key default gen_random_uuid(),
  amendment_id text unique,
  amendment_reference text unique,
  parent_agreement_id text not null,
  root_agreement_id text,
  client_id text,
  company_id text,
  company_name text,
  amendment_type text not null default 'commercial_amendment',
  reason text not null,
  effective_date date,
  status text not null default 'Draft',
  billing_impact text not null default 'invoice_difference_only',
  currency text,
  subtotal_locations numeric(14,2) not null default 0,
  subtotal_one_time numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  signed_document_path text,
  signed_document_name text,
  signed_document_uploaded_at timestamptz,
  signed_document_uploaded_by text,
  signed_at timestamptz,
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreement_amendments_billing_impact_chk check (
    billing_impact in ('no_billing_impact', 'invoice_difference_only', 'replace_value_going_forward')
  )
);

create index if not exists idx_agreement_amendments_parent
on public.agreement_amendments (parent_agreement_id);

create index if not exists idx_agreement_amendments_root
on public.agreement_amendments (root_agreement_id);

create index if not exists idx_agreement_amendments_status
on public.agreement_amendments (status);

-- 3) Amendment items, ready for the next phase when you want line-level amendment editing.
create table if not exists public.agreement_amendment_items (
  id uuid primary key default gen_random_uuid(),
  amendment_id uuid references public.agreement_amendments(id) on delete cascade,
  item_id text,
  section text,
  line_no integer,
  location_name text,
  location_address text,
  item_name text,
  unit_price numeric(14,2) not null default 0,
  discount_percent numeric(7,4) not null default 0,
  discounted_unit_price numeric(14,2) not null default 0,
  quantity numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  service_start_date date,
  service_end_date date,
  billing_effect text default 'add',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agreement_amendment_items_amendment
on public.agreement_amendment_items (amendment_id);

-- 4) Auto-generate amendment_id if the frontend does not provide one.
create sequence if not exists public.agreement_amendment_seq start 1;

create or replace function public.set_agreement_amendment_business_id()
returns trigger
language plpgsql
as $$
begin
  if new.amendment_id is null or trim(new.amendment_id) = '' then
    new.amendment_id := 'AM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.agreement_amendment_seq')::text, 5, '0');
  end if;

  if new.amendment_reference is null or trim(new.amendment_reference) = '' then
    new.amendment_reference := new.amendment_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_agreement_amendment_business_id on public.agreement_amendments;
create trigger trg_set_agreement_amendment_business_id
before insert or update on public.agreement_amendments
for each row
execute function public.set_agreement_amendment_business_id();

-- 5) Private bucket for signed amendment documents.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'agreement-amendment-documents',
  'agreement-amendment-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ];

-- 6) RLS policies for amendment tables and storage. Safe basic authenticated access for now.
alter table public.agreement_amendments enable row level security;
alter table public.agreement_amendment_items enable row level security;

drop policy if exists "agreement_amendments_select" on public.agreement_amendments;
create policy "agreement_amendments_select"
on public.agreement_amendments
for select
to authenticated
using (true);

drop policy if exists "agreement_amendments_insert" on public.agreement_amendments;
create policy "agreement_amendments_insert"
on public.agreement_amendments
for insert
to authenticated
with check (true);

drop policy if exists "agreement_amendments_update" on public.agreement_amendments;
create policy "agreement_amendments_update"
on public.agreement_amendments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "agreement_amendment_items_select" on public.agreement_amendment_items;
create policy "agreement_amendment_items_select"
on public.agreement_amendment_items
for select
to authenticated
using (true);

drop policy if exists "agreement_amendment_items_insert" on public.agreement_amendment_items;
create policy "agreement_amendment_items_insert"
on public.agreement_amendment_items
for insert
to authenticated
with check (true);

drop policy if exists "agreement_amendment_items_update" on public.agreement_amendment_items;
create policy "agreement_amendment_items_update"
on public.agreement_amendment_items
for update
to authenticated
using (true)
with check (true);

drop policy if exists "agreement_amendment_documents_insert" on storage.objects;
create policy "agreement_amendment_documents_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'agreement-amendment-documents');

drop policy if exists "agreement_amendment_documents_select" on storage.objects;
create policy "agreement_amendment_documents_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'agreement-amendment-documents');

drop policy if exists "agreement_amendment_documents_update" on storage.objects;
create policy "agreement_amendment_documents_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'agreement-amendment-documents')
with check (bucket_id = 'agreement-amendment-documents');
