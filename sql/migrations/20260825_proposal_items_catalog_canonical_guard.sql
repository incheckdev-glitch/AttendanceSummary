create or replace function public.enforce_proposal_item_catalog_details()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_catalog public.proposal_catalog_items%rowtype;
  v_parent record;
  v_discount numeric;
  v_months numeric;
  v_license_qty numeric;
  v_base numeric;
begin
  if nullif(btrim(coalesce(new.item_name, '')), '') is null then
    raise exception 'Proposal item must use a product from the Proposal Catalog.';
  end if;

  select c.* into v_catalog
  from public.proposal_catalog_items c
  where lower(btrim(c.item_name)) = lower(btrim(new.item_name))
  order by c.is_active desc, c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Proposal product "%" is not in the Proposal Catalog.', new.item_name;
  end if;

  if v_catalog.is_active is false and lower(btrim(v_catalog.item_name)) <> 'account setup' then
    raise exception 'Proposal product "%" exists in the catalog but is inactive.', v_catalog.item_name;
  end if;

  new.item_name := v_catalog.item_name;
  new.section := v_catalog.section;
  new.unit_price := coalesce(v_catalog.unit_price, 0);
  new.capability_name := v_catalog.capability_name;
  new.capability_value := v_catalog.capability_value;

  if nullif(btrim(coalesce(new.notes, '')), '') is null
     and nullif(btrim(coalesce(v_catalog.notes, '')), '') is not null then
    new.notes := v_catalog.notes;
  end if;

  if nullif(btrim(coalesce(new.location_name, '')), '') is null
     and nullif(btrim(coalesce(v_catalog.default_location_name, '')), '') is not null then
    new.location_name := v_catalog.default_location_name;
  end if;

  v_discount := greatest(0, least(100, coalesce(new.discount_percent, v_catalog.discount_percent, 0)));
  new.discount_percent := v_discount;
  new.discounted_unit_price := round(new.unit_price * (1 - (v_discount / 100.0)), 2);

  if lower(btrim(coalesce(v_catalog.section, ''))) = 'annual_saas' then
    v_months := coalesce(nullif(new.quantity, 0), 12);
    if v_months <= 0 then v_months := 12; end if;
    new.quantity := v_months;
    v_license_qty := greatest(1, coalesce(new.license_quantity, 1));
    new.license_quantity := v_license_qty;

    if new.service_start_date is null then
      select p.service_start_date, p.proposal_date into v_parent
      from public.proposals p
      where p.id = new.proposal_id;
      new.service_start_date := coalesce(v_parent.service_start_date, v_parent.proposal_date);
    end if;

    if new.service_start_date is not null then
      new.service_end_date := (
        new.service_start_date
        + make_interval(months => greatest(1, round(v_months)::integer))
        - interval '1 day'
      )::date;
    end if;

    v_base := new.unit_price * v_license_qty * (v_months / 12.0);
    new.line_total := round(v_base * (1 - (v_discount / 100.0)), 2);
  else
    new.quantity := greatest(1, coalesce(nullif(new.quantity, 0), nullif(v_catalog.quantity, 0), 1));
    new.license_quantity := greatest(1, coalesce(new.license_quantity, 1));
    v_base := new.unit_price * new.quantity;
    new.line_total := round(v_base * (1 - (v_discount / 100.0)), 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_proposal_item_catalog_details on public.proposal_items;
create trigger trg_enforce_proposal_item_catalog_details
before insert or update on public.proposal_items
for each row
execute function public.enforce_proposal_item_catalog_details();

create or replace function public.recalculate_proposal_commercial_totals_from_items()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proposal_id uuid := coalesce(new.proposal_id, old.proposal_id);
  v_saas numeric := 0;
  v_other numeric := 0;
  v_discount numeric := 0;
  v_grand numeric := 0;
begin
  select
    coalesce(sum(case when lower(btrim(coalesce(section, ''))) = 'annual_saas' then line_total else 0 end), 0),
    coalesce(sum(case when lower(btrim(coalesce(section, ''))) <> 'annual_saas' then line_total else 0 end), 0),
    coalesce(sum(
      greatest(0,
        case
          when lower(btrim(coalesce(section, ''))) = 'annual_saas'
            then (unit_price * greatest(1, coalesce(license_quantity, 1)) * (quantity / 12.0)) - line_total
          else (unit_price * quantity) - line_total
        end
      )
    ), 0),
    coalesce(sum(line_total), 0)
  into v_saas, v_other, v_discount, v_grand
  from public.proposal_items
  where proposal_id = v_proposal_id;

  update public.proposals
  set subtotal_locations = round(v_saas, 2),
      subtotal_one_time = round(v_other, 2),
      total_discount = round(v_discount, 2),
      grand_total = round(v_grand, 2)
  where id = v_proposal_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalculate_proposal_commercial_totals_from_items on public.proposal_items;
create trigger trg_recalculate_proposal_commercial_totals_from_items
after insert or update or delete on public.proposal_items
for each row
execute function public.recalculate_proposal_commercial_totals_from_items();