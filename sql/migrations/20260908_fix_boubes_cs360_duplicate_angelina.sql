-- Client Success 360: remove the duplicate Boubes / Angelina report row.
--
-- Purpose
-- - Boubes is the parent group, not an operational brand.
-- - SCZ SAL. owns Angelina.
-- - The Table Set owns only METROPOLE in the Boubes report.
-- - Stale CS360-only rows must not create a second The Table Set / Angelina target.
--
-- Safe scope: this migration updates Customer Success grouping/reporting tables only.
-- It does not modify agreements, invoices, proposal items, or invoice items.

begin;

-- Keep the canonical group and archive the duplicate group shell.
update public.cs_client_groups
set status = 'Archived', updated_at = now()
where id = 'cceff094-488e-49aa-a9f3-c52010c0d1e2';

-- Boubes is a parent group, not a brand.
update public.cs_client_brands
set status = 'Archived', updated_at = now()
where id = '91a04f27-c1e5-4ac0-b684-3e32c86c1a05';

-- Remove stale CS360-only rows that can make Angelina appear under The Table Set.
delete from public.cs_client_brand_locations
where brand_id = '91a04f27-c1e5-4ac0-b684-3e32c86c1a05'
   or (
    company_id = 'da503398-6a0c-4d3e-9bac-42efc1def2a2'
    and lower(location_name) = 'angelina'
  );

-- SCZ SAL. / Company#00311 belongs to the canonical Boubes Group.
insert into public.cs_client_group_members (
  group_id,
  company_id,
  group_name_snapshot,
  company_name_snapshot,
  member_role,
  notes,
  updated_at
)
values (
  '4fa0ef9b-9bfb-416c-a7f1-20aec80472fb',
  '714ec0aa-9ba5-4774-9e13-dc06aa6f9bf9',
  'Boubes Group',
  'SCZ SAL.',
  'Related Company',
  'Boubes CS360 Angelina duplicate correction 2026-09-08.',
  now()
)
on conflict (group_id, company_id) do update set
  group_name_snapshot = excluded.group_name_snapshot,
  company_name_snapshot = excluded.company_name_snapshot,
  member_role = coalesce(public.cs_client_group_members.member_role, excluded.member_role),
  notes = excluded.notes,
  updated_at = now();

-- Angelina belongs only to SCZ SAL. in CS360 completion reporting.
update public.cs_location_completions
set company_id = '714ec0aa-9ba5-4774-9e13-dc06aa6f9bf9',
    company_name_snapshot = 'SCZ SAL.',
    group_name = 'Boubes Group',
    brand_name = null,
    updated_at = now()
where lower(location_name) = 'angelina'
  and (
    id = '661c0991-7919-48e3-a042-e7516030d197'
    or company_id in ('714ec0aa-9ba5-4774-9e13-dc06aa6f9bf9', 'da503398-6a0c-4d3e-9bac-42efc1def2a2')
    or lower(coalesce(company_name_snapshot, '')) in ('scz sal.', 'scz sal', 'the table set')
  );

-- Preserve Boubes group/brand labels on saved completion rows.
update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'MRKT', updated_at = now()
where company_id = 'e925b551-d5ca-41af-aaeb-9bb9ba0afa24' and lower(location_name) = 'mrkt';

update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'MET ABC & NAPOLETANA', updated_at = now()
where company_id = 'dd1ad85a-416b-47b3-8d66-3decb31547e1' and lower(location_name) = 'met abc & napoletana';

update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'CAFÉ CENTREVILLE', updated_at = now()
where company_id = '45405179-32d1-497f-9079-e4229df56ba4' and lower(location_name) = 'café centre ville';

update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'Cafe Libanais', updated_at = now()
where company_id = '83c20490-754a-45ae-af2b-2811160a0f34' and lower(location_name) = 'cafe libanais';

update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'LE RELAIS DE L''ENTRECÔTE', updated_at = now()
where company_id = 'f0bfdaa2-192b-4b89-8e31-b6b75c968ce5' and lower(location_name) = 'le relais de l''entrecote';

update public.cs_location_completions set group_name = 'Boubes Group', brand_name = 'MÉTROPOLE', updated_at = now()
where company_id = 'da503398-6a0c-4d3e-9bac-42efc1def2a2' and lower(location_name) = 'metropole';

