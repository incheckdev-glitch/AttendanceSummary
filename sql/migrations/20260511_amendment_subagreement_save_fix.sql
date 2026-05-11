-- Amendment/Sub-Agreement save fix
-- Run after the agreement lifecycle migrations.
-- Keeps signed parent agreements locked, but allows amendment draft save and sub-agreement creation.

-- 1) Ensure editable amendment snapshot columns exist.
alter table public.agreement_amendments
  add column if not exists source_agreement_id text,
  add column if not exists agreement_id text,
  add column if not exists agreement_number text,
  add column if not exists proposal_id text,
  add column if not exists deal_id text,
  add column if not exists lead_id text,
  add column if not exists agreement_relationship_type text,
  add column if not exists agreement_version integer,
  add column if not exists relationship_notes text,
  add column if not exists agreement_title text,
  add column if not exists agreement_date date,
  add column if not exists service_start_date date,
  add column if not exists service_end_date date,
  add column if not exists agreement_length text,
  add column if not exists account_number text,
  add column if not exists billing_frequency text,
  add column if not exists payment_term text,
  add column if not exists payment_terms text,
  add column if not exists po_number text,
  add column if not exists customer_name text,
  add column if not exists customer_legal_name text,
  add column if not exists customer_address text,
  add column if not exists customer_contact_name text,
  add column if not exists customer_contact_mobile text,
  add column if not exists customer_contact_email text,
  add column if not exists contact_id text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_mobile text,
  add column if not exists customer_contact_phone text,
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists tax_number text,
  add column if not exists provider_name text,
  add column if not exists provider_legal_name text,
  add column if not exists provider_address text,
  add column if not exists provider_contact_name text,
  add column if not exists provider_contact_mobile text,
  add column if not exists provider_contact_email text,
  add column if not exists provider_signatory_email text,
  add column if not exists customer_official_signatory_name text,
  add column if not exists customer_official_signatory_title text,
  add column if not exists customer_signatory_name text,
  add column if not exists customer_signatory_title text,
  add column if not exists customer_signatory_email text,
  add column if not exists customer_signatory_phone text,
  add column if not exists provider_official_signatory_1_name text,
  add column if not exists provider_official_signatory_1_title text,
  add column if not exists provider_official_signatory_2_name text,
  add column if not exists provider_official_signatory_2_title text,
  add column if not exists provider_signatory_name text,
  add column if not exists provider_signatory_title text,
  add column if not exists provider_primary_signatory_name text,
  add column if not exists provider_primary_signatory_title text,
  add column if not exists provider_secondary_signatory_name text,
  add column if not exists provider_secondary_signatory_title text,
  add column if not exists provider_signatory_name_primary text,
  add column if not exists provider_signatory_title_primary text,
  add column if not exists provider_signatory_name_secondary text,
  add column if not exists provider_signatory_title_secondary text,
  add column if not exists terms_conditions text,
  add column if not exists generated_by text,
  add column if not exists gm_signed boolean not null default false,
  add column if not exists financial_controller_signed boolean not null default false,
  add column if not exists saas_total numeric(14,2) not null default 0,
  add column if not exists one_time_total numeric(14,2) not null default 0,
  add column if not exists tax numeric(14,2) not null default 0,
  add column if not exists approved_annual_saas_discount_percent numeric,
  add column if not exists approved_one_time_fee_discount_percent numeric,
  add column if not exists approved_discount_percent numeric,
  add column if not exists discount_approval_status text,
  add column if not exists discount_approved_at timestamptz,
  add column if not exists discount_approved_by text,
  add column if not exists last_discount_approval_request_id text,
  add column if not exists approval_required_reason text;

create index if not exists idx_agreement_amendments_source
on public.agreement_amendments (source_agreement_id);

-- 2) Ensure amendment item delete is allowed, because draft save replaces amendment items.
alter table public.agreement_amendments enable row level security;
alter table public.agreement_amendment_items enable row level security;

drop policy if exists "agreement_amendments_update" on public.agreement_amendments;
create policy "agreement_amendments_update"
on public.agreement_amendments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "agreement_amendment_items_delete" on public.agreement_amendment_items;
create policy "agreement_amendment_items_delete"
on public.agreement_amendment_items
for delete
to authenticated
using (true);

drop policy if exists "agreement_amendment_items_insert" on public.agreement_amendment_items;
create policy "agreement_amendment_items_insert"
on public.agreement_amendment_items
for insert
to authenticated
with check (true);

drop policy if exists "agreement_amendment_items_select" on public.agreement_amendment_items;
create policy "agreement_amendment_items_select"
on public.agreement_amendment_items
for select
to authenticated
using (true);

-- 3) Ensure sub-agreement relationship columns exist on normal agreements.
alter table public.agreements
  add column if not exists parent_agreement_id text,
  add column if not exists root_agreement_id text,
  add column if not exists source_agreement_id text,
  add column if not exists agreement_relationship_type text not null default 'original',
  add column if not exists agreement_version integer not null default 1,
  add column if not exists relationship_notes text;

create index if not exists idx_agreements_parent_agreement_id
on public.agreements (parent_agreement_id);

create index if not exists idx_agreements_root_agreement_id
on public.agreements (root_agreement_id);

create index if not exists idx_agreements_relationship_type
on public.agreements (agreement_relationship_type);
