import { useEffect, useState } from "react";
import "./App.css";

type Observation = {
  measuredAt: string | null;
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
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
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Temp({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <span className="temp">
      {value.toFixed(1)}
      <span className="unit">°C</span>
    </span>
  );
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
  const glavne = stations.filter((s) => s.type === "glavna");

  return (
    <div className="app">
      <header className="header">
        <h1>Weather MNE</h1>
        <p className="subtitle">Podaci preko internog API-ja · ZHMS / meteo.co.me</p>
      </header>

      {loading && <p className="status">Učitavanje…</p>}
      {error && <p className="error">Greška: {error}</p>}

      {!loading && !error && podgorica && (
        <section className="hero-card">
          <div className="hero-top">
            <h2>{podgorica.name}</h2>
            <span className="badge">{podgorica.type}</span>
          </div>
          <div className="hero-temp">
            <Temp value={podgorica.observation?.temperatureC} />
          </div>
          <div className="hero-meta">
            <div>
              <span className="label">Vetar</span>
              <span>
                {podgorica.observation?.windSpeedMs != null
                  ? `${podgorica.observation.windSpeedMs} m/s`
                  : "—"}
                {podgorica.observation?.windGustMs != null
                  ? ` (udar ${podgorica.observation.windGustMs})`
                  : ""}
              </span>
            </div>
            <div>
              <span className="label">Padavine</span>
              <span>
                {podgorica.observation?.precipitationMm != null
                  ? `${podgorica.observation.precipitationMm} mm`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="label">Merenje</span>
              <span>{formatTime(podgorica.observation?.measuredAt)}</span>
            </div>
          </div>
        </section>
      )}

      {!loading && !error && (
        <section className="list-section">
          <h3>Glavne stanice</h3>
          <ul className="station-list">
            {glavne.map((s) => (
              <li key={s.id} className="station-row">
                <span className="name">{s.name}</span>
                <Temp value={s.observation?.temperatureC} />
              </li>
            ))}
          </ul>
          <p className="footnote">Ukupno stanica u API-ju: {stations.length}</p>
        </section>
      )}
    </div>
  );
}
