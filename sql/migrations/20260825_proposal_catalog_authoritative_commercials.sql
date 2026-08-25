-- Proposal catalog-authoritative commercial rules
-- Ensures proposal products come from the Proposal Catalog, canonicalizes product data,
-- fills safe proposal defaults from master data, and recalculates totals from persisted rows.

create or replace function public.proposal_standard_terms()
returns text
language sql
immutable
as $$
  select E'1. SaaS Cost is an annual recurring cost, while Account Setup is a one-time fee.\n2. Customer Support is continuous during the subscription term with an unlimited quantity of requests.\n3. InCheck''s Privacy Policy can be found at https://incheck360.com/privacy-policy\n4. InCheck''s Terms of Use can be found at https://incheck360.com/terms-of-use'::text;
$$;

create or replace function public.fill_proposal_standard_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_deal record;
  v_company record;
  v_contact record;
  v_profile record;
  v_proposal_date date;
  v_valid_until date;
begin
  v_proposal_date := coalesce(new.proposal_date, current_date);
  v_valid_until := coalesce(new.proposal_valid_until, new.valid_until, v_proposal_date + 14);

  new.proposal_date := v_proposal_date;
  new.proposal_valid_until := v_valid_until;
  new.valid_until := v_valid_until;
  new.billing_frequency := 'Annual';
  new.payment_term := coalesce(nullif(btrim(new.payment_term), ''), nullif(btrim(new.payment_terms), ''), 'Net 30');
  new.payment_terms := coalesce(nullif(btrim(new.payment_terms), ''), new.payment_term, 'Net 30');
  new.currency := coalesce(nullif(btrim(new.currency), ''), 'USD');
  new.terms_conditions := coalesce(nullif(btrim(new.terms_conditions), ''), public.proposal_standard_terms());
  new.provider_contact_name := coalesce(nullif(btrim(new.provider_contact_name), ''), 'InCheck 360 Holding BV');
  new.provider_contact_mobile := coalesce(nullif(btrim(new.provider_contact_mobile), ''), '+31 97 010280855');
  new.provider_contact_email := coalesce(nullif(btrim(new.provider_contact_email), ''), 'Info@incheck360.nl');

  if new.deal_id is not null then
    select d.* into v_deal
    from public.deals d
    where d.id = new.deal_id
    limit 1;

    if found then
      new.company_id := coalesce(nullif(btrim(new.company_id), ''), nullif(btrim(v_deal.company_id), ''));
      new.company_name := coalesce(nullif(btrim(new.company_name), ''), nullif(btrim(v_deal.company_name), ''));
      new.customer_name := coalesce(nullif(btrim(new.customer_name), ''), nullif(btrim(v_deal.company_name), ''));
    end if;
  end if;

  if nullif(btrim(new.company_id), '') is not null then
    select c.* into v_company
    from public.companies c
    where c.company_id = new.company_id
    limit 1;

    if found then
      new.company_name := coalesce(nullif(btrim(new.company_name), ''), nullif(btrim(v_company.company_name), ''));
      new.customer_name := coalesce(nullif(btrim(new.customer_name), ''), nullif(btrim(v_company.legal_name), ''), nullif(btrim(v_company.company_name), ''));
      new.customer_legal_name := coalesce(nullif(btrim(new.customer_legal_name), ''), nullif(btrim(v_company.legal_name), ''), nullif(btrim(v_company.company_name), ''));
      new.customer_address := coalesce(nullif(btrim(new.customer_address), ''), nullif(btrim(v_company.address), ''));
      new.customer_signatory_name := coalesce(nullif(btrim(new.customer_signatory_name), ''), nullif(btrim(v_company.authorized_signatory_full_name), ''));
      new.customer_signatory_title := coalesce(nullif(btrim(new.customer_signatory_title), ''), nullif(btrim(v_company.authorized_signatory_title), ''));

      select ct.* into v_contact
      from public.contacts ct
      where ct.company_id = v_company.company_id
         or v_company.company_id = any(coalesce(ct.company_ids, array[]::text[]))
      order by coalesce(ct.is_primary_contact, false) desc, ct.created_at asc
      limit 1;

      if found then
        new.contact_id := coalesce(nullif(btrim(new.contact_id), ''), nullif(btrim(v_contact.contact_id), ''));
        new.contact_name := coalesce(nullif(btrim(new.contact_name), ''), nullif(btrim(v_contact.full_name), ''));
        new.contact_email := coalesce(nullif(btrim(new.contact_email), ''), nullif(btrim(v_contact.email), ''));
        new.contact_phone := coalesce(nullif(btrim(new.contact_phone), ''), nullif(btrim(v_contact.phone), ''));
        new.contact_mobile := coalesce(nullif(btrim(new.contact_mobile), ''), nullif(btrim(v_contact.mobile), ''));
        new.customer_contact_name := coalesce(nullif(btrim(new.customer_contact_name), ''), nullif(btrim(v_contact.full_name), ''));
        new.customer_contact_email := coalesce(nullif(btrim(new.customer_contact_email), ''), nullif(btrim(v_contact.email), ''));
        new.customer_contact_mobile := coalesce(nullif(btrim(new.customer_contact_mobile), ''), nullif(btrim(v_contact.mobile), ''), nullif(btrim(v_contact.phone), ''));
      end if;
    end if;
  end if;

  if auth.uid() is not null and new.provider_signatory_user_id is null then
    select p.id, p.name, p.role_key, r.role_name
      into v_profile
    from public.profiles p
    left join public.roles r on r.role_key = p.role_key
    where p.id = auth.uid()
    limit 1;

    if found then
      new.provider_signatory_user_id := v_profile.id;
      new.provider_signatory_name := coalesce(nullif(btrim(new.provider_signatory_name), ''), nullif(btrim(v_profile.name), ''));
      new.provider_signatory_title := coalesce(nullif(btrim(new.provider_signatory_title), ''), nullif(btrim(v_profile.role_name), ''), nullif(btrim(v_profile.role_key), ''));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_proposal_standard_defaults on public.proposals;
