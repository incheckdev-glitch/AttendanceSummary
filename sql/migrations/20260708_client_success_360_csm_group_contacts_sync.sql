-- Client Success 360 v5 — CSM group activity + Contacts module sync
-- Run after the previous Client Success 360 migrations if already installed.
-- Still no payments, invoices, receipts, collections, or accounting data.

create extension if not exists pgcrypto;

-- Allow CSM Daily Activity rows to target a CS Client Group.
alter table if exists public.csm_activities
  add column if not exists cs_group_id uuid,
  add column if not exists cs_group_name text;

create index if not exists csm_activities_cs_group_idx on public.csm_activities(cs_group_id);

do $$
declare
  c record;
begin
  if to_regclass('public.csm_activities') is null then
    return;
  end if;

  -- Drop older activity_context checks that only allowed agreement/manual clients.
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.csm_activities'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%activity_context%'
  loop
    execute format('alter table public.csm_activities drop constraint if exists %I', c.conname);
  end loop;

  alter table public.csm_activities
    add constraint csm_activities_activity_context_scope_chk
    check (activity_context is null or activity_context in ('agreement_client','manual_client','cs_group'));
exception when duplicate_object then
  null;
end $$;

-- Link CS contacts to the master Contacts module while keeping CS-specific metadata.
alter table if exists public.cs_client_contacts
  add column if not exists contact_id uuid,
  add column if not exists contact_name_snapshot text;

create unique index if not exists cs_client_contacts_company_contact_uidx
on public.cs_client_contacts(company_id, contact_id)
where contact_id is not null;

create index if not exists cs_client_contacts_contact_idx on public.cs_client_contacts(contact_id);

-- Admin-only permission seed for the new CSM group activity columns does not need a new resource.
-- Contacts module creation remains controlled by the existing contacts permissions; current CS module is admin-only.
