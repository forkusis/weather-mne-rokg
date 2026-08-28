/**
 * GET /functions/v1/api-stations
 * Returns all active stations with latest observation (canonical JSON).
 * Public read via anon key (RLS allows SELECT).
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey);

    const { data: stations, error: stErr } = await supabase
      .from("stations")
      .select(
        "station_id, wmo_id, name, latitude, longitude, elevation_m, station_type, active",
      )
      .eq("active", true)
      .order("name");

    if (stErr) throw new Error(stErr.message);

    const { data: observations, error: obsErr } = await supabase
      .from("current_observations")
      .select(
        "station_id, measured_at, temperature_c, precipitation_mm, wind_speed_ms, wind_direction_code, wind_gust_ms, source_status",
      );

    if (obsErr) throw new Error(obsErr.message);

    const obsById = new Map(
      (observations ?? []).map((o) => [o.station_id, o]),
    );

    const payload = {
      stations: (stations ?? []).map((s) => {
        const o = obsById.get(s.station_id);
        return {
          id: s.station_id,
          wmoId: s.wmo_id,
          name: s.name,
          location: {
            lat: s.latitude,
            lng: s.longitude,
            elevationM: s.elevation_m,
          },
          type: s.station_type,
          observation: o
            ? {
              measuredAt: o.measured_at,
              temperatureC: o.temperature_c,
              precipitationMm: o.precipitation_mm,
              windSpeedMs: o.wind_speed_ms,
              windDirectionCode: o.wind_direction_code,
              windGustMs: o.wind_gust_ms,
              sourceStatus: o.source_status,
            }
            : null,
        };
      }),
      meta: {
        source: "internal",
        fetchedAt: new Date().toISOString(),
        count: stations?.length ?? 0,
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
