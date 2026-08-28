/**
 * AwsLatestAdapter
 * Source: https://www.meteo.co.me/Meteorologija/aws_m.php
 *
 * Live structure (verified 2026-08-28):
 *   posljednje = { "glavna": [[id,type,name,datetime,temp,rr,ws,wdir,gust], ...], ... }
 *   stanice    = [[id, wmo, lat, lon, elev, name, type, active], ...]
 *
 * TLS: ZHMS uses Let's Encrypt YE1 intermediate; Deno Edge CA store may not
 * include Root YE yet — we pass explicit caCerts.
 */

import type {
  AdapterResult,
  NormalizedObservation,
  NormalizedStation,
} from "./types.ts";

import { CA_CERTS } from "./caCerts.ts";

const DEFAULT_URL = "https://www.meteo.co.me/Meteorologija/aws_m.php";

function getHttpClient(): Deno.HttpClient {
  return Deno.createHttpClient({ caCerts: CA_CERTS });
}

/** Parse "DD.MM.YYYY HH:mm" as Europe/Podgorica local → UTC ISO string. */
export function parseLocalMeasuredAt(local: string): string | null {
  const m = local.trim().match(
    /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/,
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const month = Number(mm);
  const offsetHours = month >= 4 && month <= 10 ? 2 : 1; // CEST vs CET
  const utcMs = Date.UTC(
    Number(yyyy),
    month - 1,
    Number(dd),
    Number(hh) - offsetHours,
    Number(min),
  );
  if (Number.isNaN(utcMs)) return null;
  return new Date(utcMs).toISOString();
}

function emptyToNullNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (Number.isNaN(n)) return null;
  return n;
}

function emptyToNullInt(v: unknown): number | null {
  const n = emptyToNullNumber(v);
  if (n === null) return null;
  return Math.round(n);
}

function parseWmo(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (v.trim() === "" || v.trim() === "-")) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function extractJsValue(html: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*`);
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const first = html[start];
  if (first !== "{" && first !== "[") return null;
  const open = first;
  const close = first === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function fetchAndParseAwsLatest(
  baseUrl?: string,
): Promise<AdapterResult> {
  const envBase = Deno.env.get("ZHMS_BASE_URL");
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/Meteorologija/aws_m.php`
    : envBase
    ? `${envBase.replace(/\/$/, "")}/Meteorologija/aws_m.php`
    : DEFAULT_URL;

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

  if (!res.ok) {
    throw new Error(`ZHMS fetch failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  if (!html || html.length < 500) {
    throw new Error("ZHMS response too short / empty");
  }

  const posljednjeRaw = extractJsValue(html, "posljednje");
  const staniceRaw = extractJsValue(html, "stanice");
  if (!posljednjeRaw || !staniceRaw) {
    throw new Error("Could not find posljednje or stanice in ZHMS HTML");
  }

  const posljednje = new Function(`return (${posljednjeRaw})`)() as Record<
    string,
    unknown[][]
  >;
  const stanice = new Function(`return (${staniceRaw})`)() as unknown[][];

  if (!stanice || !Array.isArray(stanice) || stanice.length < 5) {
    throw new Error(`Too few stations in stanice[]: ${stanice?.length ?? 0}`);
  }

  const stations: NormalizedStation[] = [];
  for (const row of stanice) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const stationId = String(row[0] ?? "").trim();
    if (!stationId) continue;
    stations.push({
      stationId,
      wmoId: parseWmo(row[1]),
      latitude: emptyToNullNumber(row[2]),
      longitude: emptyToNullNumber(row[3]),
      elevationM: emptyToNullNumber(row[4]),
      name: String(row[5] ?? stationId),
      stationType: String(row[6] ?? "unknown"),
      active: row[7] === 1 || row[7] === "1" || row[7] === true,
    });
  }

  const observations: NormalizedObservation[] = [];
  for (const key of Object.keys(posljednje)) {
    const group = posljednje[key];
    if (!Array.isArray(group)) continue;
    for (const row of group) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const stationId = String(row[0] ?? "").trim();
      if (!stationId) continue;
      const measuredAt = parseLocalMeasuredAt(String(row[3] ?? ""));
      if (!measuredAt) continue;

      const temperatureC = emptyToNullNumber(row[4]);
      if (temperatureC !== null && (temperatureC < -45 || temperatureC > 55)) {
        continue;
      }

      observations.push({
        stationId,
        measuredAt,
        temperatureC,
        precipitationMm: emptyToNullNumber(row[5]),
        windSpeedMs: emptyToNullNumber(row[6]),
        windDirectionCode: emptyToNullInt(row[7]),
        windGustMs: emptyToNullNumber(row[8]),
      });
    }
  }

  if (observations.length < 3) {
    throw new Error(`Too few observations: ${observations.length}`);
  }

  const sourceHash = simpleHash(posljednjeRaw + "|" + staniceRaw);

  return { stations, observations, sourceHash, fetchedAt };
}
