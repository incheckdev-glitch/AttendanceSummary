-- CS360-only display/location cleanup for Café One SAL.
-- Do not update CRM companies, invoices, agreements, accounting, or client-module source data.

DO $$
DECLARE
  has_table boolean;
  has_location boolean;
  has_company_name boolean;
  has_company_snapshot boolean;
  has_client_name boolean;
  has_customer_name boolean;
BEGIN
  SELECT to_regclass('public.cs_location_completions') IS NOT NULL INTO has_table;
  IF has_table THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_location_completions' AND column_name = 'location_name') INTO has_location;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_location_completions' AND column_name = 'company_name') INTO has_company_name;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_location_completions' AND column_name = 'company_name_snapshot') INTO has_company_snapshot;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_location_completions' AND column_name = 'client_name') INTO has_client_name;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_location_completions' AND column_name = 'customer_name') INTO has_customer_name;

    IF has_location AND (has_company_name OR has_company_snapshot OR has_client_name OR has_customer_name) THEN
      EXECUTE format(
        'UPDATE public.cs_location_completions SET location_name = %L WHERE lower(trim(location_name)) = %L AND (%s)',
        'MET ABC & Napoletana',
        'cosmo abc',
        concat_ws(' OR ',
          CASE WHEN has_company_name THEN 'lower(replace(coalesce(company_name, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END,
          CASE WHEN has_company_snapshot THEN 'lower(replace(coalesce(company_name_snapshot, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END,
          CASE WHEN has_client_name THEN 'lower(replace(coalesce(client_name, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END,
          CASE WHEN has_customer_name THEN 'lower(replace(coalesce(customer_name, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END
        )
      );
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  has_table boolean;
  has_location boolean;
  has_company_snapshot boolean;
  has_client_name boolean;
BEGIN
  SELECT to_regclass('public.cs_client_brand_locations') IS NOT NULL INTO has_table;
  IF has_table THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_client_brand_locations' AND column_name = 'location_name') INTO has_location;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_client_brand_locations' AND column_name = 'company_name_snapshot') INTO has_company_snapshot;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_client_brand_locations' AND column_name = 'client_name') INTO has_client_name;

    IF has_location AND (has_company_snapshot OR has_client_name) THEN
      EXECUTE format(
        'UPDATE public.cs_client_brand_locations SET location_name = %L WHERE lower(trim(location_name)) = %L AND (%s)',
        'MET ABC & Napoletana',
        'cosmo abc',
        concat_ws(' OR ',
          CASE WHEN has_company_snapshot THEN 'lower(replace(coalesce(company_name_snapshot, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END,
          CASE WHEN has_client_name THEN 'lower(replace(coalesce(client_name, ''''), ''é'', ''e'')) LIKE ''%cafe one sal%''' END
        )
      );
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  has_locations boolean;
  has_clients boolean;
  has_location boolean;
  has_special_client_id boolean;
  has_client_name boolean;
BEGIN
  SELECT to_regclass('public.cs_special_client_locations') IS NOT NULL INTO has_locations;
  SELECT to_regclass('public.cs_special_clients') IS NOT NULL INTO has_clients;
  IF has_locations AND has_clients THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_special_client_locations' AND column_name = 'location_name') INTO has_location;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_special_client_locations' AND column_name = 'special_client_id') INTO has_special_client_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cs_special_clients' AND column_name = 'client_name') INTO has_client_name;

    IF has_location AND has_special_client_id AND has_client_name THEN
      UPDATE public.cs_special_client_locations loc
      SET location_name = 'MET ABC & Napoletana'
      FROM public.cs_special_clients client
      WHERE loc.special_client_id = client.id
        AND lower(trim(loc.location_name)) = 'cosmo abc'
        AND lower(replace(coalesce(client.client_name, ''), 'é', 'e')) LIKE '%cafe one sal%';
    END IF;
  END IF;
END $$;
