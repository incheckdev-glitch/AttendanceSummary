-- 2026-06-19 Biners schedule-based forecast RPC fix
-- Forecasts must be sourced from biners_payment_schedules, with one output row per scheduled payment.

CREATE OR REPLACE VIEW public.biners_forecast_rows AS
SELECT
  s.id AS schedule_id,
  s.id AS biners_schedule_id,
  s.biners_entry_id,
  e.entry_number,
  COALESCE(s.client_name, e.client_name, e.client_legal_name) AS client_name,
  s.location_name,
  s.schedule_no,
  s.due_date,
  COALESCE(s.currency, e.currency, 'USD') AS currency,
  COALESCE(s.scheduled_amount, 0)::numeric AS scheduled_amount,
  COALESCE(s.paid_amount, 0)::numeric AS paid_amount,
  GREATEST(COALESCE(s.scheduled_amount, 0)::numeric - COALESCE(s.paid_amount, 0)::numeric, 0)::numeric AS remaining_amount,
  CASE
    WHEN GREATEST(COALESCE(s.scheduled_amount, 0)::numeric - COALESCE(s.paid_amount, 0)::numeric, 0) <= 0 THEN 'paid'
    WHEN COALESCE(s.paid_amount, 0)::numeric > 0 THEN 'partially_paid'
    WHEN s.due_date < CURRENT_DATE THEN 'overdue'
    ELSE COALESCE(NULLIF(s.status, ''), NULLIF(s.payment_status, ''), 'upcoming')
  END AS status,
  s.notes,
  date_trunc('month', s.due_date)::date AS forecast_month,
  CASE WHEN s.due_date < CURRENT_DATE THEN GREATEST(COALESCE(s.scheduled_amount, 0)::numeric - COALESCE(s.paid_amount, 0)::numeric, 0)::numeric ELSE 0::numeric END AS overdue_amount,
  CASE WHEN s.due_date >= CURRENT_DATE AND s.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN GREATEST(COALESCE(s.scheduled_amount, 0)::numeric - COALESCE(s.paid_amount, 0)::numeric, 0)::numeric ELSE 0::numeric END AS due_soon_amount
FROM public.biners_payment_schedules s
LEFT JOIN public.biners_entries e ON e.id = s.biners_entry_id
WHERE s.due_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_biners_monthly_forecast(p_currency text DEFAULT 'all')
RETURNS TABLE (
  forecast_month date,
  currency text,
  scheduled_rows bigint,
  client_count bigint,
  entry_count bigint,
  location_count bigint,
  gross_payable numeric,
  paid_amount numeric,
  remaining_payable numeric,
  overdue_amount numeric,
  due_soon_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.forecast_month,
    r.currency,
    COUNT(*) AS scheduled_rows,
    COUNT(DISTINCT r.client_name) AS client_count,
    COUNT(DISTINCT r.biners_entry_id) AS entry_count,
    COUNT(DISTINCT r.location_name) AS location_count,
    COALESCE(SUM(r.scheduled_amount), 0)::numeric AS gross_payable,
    COALESCE(SUM(r.paid_amount), 0)::numeric AS paid_amount,
    COALESCE(SUM(r.remaining_amount), 0)::numeric AS remaining_payable,
    COALESCE(SUM(r.overdue_amount), 0)::numeric AS overdue_amount,
    COALESCE(SUM(r.due_soon_amount), 0)::numeric AS due_soon_amount
  FROM public.biners_forecast_rows r
  WHERE COALESCE(NULLIF(p_currency, ''), 'all') = 'all'
     OR lower(r.currency) = lower(p_currency)
  GROUP BY r.forecast_month, r.currency
  ORDER BY r.forecast_month, r.currency;
$$;

CREATE OR REPLACE FUNCTION public.get_biners_monthly_forecast_details(p_currency text DEFAULT 'all', p_forecast_month text DEFAULT NULL)
RETURNS TABLE (
  entry_number text,
  client_name text,
  location_name text,
  schedule_no integer,
  due_date date,
  currency text,
  scheduled_amount numeric,
  paid_amount numeric,
  remaining_amount numeric,
  status text,
  notes text,
  biners_entry_id uuid,
  schedule_id uuid,
  forecast_month date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested_month AS (
    SELECT date_trunc('month', COALESCE(NULLIF(p_forecast_month, '')::date, CURRENT_DATE))::date AS month_start
  )
  SELECT
    r.entry_number,
    r.client_name,
    r.location_name,
    r.schedule_no,
    r.due_date,
    r.currency,
    r.scheduled_amount,
    r.paid_amount,
    r.remaining_amount,
    r.status,
    r.notes,
    r.biners_entry_id,
    r.schedule_id,
    r.forecast_month
  FROM public.biners_forecast_rows r
  CROSS JOIN requested_month m
  WHERE r.forecast_month = m.month_start
    AND (COALESCE(NULLIF(p_currency, ''), 'all') = 'all' OR lower(r.currency) = lower(p_currency))
  ORDER BY r.due_date, r.entry_number, r.schedule_no, r.schedule_id;
$$;

GRANT SELECT ON public.biners_forecast_rows TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_biners_monthly_forecast(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_biners_monthly_forecast_details(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
