/**
 * POST /functions/v1/sync-aws-graph?station_id=02PDGR10
 * or body: { "station_id": "02PDGR10" }
 * Fetches aws-graph for one station; updates humidity/pressure/solar on current;
 * upserts observation_history points.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAndParseAwsGraph } from "../_shared/awsGraph.ts";

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

    const url = new URL(req.url);
    let stationId = url.searchParams.get("station_id")?.trim() ?? "";
    if (!stationId && req.method === "POST") {
      try {
        const body = await req.json();
        stationId = String(body?.station_id ?? "").trim();
      } catch {
        /* empty body ok */
      }
    }
    if (!stationId) {
      return new Response(
        JSON.stringify({ error: "Missing station_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: station, error: stErr } = await supabase
      .from("stations")
      .select("station_id, name, station_type")
      .eq("station_id", stationId)
      .maybeSingle();

    if (stErr) throw new Error(stErr.message);
    if (!station) {
      return new Response(JSON.stringify({ error: "Station not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceKey = `aws_graph:${stationId}`;
    await supabase.from("sync_status").upsert({
      source_key: sourceKey,
      status: "running",
      last_attempt_at: startedAt,
      last_check_at: startedAt,
    });

    const result = await fetchAndParseAwsGraph({
      stationId: station.station_id,
      stationType: station.station_type,
      name: station.name,
    });

    const ingestedAt = new Date().toISOString();

    // Merge latest graph fields into current_observations (keep measured_at from graph latest if present)
    const patch: Record<string, unknown> = {
      station_id: stationId,
      humidity_pct: result.latest.humidityPct,
      pressure_hpa: result.latest.pressureHpa,
      solar_radiation_wm2: result.latest.solarRadiationWm2,
      fetched_at: result.fetchedAt,
      ingested_at: ingestedAt,
      updated_at: ingestedAt,
      source_status: "ok",
    };
    if (result.latest.temperatureC != null) {
      patch.temperature_c = result.latest.temperatureC;
    }
    if (result.latest.precipitationMm != null) {
      patch.precipitation_mm = result.latest.precipitationMm;
    }
    if (result.latest.windSpeedMs != null) {
      patch.wind_speed_ms = result.latest.windSpeedMs;
    }
    if (result.latest.windGustMs != null) {
      patch.wind_gust_ms = result.latest.windGustMs;
    }
    if (result.latest.measuredAt) {
      patch.measured_at = result.latest.measuredAt;
    }

    // Upsert requires measured_at NOT NULL — fetch existing if graph has no times
    if (!patch.measured_at) {
      const { data: cur } = await supabase
        .from("current_observations")
        .select("measured_at")
        .eq("station_id", stationId)
        .maybeSingle();
      patch.measured_at = cur?.measured_at ?? result.fetchedAt;
    }

    const { error: curErr } = await supabase
      .from("current_observations")
      .upsert(patch, { onConflict: "station_id" });
    if (curErr) throw new Error(`current upsert: ${curErr.message}`);

    // History: batch upsert (chunk if large)
    const histRows = result.history.map((h) => ({
      station_id: stationId,
      measured_at: h.measuredAt,
      temperature_c: h.temperatureC,
      humidity_pct: h.humidityPct,
      precipitation_mm: h.precipitationMm,
      wind_speed_ms: h.windSpeedMs,
      wind_gust_ms: h.windGustMs,
      pressure_hpa: h.pressureHpa,
      solar_radiation_wm2: h.solarRadiationWm2,
      source: "aws_graph",
      fetched_at: result.fetchedAt,
    }));

    const chunk = 80;
    let written = 0;
    for (let i = 0; i < histRows.length; i += chunk) {
      const slice = histRows.slice(i, i + chunk);
      const { error: hErr } = await supabase
        .from("observation_history")
        .upsert(slice, { onConflict: "station_id,measured_at,source" });
      if (hErr) throw new Error(`history upsert: ${hErr.message}`);
      written += slice.length;
    }

    await supabase.from("sync_status").upsert({
      source_key: sourceKey,
      status: "ok",
      last_attempt_at: startedAt,
      last_success_at: ingestedAt,
      last_source_hash: result.sourceHash,
      last_fetched_at: result.fetchedAt,
      last_check_at: startedAt,
      last_error: null,
      rows_written: written,
      consecutive_failures: 0,
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        stationId,
        historyPoints: written,
        latest: result.latest,
        fetchedAt: result.fetchedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-aws-graph:", message);
    return new Response(JSON.stringify({ status: "error", error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