-- Explicit Boubes brand/location ownership prevents a group-scoped brand from
-- inheriting every location in the group.
with mapping as (
  select * from (values
    ('a8a6d8c2-8bee-461a-8148-a8e0348f9dd9'::uuid, 'MRKT', 'e925b551-d5ca-41af-aaeb-9bb9ba0afa24'::uuid, '4KS S.A.L', 'MRKT', date '2026-05-14', date '2027-05-13'),
    ('a78a952e-2191-4f5e-b2d9-85db91daa07f'::uuid, 'MET ABC & NAPOLETANA', 'dd1ad85a-416b-47b3-8d66-3decb31547e1'::uuid, 'Café One SAL', 'MET ABC & Napoletana', date '2026-05-14', date '2027-05-13'),
    ('e37d7145-271a-46b4-8896-c5aabffb38cb'::uuid, 'CAFÉ CENTREVILLE', '45405179-32d1-497f-9079-e4229df56ba4'::uuid, 'Cookbook SAL', 'Café Centre Ville', date '2026-05-14', date '2027-05-13'),
    ('b4d00866-36ad-4d3a-8d43-9b8672ce1815'::uuid, 'Cafe Libanais', '83c20490-754a-45ae-af2b-2811160a0f34'::uuid, 'italy on the med SAL', 'Cafe Libanais', date '2026-05-14', date '2027-05-13'),
    ('03212b5a-66a0-430f-8463-7a4f80565a9a'::uuid, 'LE RELAIS DE L''ENTRECÔTE', 'f0bfdaa2-192b-4b89-8e31-b6b75c968ce5'::uuid, 'R.E.L SAL', 'Le Relais de L''Entrecote', date '2026-05-14', date '2027-05-13'),
    ('3aad3c6c-d617-4991-a2dd-0095c2a109e8'::uuid, 'MÉTROPOLE', 'da503398-6a0c-4d3e-9bac-42efc1def2a2'::uuid, 'The Table Set', 'METROPOLE', date '2026-05-13', date '2027-05-12')
  ) v(brand_id, brand_name, company_id, company_name, location_name, service_start_date, service_end_date)
)
insert into public.cs_client_brand_locations (
  brand_id, brand_name_snapshot, group_id, group_name_snapshot, company_id,
  company_name_snapshot, location_name, service_start_date, service_end_date,
  status, notes, updated_at
)
select m.brand_id, m.brand_name, '4fa0ef9b-9bfb-416c-a7f1-20aec80472fb', 'Boubes Group',
       m.company_id, m.company_name, m.location_name, m.service_start_date, m.service_end_date,
       'Active', 'CS360 Boubes duplicate Angelina correction 2026-09-08.', now()
from mapping m
where not exists (
  select 1
  from public.cs_client_brand_locations bl
  where bl.group_id = '4fa0ef9b-9bfb-416c-a7f1-20aec80472fb'
    and bl.company_id = m.company_id
    and lower(bl.location_name) = lower(m.location_name)
    and lower(coalesce(bl.status, 'active')) not in ('inactive', 'archived', 'deleted')
);

with mapping as (
  select * from (values
    ('a8a6d8c2-8bee-461a-8148-a8e0348f9dd9'::uuid, 'MRKT', 'e925b551-d5ca-41af-aaeb-9bb9ba0afa24'::uuid, '4KS S.A.L', 'MRKT', date '2026-05-14', date '2027-05-13'),
    ('a78a952e-2191-4f5e-b2d9-85db91daa07f'::uuid, 'MET ABC & NAPOLETANA', 'dd1ad85a-416b-47b3-8d66-3decb31547e1'::uuid, 'Café One SAL', 'MET ABC & Napoletana', date '2026-05-14', date '2027-05-13'),
    ('e37d7145-271a-46b4-8896-c5aabffb38cb'::uuid, 'CAFÉ CENTREVILLE', '45405179-32d1-497f-9079-e4229df56ba4'::uuid, 'Cookbook SAL', 'Café Centre Ville', date '2026-05-14', date '2027-05-13'),
    ('b4d00866-36ad-4d3a-8d43-9b8672ce1815'::uuid, 'Cafe Libanais', '83c20490-754a-45ae-af2b-2811160a0f34'::uuid, 'italy on the med SAL', 'Cafe Libanais', date '2026-05-14', date '2027-05-13'),
    ('03212b5a-66a0-430f-8463-7a4f80565a9a'::uuid, 'LE RELAIS DE L''ENTRECÔTE', 'f0bfdaa2-192b-4b89-8e31-b6b75c968ce5'::uuid, 'R.E.L SAL', 'Le Relais de L''Entrecote', date '2026-05-14', date '2027-05-13'),
    ('3aad3c6c-d617-4991-a2dd-0095c2a109e8'::uuid, 'MÉTROPOLE', 'da503398-6a0c-4d3e-9bac-42efc1def2a2'::uuid, 'The Table Set', 'METROPOLE', date '2026-05-13', date '2027-05-12')
  ) v(brand_id, brand_name, company_id, company_name, location_name, service_start_date, service_end_date)
)
update public.cs_client_brand_locations bl
set brand_id = m.brand_id,
    brand_name_snapshot = m.brand_name,
    group_id = '4fa0ef9b-9bfb-416c-a7f1-20aec80472fb',
    group_name_snapshot = 'Boubes Group',
    company_name_snapshot = m.company_name,
    service_start_date = m.service_start_date,
    service_end_date = m.service_end_date,
    status = 'Active',
    notes = 'CS360 Boubes duplicate Angelina correction 2026-09-08.',
    updated_at = now()
from mapping m
where bl.group_id = '4fa0ef9b-9bfb-416c-a7f1-20aec80472fb'
  and bl.company_id = m.company_id
  and lower(bl.location_name) = lower(m.location_name);

commit;
