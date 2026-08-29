import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Station } from "../lib/types";
import { fmtNum, fmtTime } from "../lib/format";

type Props = {
  stations: Station[];
  onSelect: (id: string) => void;
};

export function Stations({ stations, onSelect }: Props) {
  const navigate = useNavigate();

  const sorted = useMemo(
    () => [...stations].sort((a, b) => a.name.localeCompare(b.name, "sr")),
    [stations],
  );

  const glavne = sorted.filter((s) => s.type === "glavna");
  const ostale = sorted.filter((s) => s.type !== "glavna");

  function openStation(id: string) {
    onSelect(id);
    navigate("/");
  }

  return (
    <div className="page-stations">
      <p className="section-kicker">Glavne</p>
      <ul className="st-list">
        {glavne.map((s) => (
          <StationRow key={s.id} station={s} onOpen={openStation} />
        ))}
      </ul>

      <p className="section-kicker" style={{ marginTop: "1.25rem" }}>
        Ostale ({ostale.length})
      </p>
      <ul className="st-list">
        {ostale.map((s) => (
          <StationRow key={s.id} station={s} onOpen={openStation} />
        ))}
      </ul>
    </div>
  );
}

function StationRow({
  station: s,
  onOpen,
}: {
  station: Station;
  onOpen: (id: string) => void;
}) {
  const o = s.observation;
  return (
    <li>
      <button type="button" className="st-row" onClick={() => onOpen(s.id)}>
        <div className="st-left">
          <span className="st-name">{s.name}</span>
          <span className="st-meta">
            {s.type}
            {s.location.elevationM != null ? ` · ${s.location.elevationM} m` : ""}
            {o?.measuredAt ? ` · ${fmtTime(o.measuredAt)}` : ""}
          </span>
        </div>
        <div className="st-right">
          <span className="st-temp">
            {o?.temperatureC != null ? (
              <>
                {o.temperatureC.toFixed(1)}
                <span>°</span>
              </>
            ) : (
              "—"
            )}
          </span>
          {o?.humidityPct != null && (
            <span className="st-hum">{fmtNum(o.humidityPct, 0, "%")} RH</span>
          )}
        </div>
      </button>
    </li>
  );
}
