-- Client Success 360 - Brand location move / no duplicates
-- A location can belong to one brand within the same CS group/client scope.
-- Keeps the latest assignment if duplicates already exist.

with ranked as (
  select
    id,
    row_number() over (
      partition by
        coalesce(group_id::text, 'CLIENT_SCOPE'),
        company_id::text,
        lower(trim(location_name))
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.cs_client_brand_locations
)
delete from public.cs_client_brand_locations bl
using ranked r
where bl.id = r.id
  and r.rn > 1;

drop index if exists public.cs_client_brand_locations_unique;
drop index if exists public.cs_client_brand_locations_group_scope_unique;
drop index if exists public.cs_client_brand_locations_client_scope_unique;

create unique index if not exists cs_client_brand_locations_group_scope_unique
on public.cs_client_brand_locations(group_id, company_id, lower(trim(location_name)))
where group_id is not null
  and lower(coalesce(status, 'active')) <> 'inactive';

create unique index if not exists cs_client_brand_locations_client_scope_unique
on public.cs_client_brand_locations(company_id, lower(trim(location_name)))
where group_id is null
  and lower(coalesce(status, 'active')) <> 'inactive';
