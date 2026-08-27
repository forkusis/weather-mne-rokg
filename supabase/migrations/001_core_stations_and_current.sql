-- 001_core_stations_and_current.sql
-- Slice 1: core tables for stations + current observations + sync monitoring
-- Run this in Supabase SQL Editor (or via supabase db push later)

-- Stations catalog
create table if not exists public.stations (
  station_id        text primary key,          -- e.g. 02PDGR10 (ZHMS internal ID)
  wmo_id            integer null,
  name              text not null,
  latitude          double precision null,
  longitude         double precision null,
  elevation_m       double precision null,
  station_type      text not null,             -- glavna | automatska | ...
  active            boolean not null default true,
  source_updated_at timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Latest valid observation per station
create table if not exists public.current_observations (
  station_id           text primary key references public.stations(station_id),
  measured_at          timestamptz not null,
  fetched_at           timestamptz not null,
  temperature_c        double precision null,
  humidity_pct         double precision null,
  precipitation_mm     double precision null,
  wind_speed_ms        double precision null,
  wind_direction_deg   double precision null,
  wind_direction_code  integer null,
  wind_gust_ms         double precision null,
  pressure_hpa         double precision null,
  solar_radiation_wm2  double precision null,
  weather_code         integer null,
  weather_description  text null,
  source_status        text not null default 'ok',  -- ok | stale | parse_error | source_unavailable
  raw_hash             text null,
  updated_at           timestamptz not null default now()
);

-- Ingest / sync monitoring
create table if not exists public.sync_status (
  source_key           text primary key,       -- e.g. aws_current
  last_attempt_at      timestamptz null,
  last_success_at      timestamptz null,
  last_source_hash     text null,
  last_error           text null,
  rows_written         integer null,
  status               text not null default 'unknown'  -- ok | error | running
);

create index if not exists idx_current_obs_measured
  on public.current_observations (measured_at desc);

-- Row Level Security
alter table public.stations enable row level security;
alter table public.current_observations enable row level security;
alter table public.sync_status enable row level security;

-- Public read (anon key can SELECT)
create policy "Public read stations"
  on public.stations for select using (true);

create policy "Public read current_observations"
  on public.current_observations for select using (true);

-- No public write policies → only service_role can INSERT/UPDATE
-- (service_role bypasses RLS by default)
