-- Add soft-deactivation audit fields for proposal/product catalog rows.
-- Historical proposal, agreement, invoice, and receipt item rows keep their saved snapshot values and item_id links.

alter table if exists public.proposal_catalog_items
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id);

alter table if exists public.proposal_catalog
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id);

do $$
begin
  if to_regclass('public.proposal_catalog_items') is not null then
    create index if not exists proposal_catalog_items_active_section_idx
      on public.proposal_catalog_items (is_active, section, sort_order, item_name);
  end if;

  if to_regclass('public.proposal_catalog') is not null then
    create index if not exists proposal_catalog_active_section_idx
      on public.proposal_catalog (is_active, section, sort_order, item_name);
  end if;
end $$;
