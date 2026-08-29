/**
 * POST /functions/v1/sync-aws-graph-batch
 * Picks stations due for graph sync by type interval, processes up to MAX_PER_RUN.
 * Intervals (minutes): glavna 10, klimatološka 30, padavinska 60, other 30.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAndParseAwsGraph } from "../_shared/awsGraph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_PER_RUN = 4;

function intervalMinutes(stationType: string): number {
  const t = (stationType || "").toLowerCase();
  if (t.includes("glavn")) return 10;
  if (t.includes("padav")) return 60;
  if (t.includes("klimat")) return 30;
  return 30;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: stations, error: stErr } = await supabase
      .from("stations")
      .select("station_id, name, station_type, active")
      .eq("active", true)
      .order("station_type")
      .order("station_id");

    if (stErr) throw new Error(stErr.message);
    if (!stations?.length) {
      return new Response(JSON.stringify({ status: "ok", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: statuses } = await supabase
      .from("sync_status")
      .select("source_key, last_success_at, status")
      .like("source_key", "aws_graph:%");

    const lastOk = new Map<string, string>();
    for (const s of statuses ?? []) {
      const id = String(s.source_key).replace(/^aws_graph:/, "");
      if (s.last_success_at) lastOk.set(id, s.last_success_at);
    }

    const now = Date.now();
    const due = stations.filter((st) => {
      const mins = intervalMinutes(st.station_type);
      const last = lastOk.get(st.station_id);
      if (!last) return true;
      const ageMin = (now - new Date(last).getTime()) / 60000;
      return ageMin >= mins;
    });

    // Prefer glavna first
    due.sort((a, b) => {
      const pa = intervalMinutes(a.station_type);
      const pb = intervalMinutes(b.station_type);
      if (pa !== pb) return pa - pb;
      return a.station_id.localeCompare(b.station_id);
    });

    const batch = due.slice(0, MAX_PER_RUN);

    for (let i = 0; i < batch.length; i++) {
      const station = batch[i]!;
      const sourceKey = `aws_graph:${station.station_id}`;

      try {
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

        const patch: Record<string, unknown> = {
          station_id: station.station_id,
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
        } else {
          const { data: cur } = await supabase
            .from("current_observations")
            .select("measured_at")
            .eq("station_id", station.station_id)
            .maybeSingle();
          patch.measured_at = cur?.measured_at ?? result.fetchedAt;
        }

        const { error: curErr } = await supabase
          .from("current_observations")
          .upsert(patch, { onConflict: "station_id" });
        if (curErr) throw new Error(curErr.message);

        const histRows = result.history.map((h) => ({
          station_id: station.station_id,
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

        for (let j = 0; j < histRows.length; j += 80) {
          const slice = histRows.slice(j, j + 80);
          const { error: hErr } = await supabase
            .from("observation_history")
            .upsert(slice, { onConflict: "station_id,measured_at,source" });
          if (hErr) throw new Error(hErr.message);
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
          rows_written: histRows.length,
          consecutive_failures: 0,
        });

        results.push({
          stationId: station.station_id,
          status: "ok",
          historyPoints: histRows.length,
          humidityPct: result.latest.humidityPct,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await supabase.from("sync_status").upsert({
          source_key: sourceKey,
          status: "error",
          last_attempt_at: startedAt,
          last_check_at: startedAt,
          last_error: message.slice(0, 1000),
        });
        results.push({
          stationId: station.station_id,
          status: "error",
          error: message,
        });
      }

      // Pause between stations — gentle on ZHMS
      if (i < batch.length - 1) await sleep(1500);
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        due: due.length,
        processed: results.length,
        results,
        startedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ status: "error", error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
