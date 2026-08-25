create or replace function public.apply_canonical_proposal_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deal public.deals%rowtype;
  v_company public.companies%rowtype;
  v_contact public.contacts%rowtype;
  v_profile public.profiles%rowtype;
  v_user_id uuid;
  v_customer_name text;
begin
  if new.proposal_date is null then new.proposal_date := current_date; end if;

  if new.proposal_valid_until is null and new.valid_until is not null then
    new.proposal_valid_until := new.valid_until;
  elsif new.valid_until is null and new.proposal_valid_until is not null then
    new.valid_until := new.proposal_valid_until;
  elsif new.proposal_valid_until is null and new.valid_until is null then
    new.proposal_valid_until := new.proposal_date + 14;
    new.valid_until := new.proposal_valid_until;
  end if;

  if new.proposal_valid_until < new.proposal_date or new.proposal_valid_until > new.proposal_date + 30 then
    new.proposal_valid_until := new.proposal_date + 14;
  end if;
  new.valid_until := new.proposal_valid_until;

  new.provider_contact_name := 'InCheck 360 Holding BV';
  new.provider_contact_mobile := '+31 97 010280855';
  new.provider_contact_email := 'Info@incheck360.nl';
  new.billing_frequency := 'Annual';

  if nullif(btrim(coalesce(new.payment_term, '')), '') is null or new.payment_term not in ('Net 7','Net 14','Net 21','Net 30') then
    new.payment_term := 'Net 30';
  end if;
  new.payment_terms := new.payment_term;

  if nullif(btrim(coalesce(new.currency, '')), '') is null then new.currency := 'USD'; end if;
  if new.service_start_date is null then new.service_start_date := new.proposal_date; end if;
  if nullif(btrim(coalesce(new.contract_term, '')), '') is null then new.contract_term := '12 months'; end if;

  if nullif(btrim(coalesce(new.terms_conditions, '')), '') is null then
    new.terms_conditions := E'1. SaaS Cost is an annual recurring cost, while Account Setup is a one-time fee.\n2. Customer Support is continuous during the subscription term with an unlimited quantity of requests.\n3. InCheck''s Privacy Policy can be found at https://incheck360.com/privacy-policy\n4. InCheck''s Terms of Use can be found at https://incheck360.com/terms-of-use';
  end if;

  if tg_op = 'UPDATE' and nullif(btrim(coalesce(new.status, '')), '') is null then
    new.status := old.status;
  elsif nullif(btrim(coalesce(new.status, '')), '') is null then
    new.status := 'draft';
  end if;

  if new.deal_id is not null then
    select d.* into v_deal from public.deals d where d.id = new.deal_id limit 1;
  end if;

  if nullif(btrim(coalesce(new.company_id, '')), '') is null and nullif(btrim(coalesce(v_deal.company_id, '')), '') is not null then
    new.company_id := v_deal.company_id;
  end if;

  if nullif(btrim(coalesce(new.company_id, '')), '') is not null then
    select c.* into v_company from public.companies c where c.company_id = new.company_id limit 1;
  end if;

  v_customer_name := coalesce(
    nullif(btrim(v_company.legal_name), ''),
    nullif(btrim(v_company.company_name), ''),
    nullif(btrim(v_deal.company_name), ''),
    nullif(btrim(new.customer_name), '')
  );

  if nullif(btrim(coalesce(new.company_name, '')), '') is null then
    new.company_name := coalesce(nullif(btrim(v_company.company_name), ''), nullif(btrim(v_deal.company_name), ''));
  end if;
  if nullif(btrim(coalesce(new.customer_name, '')), '') is null then new.customer_name := v_customer_name; end if;
  if nullif(btrim(coalesce(new.customer_legal_name, '')), '') is null then new.customer_legal_name := v_customer_name; end if;
  if nullif(btrim(coalesce(new.customer_address, '')), '') is null then new.customer_address := nullif(btrim(v_company.address), ''); end if;
  if nullif(btrim(coalesce(new.customer_signatory_name, '')), '') is null then new.customer_signatory_name := nullif(btrim(v_company.authorized_signatory_full_name), ''); end if;
  if nullif(btrim(coalesce(new.customer_signatory_title, '')), '') is null then new.customer_signatory_title := nullif(btrim(v_company.authorized_signatory_title), ''); end if;

  if nullif(btrim(coalesce(new.company_id, '')), '') is not null and nullif(btrim(coalesce(new.contact_id, '')), '') is null then
    select c.* into v_contact
    from public.contacts c
    where c.company_id = new.company_id and lower(coalesce(c.contact_status, 'active')) = 'active'
    order by coalesce(c.is_primary_contact, false) desc, c.created_at asc
    limit 1;

    if v_contact.id is not null then
      new.contact_id := v_contact.contact_id;
      new.contact_name := coalesce(nullif(btrim(v_contact.full_name), ''), btrim(concat_ws(' ', v_contact.first_name, v_contact.last_name)));
      new.contact_email := nullif(btrim(v_contact.email), '');
      new.contact_phone := coalesce(nullif(btrim(v_contact.phone), ''), nullif(btrim(v_contact.mobile), ''));
      new.contact_mobile := coalesce(nullif(btrim(v_contact.mobile), ''), nullif(btrim(v_contact.phone), ''));
      new.customer_contact_name := new.contact_name;
      new.customer_contact_email := new.contact_email;
      new.customer_contact_mobile := new.contact_mobile;
    end if;
  end if;

  if nullif(btrim(coalesce(new.customer_contact_name, '')), '') is null then new.customer_contact_name := new.contact_name; end if;
  if nullif(btrim(coalesce(new.customer_contact_email, '')), '') is null then new.customer_contact_email := new.contact_email; end if;
  if nullif(btrim(coalesce(new.customer_contact_mobile, '')), '') is null then new.customer_contact_mobile := coalesce(new.contact_mobile, new.contact_phone); end if;

  begin v_user_id := auth.uid(); exception when others then v_user_id := null; end;
  if v_user_id is not null then
    select p.* into v_profile from public.profiles p where p.id = v_user_id limit 1;
    if new.provider_signatory_user_id is null then new.provider_signatory_user_id := v_user_id; end if;
    if nullif(btrim(coalesce(new.provider_signatory_name, '')), '') is null then new.provider_signatory_name := coalesce(nullif(btrim(v_profile.name), ''), nullif(btrim(v_profile.email), '')); end if;
    if nullif(btrim(coalesce(new.provider_signatory_title, '')), '') is null then new.provider_signatory_title := initcap(replace(coalesce(v_profile.role_key, 'admin'), '_', ' ')); end if;
  end if;

  if nullif(btrim(coalesce(new.proposal_title, '')), '') is null then
    new.proposal_title := 'Proposal for ' || coalesce(nullif(btrim(new.customer_name), ''), nullif(btrim(new.company_name), ''), 'Customer');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_canonical_proposal_defaults on public.proposals;
create trigger trg_apply_canonical_proposal_defaults
before insert or update on public.proposals
for each row
execute function public.apply_canonical_proposal_defaults();