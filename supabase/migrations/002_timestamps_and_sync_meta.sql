-- 002_timestamps_and_sync_meta.sql
-- Run in Supabase → SQL Editor → New query → Run

-- When we first observed this snapshot (hash change)
alter table public.current_observations
  add column if not exists source_updated_at timestamptz null;

-- When the row was written to our DB
alter table public.current_observations
  add column if not exists ingested_at timestamptz null;

alter table public.sync_status
  add column if not exists last_source_updated_at timestamptz null;

alter table public.sync_status
  add column if not exists last_fetched_at timestamptz null;

alter table public.sync_status
  add column if not exists last_ingest_lag_seconds integer null;

alter table public.sync_status
  add column if not exists consecutive_failures integer not null default 0;

alter table public.sync_status
  add column if not exists last_check_at timestamptz null;