create trigger trg_fill_proposal_standard_defaults
before insert or update on public.proposals
for each row execute function public.fill_proposal_standard_defaults();

create or replace function public.fill_proposal_provider_signatory_from_creator()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid;
  v_profile record;
begin
  if new.provider_signatory_user_id is not null
     and nullif(btrim(coalesce(new.provider_signatory_name,'')), '') is not null
     and nullif(btrim(coalesce(new.provider_signatory_title,'')), '') is not null then
    return new;
  end if;

  v_actor := coalesce(auth.uid(), new.provider_signatory_user_id, new.created_by);
  if v_actor is null then return new; end if;

  select p.id, p.name, p.role_key, r.role_name
    into v_profile
  from public.profiles p
  left join public.roles r on r.role_key = p.role_key
  where p.id = v_actor
  limit 1;

  if found then
    new.provider_signatory_user_id := coalesce(new.provider_signatory_user_id, v_profile.id);
    new.provider_signatory_name := coalesce(nullif(btrim(new.provider_signatory_name), ''), nullif(btrim(v_profile.name), ''));
    new.provider_signatory_title := coalesce(nullif(btrim(new.provider_signatory_title), ''), nullif(btrim(v_profile.role_name), ''), nullif(btrim(v_profile.role_key), ''));
  end if;
  return new;
end;
$$;

drop trigger if exists zzz_fill_proposal_provider_signatory on public.proposals;
create trigger zzz_fill_proposal_provider_signatory
before insert or update on public.proposals
for each row execute function public.fill_proposal_provider_signatory_from_creator();

create or replace function public.enforce_proposal_item_from_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_catalog public.proposal_catalog_items%rowtype;
  v_parent public.proposals%rowtype;
  v_base numeric;
  v_discounted numeric;
  v_license_qty numeric;
  v_whole_months integer;
  v_fraction numeric;
  v_end_exclusive date;
  v_days_in_anchor integer;
  v_extra_days integer;
