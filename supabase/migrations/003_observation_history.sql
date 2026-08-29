-- 003_observation_history.sql
-- Run in Supabase SQL Editor

create table if not exists public.observation_history (
  id                   bigserial primary key,
  station_id           text not null references public.stations(station_id),
  measured_at          timestamptz not null,
  temperature_c        double precision null,
  humidity_pct         double precision null,
  precipitation_mm     double precision null,
  wind_speed_ms        double precision null,
  wind_gust_ms         double precision null,
  pressure_hpa         double precision null,
  solar_radiation_wm2  double precision null,
  source               text not null default 'aws_graph',
  fetched_at           timestamptz not null default now(),
  unique (station_id, measured_at, source)
);

create index if not exists idx_obs_history_station_time
  on public.observation_history (station_id, measured_at desc);

alter table public.observation_history enable row level security;

create policy "Public read observation_history"
  on public.observation_history for select using (true);
