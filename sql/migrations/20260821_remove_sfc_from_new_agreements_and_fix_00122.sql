-- Remove the Senior Financial Controller from all normal new agreements.
-- Existing legacy/historical agreements that already contain the SFC signer are preserved.
-- Also repairs Agreement#00122 as requested.

create or replace function public.enforce_agreement_final_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_has_sfc boolean := false;
  v_preserve_legacy_sfc boolean := false;
begin
  new.billing_frequency := 'Annual';

  if new.payment_terms is null
     or btrim(new.payment_terms) = ''
     or new.payment_terms not in ('Net 7', 'Net 14', 'Net 21', 'Net 30') then
    new.payment_terms := 'Net 30';
  end if;

  new.provider_legal_name := 'InCheck 360 Holding BV';
  new.provider_name := 'InCheck 360';
  new.provider_address := 'Pyrmontstraat 5, 7513 BN, Enschede, The Netherlands';

  -- GM is the only provider signatory for all new agreements.
  new.provider_secondary_signatory_name := coalesce(
    nullif(btrim(new.provider_secondary_signatory_name), ''),
    nullif(btrim(new.provider_official_signatory_2_name), ''),
    'Hanna Khattar'
  );
  new.provider_secondary_signatory_title := coalesce(
    nullif(btrim(new.provider_secondary_signatory_title), ''),
    nullif(btrim(new.provider_official_signatory_2_title), ''),
    'General Manager'
  );
  new.provider_official_signatory_2_name := coalesce(
    nullif(btrim(new.provider_official_signatory_2_name), ''),
    new.provider_secondary_signatory_name
  );
  new.provider_official_signatory_2_title := coalesce(
    nullif(btrim(new.provider_official_signatory_2_title), ''),
    new.provider_secondary_signatory_title
  );

  if tg_op = 'UPDATE' then
    v_old_has_sfc :=
      nullif(btrim(coalesce(old.provider_official_signatory_1_name, '')), '') is not null
      or nullif(btrim(coalesce(old.provider_official_signatory_1_title, '')), '') is not null
      or old.provider_official_signatory_1_sign_date is not null
      or nullif(btrim(coalesce(old.provider_primary_signatory_name, '')), '') is not null
      or nullif(btrim(coalesce(old.provider_primary_signatory_title, '')), '') is not null
      or coalesce(old.financial_controller_signed, false);
  end if;

  v_preserve_legacy_sfc :=
    coalesce(new.is_imported, false)
    or coalesce(new.is_historical_agreement, false)
    or v_old_has_sfc;

  if v_preserve_legacy_sfc then
    new.provider_primary_signatory_name := coalesce(
      nullif(btrim(new.provider_primary_signatory_name), ''),
      nullif(btrim(new.provider_official_signatory_1_name), '')
    );
    new.provider_primary_signatory_title := coalesce(
      nullif(btrim(new.provider_primary_signatory_title), ''),
      nullif(btrim(new.provider_official_signatory_1_title), '')
    );

    if new.provider_primary_signatory_name is not null
       or new.provider_primary_signatory_title is not null
       or new.provider_official_signatory_1_sign_date is not null then
      new.provider_signatory_name := coalesce(
        nullif(btrim(new.provider_official_signatory_1_name), ''),
        new.provider_primary_signatory_name
      );
      new.provider_signatory_title := coalesce(
        nullif(btrim(new.provider_official_signatory_1_title), ''),
        new.provider_primary_signatory_title
      );
    else
      new.provider_signatory_name := new.provider_official_signatory_2_name;
      new.provider_signatory_title := new.provider_official_signatory_2_title;
    end if;
  else
    new.provider_official_signatory_1_name := null;
    new.provider_official_signatory_1_title := null;
    new.provider_official_signatory_1_sign_date := null;
    new.provider_primary_signatory_name := null;
    new.provider_primary_signatory_title := null;
    new.financial_controller_signed := false;
    new.provider_sign_date := null;
    new.provider_signatory_name := new.provider_official_signatory_2_name;
    new.provider_signatory_title := new.provider_official_signatory_2_title;
  end if;

  return new;
end;
$function$;

-- Targeted one-time correction for Agreement#00122.
alter table public.agreements
  disable trigger trg_prevent_normal_editing_signed_agreements;

update public.agreements
set
  status = 'Sent',
  customer_official_sign_date = null,
  customer_sign_date = null,
  customer_signed_at = null,
  signed_date = null,
  provider_official_signatory_1_name = null,
  provider_official_signatory_1_title = null,
  provider_official_signatory_1_sign_date = null,
  provider_primary_signatory_name = null,
  provider_primary_signatory_title = null,
  provider_signatory_name = 'Hanna Khattar',
  provider_signatory_title = 'General Manager',
  provider_sign_date = null,
  financial_controller_signed = false,
  provider_official_signatory_2_name = 'Hanna Khattar',
  provider_official_signatory_2_title = 'General Manager',
  provider_official_signatory_2_sign_date = null,
  provider_secondary_signatory_name = 'Hanna Khattar',
  provider_secondary_signatory_title = 'General Manager',
  provider_signatory_name_secondary = 'Hanna Khattar',
  provider_signatory_title_secondary = 'General Manager',
  gm_signed = false,
  updated_at = now()
where agreement_number = 'Agreement#00122';

alter table public.agreements
  enable trigger trg_prevent_normal_editing_signed_agreements;