begin
  if nullif(btrim(coalesce(new.item_name, '')), '') is null then
    raise exception 'Proposal items must use a product from the Proposal Catalog.' using errcode = '23514';
  end if;

  select pci.* into v_catalog
  from public.proposal_catalog_items pci
  where lower(btrim(pci.item_name)) = lower(btrim(new.item_name))
  order by pci.is_active desc, pci.updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Proposal item "%" is not in the Proposal Catalog.', new.item_name using errcode = '23514';
  end if;

  new.item_name := v_catalog.item_name;
  new.section := lower(btrim(coalesce(v_catalog.section, new.section, '')));
  new.unit_price := coalesce(v_catalog.unit_price, 0);
  new.capability_name := coalesce(nullif(btrim(new.capability_name), ''), nullif(btrim(v_catalog.capability_name), ''));
  new.capability_value := coalesce(nullif(btrim(new.capability_value), ''), nullif(btrim(v_catalog.capability_value), ''));
  new.notes := coalesce(nullif(btrim(new.notes), ''), nullif(btrim(v_catalog.notes), ''));

  if new.discount_percent is null then new.discount_percent := coalesce(v_catalog.discount_percent, 0); end if;
  new.discount_percent := greatest(0, least(100, new.discount_percent));

  if new.section = 'annual_saas' then
    if new.quantity is null or new.quantity <= 0 then
      new.quantity := case when coalesce(v_catalog.quantity, 0) > 0 then v_catalog.quantity else 12 end;
    end if;
    if new.quantity > 12 then
      raise exception 'Annual SaaS quantity represents license months and cannot exceed 12. Use license_quantity or separate location rows for multiple licenses.' using errcode = '23514';
    end if;

    new.license_quantity := greatest(coalesce(new.license_quantity, 1), 1);

    select p.* into v_parent from public.proposals p where p.id = new.proposal_id limit 1;
    if new.service_start_date is null then
      new.service_start_date := coalesce(v_parent.service_start_date, v_parent.proposal_date, current_date);
    end if;

    if new.service_end_date is null and new.service_start_date is not null then
      v_whole_months := trunc(new.quantity)::integer;
      v_fraction := new.quantity - trunc(new.quantity);
      v_end_exclusive := new.service_start_date + make_interval(months => v_whole_months);
      if v_fraction > 0 then
        v_days_in_anchor := extract(day from (date_trunc('month', v_end_exclusive::timestamp) + interval '1 month - 1 day'))::integer;
        v_extra_days := greatest(1, round(v_days_in_anchor * v_fraction)::integer);
        v_end_exclusive := v_end_exclusive + v_extra_days;
      end if;
      new.service_end_date := v_end_exclusive - 1;
    end if;

    if tg_op = 'INSERT' and new.quantity < 12 then new.discount_percent := 0; end if;

    v_license_qty := greatest(coalesce(new.license_quantity, 1), 1);
    v_base := new.unit_price * v_license_qty * (new.quantity / 12.0);
    v_discounted := v_base * (1 - new.discount_percent / 100.0);
    new.discounted_unit_price := round(v_discounted, 2);
    new.line_total := round(v_discounted, 2);
  else
    if new.quantity is null or new.quantity <= 0 then
      new.quantity := case when coalesce(v_catalog.quantity, 0) > 0 then v_catalog.quantity else 1 end;
    end if;
    v_base := new.unit_price * new.quantity;
    v_discounted := new.unit_price * (1 - new.discount_percent / 100.0);
    new.discounted_unit_price := round(v_discounted, 2);
    new.line_total := round(v_base * (1 - new.discount_percent / 100.0), 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proposal_items_catalog_authoritative on public.proposal_items;
create trigger trg_proposal_items_catalog_authoritative
before insert or update on public.proposal_items
for each row execute function public.enforce_proposal_item_from_catalog();

create or replace function public.recalculate_proposal_commercials(p_proposal_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_saas numeric := 0;
  v_one_time numeric := 0;
  v_discount numeric := 0;
  v_grand numeric := 0;
  v_start date;
  v_end date;
  v_term numeric;
  v_term_text text;
  v_proposal_date date;
  v_valid_until date;
begin
  if p_proposal_id is null then return; end if;

  select
    coalesce(sum(case when lower(btrim(coalesce(pi.section,''))) = 'annual_saas' then coalesce(pi.line_total,0) else 0 end),0),
    coalesce(sum(case when lower(btrim(coalesce(pi.section,''))) <> 'annual_saas' then coalesce(pi.line_total,0) else 0 end),0),
    coalesce(sum(greatest((case when lower(btrim(coalesce(pi.section,''))) = 'annual_saas'
      then coalesce(pi.unit_price,0) * greatest(coalesce(pi.license_quantity,1),1) * (coalesce(pi.quantity,0) / 12.0)
      else coalesce(pi.unit_price,0) * coalesce(pi.quantity,0) end) - coalesce(pi.line_total,0), 0)),0),
    coalesce(sum(coalesce(pi.line_total,0)),0),
    min(pi.service_start_date) filter (where lower(btrim(coalesce(pi.section,''))) = 'annual_saas'),
    max(pi.service_end_date) filter (where lower(btrim(coalesce(pi.section,''))) = 'annual_saas'),
    max(pi.quantity) filter (where lower(btrim(coalesce(pi.section,''))) = 'annual_saas')
  into v_saas, v_one_time, v_discount, v_grand, v_start, v_end, v_term
  from public.proposal_items pi
  where pi.proposal_id = p_proposal_id;

  select coalesce(p.proposal_date, current_date), coalesce(p.proposal_valid_until, p.valid_until, coalesce(p.proposal_date,current_date) + 14)
  into v_proposal_date, v_valid_until
  from public.proposals p where p.id = p_proposal_id;

  if v_term is not null and v_term > 0 then
    v_term_text := trim(to_char(v_term, 'FM999999990.##')) || ' months';
  end if;

  update public.proposals p
  set subtotal_locations = round(v_saas,2),
      subtotal_one_time = round(v_one_time,2),
      total_discount = round(v_discount,2),
      grand_total = round(v_grand,2),
      proposal_date = v_proposal_date,
      proposal_valid_until = v_valid_until,
      valid_until = v_valid_until,
      service_start_date = coalesce(p.service_start_date, v_start),
      service_end_date = coalesce(p.service_end_date, v_end),
      contract_term = coalesce(nullif(btrim(p.contract_term), ''), v_term_text),
      billing_frequency = 'Annual',
      payment_term = coalesce(nullif(btrim(p.payment_term), ''), nullif(btrim(p.payment_terms), ''), 'Net 30'),
      payment_terms = coalesce(nullif(btrim(p.payment_terms), ''), nullif(btrim(p.payment_term), ''), 'Net 30'),
      currency = coalesce(nullif(btrim(p.currency), ''), 'USD'),
      terms_conditions = coalesce(nullif(btrim(p.terms_conditions), ''), public.proposal_standard_terms()),
      provider_contact_name = coalesce(nullif(btrim(p.provider_contact_name), ''), 'InCheck 360 Holding BV'),
      provider_contact_mobile = coalesce(nullif(btrim(p.provider_contact_mobile), ''), '+31 97 010280855'),
      provider_contact_email = coalesce(nullif(btrim(p.provider_contact_email), ''), 'Info@incheck360.nl')
  where p.id = p_proposal_id;
end;
$$;

create or replace function public.trg_recalculate_proposal_commercials()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.recalculate_proposal_commercials(coalesce(new.proposal_id, old.proposal_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proposal_items_recalculate_commercials on public.proposal_items;
create trigger trg_proposal_items_recalculate_commercials
after insert or update or delete on public.proposal_items
for each row execute function public.trg_recalculate_proposal_commercials();
