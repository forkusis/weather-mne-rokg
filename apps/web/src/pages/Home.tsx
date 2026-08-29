import { useMemo, useState } from "react";
import type { Station } from "../lib/types";
import { fmtNum, fmtTime, windDirText } from "../lib/format";

type Props = {
  stations: Station[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function Home({ stations, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...stations].sort((a, b) => a.name.localeCompare(b.name, "sr")),
    [stations],
  );

  const station = stations.find((s) => s.id === selectedId) ?? sorted[0];
  const o = station?.observation;

  if (!station) {
    return <p className="empty">Nema stanica u API-ju.</p>;
  }

  return (
    <div className="page-home">
      <div className="picker-wrap">
        <button
          type="button"
          className="picker"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="picker-text">
            <span className="picker-label">Odabrana stanica</span>
            <span className="picker-name">{station.name}</span>
          </div>
          <span className={`picker-chevron${open ? " open" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div className="picker-menu" role="listbox">
            {sorted.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                className={
                  s.id === station.id ? "picker-option active" : "picker-option"
                }
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
              >
                <span>{s.name}</span>
                <span className="picker-option-meta">{s.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="current-card">
        <div className="current-top">
          <div>
            <p className="current-temp">
              {o?.temperatureC != null ? (
                <>
                  {o.temperatureC.toFixed(1)}
                  <span className="current-deg">°</span>
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </p>
            <p className="current-sub">Trenutno merenje · {station.type}</p>
          </div>
          <div className="current-time">{fmtTime(o?.measuredAt)}</div>
        </div>

        <div className="param-grid">
          <Param label="Vlaga" value={fmtNum(o?.humidityPct, 0, "%")} />
          <Param
            label="Vetar"
            value={
              o?.windSpeedMs != null
                ? `${fmtNum(o.windSpeedMs, 1, " m/s")} ${windDirText(o.windDirectionCode)}`.trim()
                : "—"
            }
          />
          <Param label="Pritisak" value={fmtNum(o?.pressureHpa, 1, " hPa")} />
          <Param label="Padavine" value={fmtNum(o?.precipitationMm, 1, " mm")} />
          <Param label="Udar" value={fmtNum(o?.windGustMs, 1, " m/s")} />
          <Param
            label="Insolacija"
            value={fmtNum(o?.solarRadiationWm2, 0, " W/m²")}
          />
        </div>

        {station.location.elevationM != null && (
          <p className="current-elev">{station.location.elevationM} m n.v.</p>
        )}
      </section>

      <section className="chart-placeholder">
        <p className="section-kicker">Istorija 24 h</p>
        <p className="empty-soft">
          Grafikon temperature i vlage biće ovde čim povežemo istoriju iz
          baze (podaci se već skupljaju).
        </p>
      </section>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="param">
      <span className="param-label">{label}</span>
      <span className="param-value">{value}</span>
    </div>
  );
}
