-- Remove AI Insights database configuration from InCheck 360.
-- Safe to re-run. AI Insights in this project is frontend-computed from tickets/events,
-- so there is no dedicated ai_insights data table to drop.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DELETE FROM public.role_permissions
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_rules') IS NOT NULL THEN
    DELETE FROM public.notification_rules
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notifications' AND column_name='resource'
     ) THEN
    DELETE FROM public.notifications
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_delivery_queue') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notification_delivery_queue' AND column_name='resource'
     ) THEN
    DELETE FROM public.notification_delivery_queue
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_event_types') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notification_event_types' AND column_name='resource'
     ) THEN
    DELETE FROM public.notification_event_types
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_events') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notification_events' AND column_name='resource'
     ) THEN
    DELETE FROM public.notification_events
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_delivery_log') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notification_delivery_log' AND column_name='resource'
     ) THEN
    DELETE FROM public.notification_delivery_log
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_actions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='notification_actions' AND column_name='resource'
     ) THEN
    DELETE FROM public.notification_actions
    WHERE lower(trim(coalesce(resource, ''))) IN ('ai_insights', 'insights');
  END IF;
END $$;

COMMIT;
