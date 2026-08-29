import { useEffect, useState } from "react";
import "./App.css";

type Observation = {
  measuredAt: string | null;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  pressureHpa: number | null;
  solarRadiationWm2: number | null;
  sourceStatus?: string;
};

type Station = {
  id: string;
  name: string;
  type: string;
  location: { lat: number | null; lng: number | null; elevationM: number | null };
  observation: Observation | null;
};

const API_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function fetchStations(): Promise<Station[]> {
  const res = await fetch(`${API_BASE}/functions/v1/api-stations`, {
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.stations as Station[];
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("sr-ME", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmt(
  value: number | null | undefined,
  digits = 0,
  suffix = "",
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export default function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!API_BASE || !ANON_KEY || ANON_KEY.includes("your_anon")) {
          throw new Error("Podesi VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY u .env.local");
        }
        const list = await fetchStations();
        if (!cancelled) {
          setStations(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const podgorica = stations.find((s) => s.id === "02PDGR10");
  const glavne = stations
    .filter((s) => s.type === "glavna")
    .sort((a, b) => a.name.localeCompare(b.name, "sr"));

  const o = podgorica?.observation;

  return (
    <div className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <div className="brand-mark">Meteo CG</div>
            <p className="brand-sub">Automatska mreža</p>
          </div>
          <div className="live-pill">
            <span className="live-dot" aria-hidden />
            Uživo
          </div>
        </header>

        {loading && <p className="status">Učitavanje merenja…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && podgorica && (
          <section className="hero" aria-label="Podgorica">
            <div className="hero-head">
              <div>
                <h1 className="hero-place">{podgorica.name}</h1>
                {podgorica.location.elevationM != null && (
                  <p className="hero-elev">
                    {podgorica.location.elevationM} m n.v.
                  </p>
                )}
              </div>
              <span className="type-chip">{podgorica.type}</span>
            </div>

            <div className="hero-temp-row">
              <div className="hero-temp">
                {o?.temperatureC != null ? (
                  <>
                    {o.temperatureC.toFixed(1)}
                    <span>°</span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
              <div className="hero-temp-aside">
                {o?.humidityPct != null
                  ? `Vlažnost ${fmt(o.humidityPct, 0, "%")}`
                  : "Vlažnost —"}
              </div>
            </div>

            <div className="metrics">
              <div className="metric">
                <span className="metric-label">Vetar</span>
                <div className="metric-value">
                  {fmt(o?.windSpeedMs, 1, " m/s")}
                  {o?.windGustMs != null && (
                    <span className="dim"> · udar {fmt(o.windGustMs, 1)}</span>
                  )}
                </div>
              </div>
              <div className="metric">
                <span className="metric-label">Pritisak</span>
                <div className="metric-value">
                  {o?.pressureHpa != null
                    ? fmt(o.pressureHpa, 1, " hPa")
                    : "—"}
                </div>
              </div>
              <div className="metric">
                <span className="metric-label">Padavine</span>
                <div className="metric-value">
                  {fmt(o?.precipitationMm, 1, " mm")}
                </div>
              </div>
              <div className="metric">
                <span className="metric-label">Insolacija</span>
                <div className="metric-value">
                  {o?.solarRadiationWm2 != null
                    ? fmt(o.solarRadiationWm2, 0, " W/m²")
                    : "—"}
                </div>
              </div>
            </div>

            <div className="hero-foot">
              <span>Merenje {formatTime(o?.measuredAt)}</span>
              <span>ZHMS · interno</span>
            </div>
          </section>
        )}

        {!loading && !error && (
          <section>
            <h2 className="section-label">Glavne stanice</h2>
            <ul className="station-list">
              {glavne.map((s) => (
                <li key={s.id} className="station-row">
                  <div>
                    <div className="station-name">{s.name}</div>
                    <div className="station-meta">
                      {s.location.elevationM != null && (
                        <span>{s.location.elevationM} m</span>
                      )}
                      {s.observation?.measuredAt && (
                        <span>{formatTime(s.observation.measuredAt)}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="station-temp">
                      {s.observation?.temperatureC != null ? (
                        <>
                          {s.observation.temperatureC.toFixed(1)}
                          <span>°</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                    {s.observation?.humidityPct != null && (
                      <span className="station-hum">
                        {fmt(s.observation.humidityPct, 0, "%")} RH
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="footnote">
              {stations.length} stanica u mreži · podaci iz internog API-ja
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
