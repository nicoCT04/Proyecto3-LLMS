import { useState } from "react";
import { shortDate } from "../api.js";

export const LEVEL_LABEL = { critico: "Crítica", aviso: "Aviso", info: "Info" };

// Cerrar una alerta pide un segundo paso: «ya se resolvió» no basta, alguien tiene que confirmarlo.
function ResolveControl({ alert, onResolve, onReopen }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (fn) => {
    setBusy(true);
    setError("");
    fn().catch((e) => setError(e.message)).finally(() => setBusy(false));
  };

  if (alert.resuelta) {
    return (
      <span className="resolved-meta">
        Resuelta el {shortDate(alert.resuelta)}{alert.nota_cierre ? ` · «${alert.nota_cierre}»` : ""}
        {" "}<button type="button" className="btn-text" disabled={busy} onClick={() => run(() => onReopen(alert))}>Reabrir</button>
        {error && <span className="inline-error" role="alert">No se pudo reabrir: {error}</span>}
      </span>
    );
  }
  if (!open) {
    return <button type="button" className="btn-text resolve-link" onClick={() => setOpen(true)}>Marcar resuelta</button>;
  }
  return (
    <span className="resolve-form">
      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="¿Qué se hizo? Ej.: el camión se llevó las 4 jaulas a las 7 p. m. (opcional)" />
      <span className="resolve-actions">
        <button type="button" className="btn btn-primary small" disabled={busy}
                onClick={() => run(() => onResolve(alert, note))}>Confirmar cierre</button>
        <button type="button" className="btn-text" onClick={() => { setOpen(false); setNote(""); setError(""); }}>Cancelar</button>
      </span>
      {error && <span className="inline-error" role="alert">No se pudo cerrar: {error}</span>}
    </span>
  );
}

export default function AlertList({ alerts, showMeta = false, empty = "Sin alertas para este reporte.", onResolve, onReopen }) {
  if (!alerts?.length) return <p className="empty-line">{empty}</p>;
  return (
    <ul className="alert-list">
      {alerts.map((alert, i) => (
        <li key={`${alert.id ?? "x"}-${alert.indice ?? alert.tipo}-${i}`}
            className={`alert-row level-${alert.nivel} ${alert.resuelta ? "is-resolved" : ""}`}>
          <span className={`pill pill-${alert.nivel}`}>{LEVEL_LABEL[alert.nivel]}</span>
          <span className="alert-text">
            {alert.mensaje}
            {showMeta && <span className="alert-meta num">Nota del {shortDate(alert.reportado)}</span>}
            {onResolve && <ResolveControl alert={alert} onResolve={onResolve} onReopen={onReopen} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
