/**
 * sync-aws-current
 * Fetches ZHMS aws_m.php → normalize → upsert.
 * Same source_hash → no heavy write (SLA-friendly poll).
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

    await supabase.from("sync_status").upsert({
      source_key: "aws_current",
      status: "running",
      last_attempt_at: startedAt,
      last_check_at: startedAt,
    });

    const result = await fetchAndParseAwsLatest();
    const fetchedAt = result.fetchedAt;

    const { data: prev } = await supabase
      .from("sync_status")
      .select("last_source_hash, last_source_updated_at")
      .eq("source_key", "aws_current")
      .maybeSingle();

    const hashUnchanged =
      prev?.last_source_hash && prev.last_source_hash === result.sourceHash;

    if (hashUnchanged) {
      await supabase.from("sync_status").upsert({
        source_key: "aws_current",
        status: "ok",
        last_attempt_at: startedAt,
        last_check_at: startedAt,
        last_fetched_at: fetchedAt,
        last_error: null,
        consecutive_failures: 0,
      });

      return new Response(
        JSON.stringify({
          status: "ok",
          skipped: true,
          reason: "unchanged_hash",
          sourceHash: result.sourceHash,
          fetchedAt,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sourceUpdatedAt = fetchedAt;
    const ingestedAt = new Date().toISOString();

    const stationRows = result.stations.map((s) => ({
      station_id: s.stationId,
      wmo_id: s.wmoId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      elevation_m: s.elevationM,
      station_type: s.stationType,
      active: s.active,
      source_updated_at: sourceUpdatedAt,
      updated_at: ingestedAt,
    }));

    const { error: stErr } = await supabase
      .from("stations")
      .upsert(stationRows, { onConflict: "station_id" });
    if (stErr) throw new Error(`stations upsert: ${stErr.message}`);

    const stationIds = new Set(result.stations.map((s) => s.stationId));
    const obsRows = result.observations
      .filter((o) => stationIds.has(o.stationId))
      .map((o) => ({
        station_id: o.stationId,
        measured_at: o.measuredAt,
        fetched_at: fetchedAt,
        source_updated_at: sourceUpdatedAt,
        ingested_at: ingestedAt,
        temperature_c: o.temperatureC,
        precipitation_mm: o.precipitationMm,
        wind_speed_ms: o.windSpeedMs,
        wind_direction_code: o.windDirectionCode,
        wind_gust_ms: o.windGustMs,
        source_status: "ok",
        raw_hash: result.sourceHash,
        updated_at: ingestedAt,
      }));

    const { error: obsErr } = await supabase
      .from("current_observations")
      .upsert(obsRows, { onConflict: "station_id" });
    if (obsErr) throw new Error(`observations upsert: ${obsErr.message}`);

    const lagSec = Math.max(
      0,
      Math.round(
        (new Date(fetchedAt).getTime() - new Date(sourceUpdatedAt).getTime()) /
          1000,
      ),
    );

    await supabase.from("sync_status").upsert({
      source_key: "aws_current",
      status: "ok",
      last_attempt_at: startedAt,
      last_success_at: ingestedAt,
      last_source_hash: result.sourceHash,
      last_source_updated_at: sourceUpdatedAt,
      last_fetched_at: fetchedAt,
      last_check_at: startedAt,
      last_ingest_lag_seconds: lagSec,
      last_error: null,
      rows_written: obsRows.length,
      consecutive_failures: 0,
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        skipped: false,
        stations: stationRows.length,
        observations: obsRows.length,
        sourceHash: result.sourceHash,
        fetchedAt,
        sourceUpdatedAt,
        ingestLagSeconds: lagSec,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-aws-current error:", message);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: prev } = await supabase
          .from("sync_status")
          .select("consecutive_failures")
          .eq("source_key", "aws_current")
          .maybeSingle();
        const fails = (prev?.consecutive_failures ?? 0) + 1;
        await supabase.from("sync_status").upsert({
          source_key: "aws_current",
          status: "error",
          last_attempt_at: startedAt,
          last_check_at: startedAt,
          last_error: message.slice(0, 1000),
          consecutive_failures: fails,
        });
      }
    } catch {
      /* ignore */
    }

    return new Response(JSON.stringify({ status: "error", error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
