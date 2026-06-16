-- Biners end-to-end stability: atomic create, duplicate protection, and PostgREST schema reload.

CREATE UNIQUE INDEX IF NOT EXISTS biners_entries_entry_number_uidx
  ON public.biners_entries (entry_number)
  WHERE entry_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_create_biners_entry_with_details(p_payload jsonb)
RETURNS public.biners_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.biners_entries;
  v_entry_payload jsonb := p_payload - 'locations' - 'schedules';
  v_locations jsonb := COALESCE(p_payload->'locations', '[]'::jsonb);
  v_schedules jsonb := COALESCE(p_payload->'schedules', '[]'::jsonb);
  v_location jsonb;
  v_schedule jsonb;
  v_schedule_amount numeric;
  v_paid_amount numeric;
  v_idx integer := 0;
BEGIN
  INSERT INTO public.biners_entries
  SELECT * FROM jsonb_populate_record(NULL::public.biners_entries, v_entry_payload)
  RETURNING * INTO v_entry;

  FOR v_location IN SELECT value FROM jsonb_array_elements(v_locations)
  LOOP
    INSERT INTO public.biners_locations
    SELECT * FROM jsonb_populate_record(
      NULL::public.biners_locations,
      jsonb_build_object(
        'biners_entry_id', v_entry.id,
        'location_name', v_location->>'location_name',
        'location_reference', COALESCE(v_location->>'location_reference', v_location->>'location_code'),
        'client_reference', COALESCE(v_location->>'client_reference', v_entry.client_reference),
        'client_name', COALESCE(v_location->>'client_name', v_entry.client_name, v_entry.client_legal_name),
        'country', COALESCE(v_location->>'country', v_entry.client_country),
        'city', COALESCE(v_location->>'city', v_entry.client_city),
        'address', COALESCE(v_location->>'address', v_entry.client_address),
        'notes', COALESCE(v_location->>'notes', '')
      )
    );
  END LOOP;

  IF jsonb_array_length(v_schedules) = 0 THEN
    v_schedules := jsonb_build_array(jsonb_build_object(
      'due_date', COALESCE(v_entry.service_start_date, v_entry.service_end_date, CURRENT_DATE),
      'scheduled_amount', COALESCE(v_entry.total_payable_amount, 0),
      'paid_amount', 0,
      'payment_status', 'unpaid',
      'status', 'unpaid',
      'schedule_no', 1
    ));
  END IF;

  FOR v_schedule IN SELECT value FROM jsonb_array_elements(v_schedules)
  LOOP
    v_idx := v_idx + 1;
    v_schedule_amount := COALESCE(NULLIF(v_schedule->>'scheduled_amount', '')::numeric, 0);
    v_paid_amount := COALESCE(NULLIF(v_schedule->>'paid_amount', '')::numeric, 0);
    INSERT INTO public.biners_payment_schedules
    SELECT * FROM jsonb_populate_record(
      NULL::public.biners_payment_schedules,
      jsonb_build_object(
        'biners_entry_id', v_entry.id,
        'entry_number', v_entry.entry_number,
        'client_name', COALESCE(v_schedule->>'client_name', v_entry.client_name, v_entry.client_legal_name),
        'client_reference', COALESCE(v_schedule->>'client_reference', v_entry.client_reference),
        'location_name', COALESCE(v_schedule->>'location_name', ''),
        'location_reference', COALESCE(v_schedule->>'location_reference', ''),
        'module_name', COALESCE(v_schedule->>'module_name', v_entry.module_name),
        'license_type', COALESCE(v_schedule->>'license_type', v_entry.license_type),
        'due_date', COALESCE(NULLIF(v_schedule->>'due_date', '')::date, v_entry.service_start_date, v_entry.service_end_date, CURRENT_DATE),
        'scheduled_amount', v_schedule_amount,
        'paid_amount', v_paid_amount,
        'remaining_amount', GREATEST(v_schedule_amount - v_paid_amount, 0),
        'payment_status', COALESCE(v_schedule->>'payment_status', v_schedule->>'status', 'unpaid'),
        'status', COALESCE(v_schedule->>'status', v_schedule->>'payment_status', 'unpaid'),
        'notes', COALESCE(v_schedule->>'notes', ''),
        'schedule_no', COALESCE(NULLIF(v_schedule->>'schedule_no', '')::integer, v_idx),
        'currency', COALESCE(v_schedule->>'currency', v_entry.currency),
        'created_by', COALESCE(v_schedule->>'created_by', v_entry.created_by::text)::uuid,
        'created_by_email', COALESCE(v_schedule->>'created_by_email', v_entry.created_by_email)
      )
    );
  END LOOP;

  RETURN v_entry;
END;
$$;

NOTIFY pgrst, 'reload schema';
