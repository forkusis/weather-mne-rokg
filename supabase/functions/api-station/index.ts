/**
 * GET /functions/v1/api-station?id=02PDGR10
 * Returns one station + full current observation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id query param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey);

    const { data: station, error: stErr } = await supabase
      .from("stations")
      .select(
        "station_id, wmo_id, name, latitude, longitude, elevation_m, station_type, active",
      )
      .eq("station_id", id)
      .maybeSingle();

    if (stErr) throw new Error(stErr.message);
    if (!station) {
      return new Response(JSON.stringify({ error: "Station not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: obs, error: obsErr } = await supabase
      .from("current_observations")
      .select("*")
      .eq("station_id", id)
      .maybeSingle();

    if (obsErr) throw new Error(obsErr.message);

    const payload = {
      station: {
        id: station.station_id,
        wmoId: station.wmo_id,
        name: station.name,
        location: {
          lat: station.latitude,
          lng: station.longitude,
          elevationM: station.elevation_m,
        },
        type: station.station_type,
      },
      observation: obs
        ? {
          measuredAt: obs.measured_at,
          temperatureC: obs.temperature_c,
          humidityPct: obs.humidity_pct,
          precipitationMm: obs.precipitation_mm,
          windSpeedMs: obs.wind_speed_ms,
          windDirectionDeg: obs.wind_direction_deg,
          windDirectionCode: obs.wind_direction_code,
          windGustMs: obs.wind_gust_ms,
          pressureHpa: obs.pressure_hpa,
          solarRadiationWm2: obs.solar_radiation_wm2,
          weather: {
            code: obs.weather_code,
            description: obs.weather_description,
          },
          sourceStatus: obs.source_status,
        }
        : null,
      meta: {
        source: "ZHMS",
        fetchedAt: obs?.fetched_at ?? null,
        status: obs?.source_status ?? "missing",
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
