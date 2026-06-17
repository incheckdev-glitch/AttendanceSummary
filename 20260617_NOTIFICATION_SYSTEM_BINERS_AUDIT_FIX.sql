-- 2026-06-17 Notification System + Biners event fix
-- Purpose:
-- 1) Ensure Notification Setup contains the Biners "New Entry Created" event.
-- 2) Ensure the event has in-app + PWA enabled by default and has target roles.
-- 3) Provide quick audit queries for in-app rows and PWA delivery logs.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  resource_label text,
  action_label text,
  title_template text,
  body_template text,
  deep_link_template text,
  recipient_mode text,
  is_active boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  pwa_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  recipient_roles text[] NOT NULL DEFAULT '{}',
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  recipient_emails text[] NOT NULL DEFAULT '{}',
  users_from_record text[] NOT NULL DEFAULT '{}',
  exclude_actor boolean NOT NULL DEFAULT true,
  dedupe_window_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (resource, action)
);

ALTER TABLE public.notification_rules
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS resource_label text,
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS title_template text,
  ADD COLUMN IF NOT EXISTS body_template text,
  ADD COLUMN IF NOT EXISTS deep_link_template text,
  ADD COLUMN IF NOT EXISTS recipient_mode text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pwa_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recipient_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipient_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS users_from_record text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_actor boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dedupe_window_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

INSERT INTO public.notification_rules (
  resource,
  action,
  description,
  resource_label,
  action_label,
  title_template,
  body_template,
  deep_link_template,
  recipient_roles,
  recipient_user_ids,
  recipient_emails,
  users_from_record,
  recipient_mode,
  is_active,
  is_enabled,
  in_app_enabled,
  pwa_enabled,
  email_enabled,
  exclude_actor,
  dedupe_window_seconds,
  created_at,
  updated_at
)
VALUES (
  'biners',
  'biners_entry_created',
  'Notify relevant users when a new Biners payable entry is created.',
  'Biners',
  'New Biners Entry Created',
  'New Biners Entry Created',
  'A new Biners payable entry {{entry_number}} was created for {{client_name}} with a gross payable amount of USD {{gross_payable}}. {{schedule_count}} scheduled payment(s) created.',
  '/biners?entryId={{biners_entry_id}}',
  ARRAY['admin','accounting','senior_financial_controller','general_manager']::text[],
  ARRAY[]::uuid[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  null,
  true,
  true,
  true,
  true,
  false,
  true,
  60,
  timezone('utc', now()),
  timezone('utc', now())
)
ON CONFLICT (resource, action)
DO UPDATE SET
  description = EXCLUDED.description,
  resource_label = EXCLUDED.resource_label,
  action_label = EXCLUDED.action_label,
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link_template = EXCLUDED.deep_link_template,
  recipient_roles = CASE
    WHEN coalesce(array_length(public.notification_rules.recipient_roles, 1), 0) = 0
      THEN EXCLUDED.recipient_roles
    ELSE public.notification_rules.recipient_roles
  END,
  is_active = true,
  is_enabled = true,
  in_app_enabled = true,
  pwa_enabled = true,
  email_enabled = COALESCE(public.notification_rules.email_enabled, false),
  exclude_actor = COALESCE(public.notification_rules.exclude_actor, true),
  dedupe_window_seconds = GREATEST(COALESCE(public.notification_rules.dedupe_window_seconds, 60), 1),
  updated_at = timezone('utc', now());

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Audit after creating/testing a Biners entry:
-- 1) Confirm setup rule:
-- SELECT resource, action, is_enabled, in_app_enabled, pwa_enabled, email_enabled, recipient_roles, title_template, body_template, deep_link_template
-- FROM public.notification_rules
-- WHERE resource = 'biners' AND action = 'biners_entry_created';
--
-- 2) Confirm in-app notification rows:
-- SELECT *
-- FROM public.notifications
-- WHERE resource = 'biners'
--    OR to_jsonb(notifications)::text ILIKE '%biners_entry_created%'
-- ORDER BY created_at DESC
-- LIMIT 20;
--
-- 3) Confirm PWA delivery logs if available:
-- SELECT *
-- FROM public.notification_delivery_log
-- WHERE resource = 'biners' OR action = 'biners_entry_created'
-- ORDER BY created_at DESC
-- LIMIT 20;
