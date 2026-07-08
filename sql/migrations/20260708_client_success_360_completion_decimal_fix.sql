-- Client Success 360 decimal completion fix
-- Run this if the CS module was already installed before decimals were allowed.
-- Allows decimal values such as 8.51 and keeps two decimal precision.

begin;

alter table if exists public.cs_location_completions
  alter column done_on_time type numeric(12,2) using round(coalesce(done_on_time, 0)::numeric, 2),
  alter column done_late type numeric(12,2) using round(coalesce(done_late, 0)::numeric, 2),
  alter column partially_done type numeric(12,2) using round(coalesce(partially_done, 0)::numeric, 2),
  alter column missed type numeric(12,2) using round(coalesce(missed, 0)::numeric, 2),
  alter column done_on_time set default 0,
  alter column done_late set default 0,
  alter column partially_done set default 0,
  alter column missed set default 0;

commit;
