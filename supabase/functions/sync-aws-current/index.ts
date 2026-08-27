/**
 * sync-aws-current
 * Fetches ZHMS aws_m.php → normalize → upsert stations + current_observations.
 * On any failure: leaves existing current data intact, records error in sync_status.
 *
 * Auth: call with Authorization: Bearer <SERVICE_ROLE_KEY>
 * Optional: header x-cron-secret must match CRON_SECRET env if set.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAndParseAwsLatest } from "../_shared/awsLatest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    // Optional cron secret protection
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const provided = req.headers.get("x-cron-secret");
      if (provided !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Mark running
    await supabase.from("sync_status").upsert({
      source_key: "aws_current",
      status: "running",
      last_attempt_at: startedAt,
    });

    const result = await fetchAndParseAwsLatest();

    // Upsert stations
    const stationRows = result.stations.map((s) => ({
      station_id: s.stationId,
      wmo_id: s.wmoId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      elevation_m: s.elevationM,
      station_type: s.stationType,
      active: s.active,
      source_updated_at: result.fetchedAt,
      updated_at: result.fetchedAt,
    }));

    const { error: stErr } = await supabase
      .from("stations")
      .upsert(stationRows, { onConflict: "station_id" });
    if (stErr) throw new Error(`stations upsert: ${stErr.message}`);

    // Upsert current observations (only stations we know)
    const stationIds = new Set(result.stations.map((s) => s.stationId));
    const obsRows = result.observations
      .filter((o) => stationIds.has(o.stationId))
      .map((o) => ({
        station_id: o.stationId,
        measured_at: o.measuredAt,
        fetched_at: result.fetchedAt,
        temperature_c: o.temperatureC,
        precipitation_mm: o.precipitationMm,
        wind_speed_ms: o.windSpeedMs,
        wind_direction_code: o.windDirectionCode,
        wind_gust_ms: o.windGustMs,
        source_status: "ok",
        raw_hash: result.sourceHash,
        updated_at: result.fetchedAt,
      }));

    const { error: obsErr } = await supabase
      .from("current_observations")
      .upsert(obsRows, { onConflict: "station_id" });
    if (obsErr) throw new Error(`observations upsert: ${obsErr.message}`);

    await supabase.from("sync_status").upsert({
      source_key: "aws_current",
      status: "ok",
      last_attempt_at: startedAt,
      last_success_at: new Date().toISOString(),
      last_source_hash: result.sourceHash,
      last_error: null,
      rows_written: obsRows.length,
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        stations: stationRows.length,
        observations: obsRows.length,
        sourceHash: result.sourceHash,
        fetchedAt: result.fetchedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-aws-current error:", message);

    // Best-effort: record error without wiping current data
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("sync_status").upsert({
          source_key: "aws_current",
          status: "error",
          last_attempt_at: startedAt,
          last_error: message.slice(0, 1000),
        });
      }
    } catch {
      /* ignore secondary failure */
    }

    return new Response(JSON.stringify({ status: "error", error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
