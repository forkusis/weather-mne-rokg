export function Forecast() {
  return (
    <div className="page-forecast">
      <p className="section-kicker">Prognoza</p>
      <div className="card-block">
        <h2 className="card-title">Zvanična i računarska</h2>
        <p className="empty-soft">
          Ovde dolaze tekstualna prognoza, tabele po gradovima (5 dana) i mape
          sa meteo.co.me — sledeća faza po specifikaciji. Ikone i SVG mape
          preuzimamo sa izvora kad uključimo parser.
        </p>
      </div>
    </div>
  );
}
