-- Add nullable link/display columns so invoice-scoped Operations Onboarding rows
-- can create Technical Admin Requests without relying on agreement-only matching.
-- Safe to run more than once and does not constrain existing rows.

ALTER TABLE public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS operations_onboarding_id uuid,
  ADD COLUMN IF NOT EXISTS source_onboarding_id text,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS source_invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS agreement_number text;
