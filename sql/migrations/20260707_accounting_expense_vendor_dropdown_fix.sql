-- InCheck360 Accounting - Expense Vendor Dropdown Fix
-- Links accounting expenses to vendor/supplier master records.
-- Safe to run multiple times after the Vendors / Suppliers migration.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.accounting_expenses') is not null
     and to_regclass('public.accounting_vendors') is not null then
    alter table public.accounting_expenses
      add column if not exists vendor_id uuid references public.accounting_vendors(id) on delete set null;

    create index if not exists idx_accounting_expenses_vendor_id
      on public.accounting_expenses(vendor_id);

    -- Backfill existing text vendors when the name exactly matches a master vendor.
    update public.accounting_expenses e
    set vendor_id = v.id,
        vendor_name = coalesce(nullif(e.vendor_name, ''), v.vendor_name),
        updated_at = now()
    from public.accounting_vendors v
    where e.vendor_id is null
      and nullif(trim(coalesce(e.vendor_name, '')), '') is not null
      and lower(trim(e.vendor_name)) = lower(trim(v.vendor_name));
  end if;
end $$;
