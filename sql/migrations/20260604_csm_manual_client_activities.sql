-- Support CSM Daily Activity entries for manually typed clients without agreements.
-- Existing rows remain agreement-based unless explicitly created in manual mode.
ALTER TABLE public.csm_activities
  ADD COLUMN IF NOT EXISTS activity_context text DEFAULT 'agreement_client',
  ADD COLUMN IF NOT EXISTS manual_client_name text,
  ADD COLUMN IF NOT EXISTS manual_location_name text;

UPDATE public.csm_activities
SET activity_context = 'agreement_client'
WHERE activity_context IS NULL OR btrim(activity_context) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.csm_activities'::regclass
      AND conname = 'csm_activities_activity_context_check'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.csm_activities
    WHERE activity_context IS NOT NULL
      AND activity_context NOT IN ('agreement_client', 'manual_client')
  ) THEN
    ALTER TABLE public.csm_activities
      ADD CONSTRAINT csm_activities_activity_context_check
      CHECK (activity_context IN ('agreement_client', 'manual_client'));
  END IF;
END $$;
