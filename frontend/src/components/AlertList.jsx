import { shortDate } from "../api.js";

export const LEVEL_LABEL = { critico: "Crítica", aviso: "Aviso", info: "Info" };

export default function AlertList({ alerts, showMeta = false, empty = "Sin alertas para este reporte." }) {
  if (!alerts?.length) return <p className="empty-line">{empty}</p>;
  return (
    <ul className="alert-list">
      {alerts.map((alert, i) => (
        <li key={`${alert.id ?? "x"}-${alert.tipo}-${i}`} className={`alert-row level-${alert.nivel}`}>
          <span className={`pill pill-${alert.nivel}`}>{LEVEL_LABEL[alert.nivel]}</span>
          <span className="alert-text">
            {alert.mensaje}
            {showMeta && <span className="alert-meta num">Nota del {shortDate(alert.reportado)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
