import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { fetchStations } from "./lib/api";
import type { Station } from "./lib/types";
import { Forecast } from "./pages/Forecast";
import { Home } from "./pages/Home";
import { Stations } from "./pages/Stations";
import "./App.css";

const STORAGE_KEY = "meteo-cg-selected-station";
const DEFAULT_STATION = "02PDGR10";

export default function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_STATION;
    } catch {
      return DEFAULT_STATION;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchStations();
        if (cancelled) return;
        setStations(list);
        setError(null);
        if (!list.some((s) => s.id === selectedId) && list[0]) {
          setSelectedId(list[0].id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSelect(id: string) {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="boot">
        <p className="boot-title">Meteo CG</p>
        <p className="boot-sub">Učitavanje merenja…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="boot">
        <p className="boot-title">Greška</p>
        <p className="boot-sub">{error}</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="app-title">Meteo CG</p>
            <p className="app-tag">ZHMS · interno</p>
          </div>
        </header>

        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  stations={stations}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              }
            />
            <Route
              path="/stanice"
              element={<Stations stations={stations} onSelect={onSelect} />}
            />
            <Route path="/prognoza" element={<Forecast />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
