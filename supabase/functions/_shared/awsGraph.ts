/**
 * AwsGraphAdapter
 * https://www.meteo.co.me/Meteorologija/aws-graph.php?v={type}&s={id}&name={name}&p=&d=
 * DataAll = { G1:{RR,T,H}, G2:{BRV,PRV,MUV}, G3:{GR,P} } as [ms, value][] UTC
 */

import { CA_CERTS } from "./caCerts.ts";
import { parseJsLiteral } from "./safeJsLiteral.ts";

export type GraphSeriesPoint = { measuredAt: string; value: number | null };

export type GraphResult = {
  stationId: string;
  fetchedAt: string;
  sourceHash: string;
  /** Latest values for current_observations */
  latest: {
    temperatureC: number | null;
    humidityPct: number | null;
    precipitationMm: number | null;
    windSpeedMs: number | null;
    windGustMs: number | null;
    pressureHpa: number | null;
    solarRadiationWm2: number | null;
    measuredAt: string | null;
  };
  /** Full series for history (aligned by timestamp where possible) */
  history: Array<{
    measuredAt: string;
    temperatureC: number | null;
    humidityPct: number | null;
    precipitationMm: number | null;
    windSpeedMs: number | null;
    windGustMs: number | null;
    pressureHpa: number | null;
    solarRadiationWm2: number | null;
  }>;
};

function getHttpClient(): Deno.HttpClient {
  return Deno.createHttpClient({ caCerts: CA_CERTS });
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** ZHMS uses unquoted keys: G1:{RR:[...]} — quote them for safe parser. */
function quoteJsKeys(raw: string): string {
  return raw.replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
}

function extractDataAll(html: string): string | null {
  const m = /\bDataAll\s*=\s*/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  if (html[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function parseSeries(arr: unknown): Map<number, number | null> {
  const map = new Map<number, number | null>();
  if (!Array.isArray(arr)) return map;
  for (const row of arr) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ms = Number(row[0]);
    if (Number.isNaN(ms)) continue;
    const v = row[1];
    if (v === "" || v === null || v === undefined) {
      map.set(ms, null);
    } else {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      map.set(ms, Number.isNaN(n) ? null : n);
    }
  }
  return map;
}

function lastValue(map: Map<number, number | null>): {
  ms: number | null;
  value: number | null;
} {
  let bestMs: number | null = null;
  let bestVal: number | null = null;
  for (const [ms, val] of map) {
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestVal = val;
    }
  }
  return { ms: bestMs, value: bestVal };
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export async function fetchAndParseAwsGraph(opts: {
  stationId: string;
  stationType: string;
  name: string;
}): Promise<GraphResult> {
  const base =
    Deno.env.get("ZHMS_BASE_URL")?.replace(/\/$/, "") ??
    "https://www.meteo.co.me";
  const params = new URLSearchParams({
    v: opts.stationType,
    s: opts.stationId,
    name: opts.name,
    p: "",
    d: "",
  });
  const url = `${base}/Meteorologija/aws-graph.php?${params}`;

  const fetchedAt = new Date().toISOString();
  const client = getHttpClient();
  let res: Response;
  try {
    res = await fetch(url, {
      client,
      headers: {
        "User-Agent":
          "weather-mne-rokg/1.0 (personal weather app; github.com/forkusis)",
        Accept: "text/html",
      },
    });
  } finally {
    client.close();
  }

  if (!res.ok) throw new Error(`graph HTTP ${res.status} for ${opts.stationId}`);
  const html = await res.text();
  if (html.length < 200) throw new Error("graph response too short");

  const dataRaw = extractDataAll(html);
  if (!dataRaw) throw new Error("DataAll not found");

  const quoted = quoteJsKeys(dataRaw);
  const data = parseJsLiteral(quoted) as {
    G1?: Record<string, unknown>;
    G2?: Record<string, unknown>;
    G3?: Record<string, unknown>;
  };

  const T = parseSeries(data.G1?.T);
  const H = parseSeries(data.G1?.H);
  const RR = parseSeries(data.G1?.RR);
  const BRV = parseSeries(data.G2?.BRV);
  const MUV = parseSeries(data.G2?.MUV);
  const GR = parseSeries(data.G3?.GR);
  const P = parseSeries(data.G3?.P);

  const allMs = new Set<number>([
    ...T.keys(),
    ...H.keys(),
    ...RR.keys(),
    ...BRV.keys(),
    ...MUV.keys(),
    ...GR.keys(),
    ...P.keys(),
  ]);
  const sortedMs = [...allMs].sort((a, b) => a - b);

  const history = sortedMs.map((ms) => ({
    measuredAt: msToIso(ms),
    temperatureC: T.get(ms) ?? null,
    humidityPct: H.get(ms) ?? null,
    precipitationMm: RR.get(ms) ?? null,
    windSpeedMs: BRV.get(ms) ?? null,
    windGustMs: MUV.get(ms) ?? null,
    pressureHpa: P.get(ms) ?? null,
    solarRadiationWm2: GR.get(ms) ?? null,
  }));

  const tL = lastValue(T);
  const hL = lastValue(H);
  const rrL = lastValue(RR);
  const brvL = lastValue(BRV);
  const muvL = lastValue(MUV);
  const grL = lastValue(GR);
  const pL = lastValue(P);

  const latestMs = Math.max(
    tL.ms ?? 0,
    hL.ms ?? 0,
    rrL.ms ?? 0,
    brvL.ms ?? 0,
    pL.ms ?? 0,
    grL.ms ?? 0,
  );

  return {
    stationId: opts.stationId,
    fetchedAt,
    sourceHash: simpleHash(dataRaw),
    latest: {
      temperatureC: tL.value,
      humidityPct: hL.value,
      precipitationMm: rrL.value,
      windSpeedMs: brvL.value,
      windGustMs: muvL.value,
      pressureHpa: pL.value,
      solarRadiationWm2: grL.value,
      measuredAt: latestMs > 0 ? msToIso(latestMs) : null,
    },
    history,
  };
}
