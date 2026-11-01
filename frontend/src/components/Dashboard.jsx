import { Fragment, useEffect, useMemo, useState } from "react";
import {
  api, BURN_CRITICAL_HOURS, BURN_DAY_LABEL, BURN_WARNING_HOURS, EQUIPMENT_LABEL, fmt, INCIDENT_LABEL, shortDate,
} from "../api.js";
import AlertList from "./AlertList.jsx";
import Icon from "./Icon.jsx";

const LEVEL_ORDER = { critico: 0, aviso: 1, info: 2 };
const FILTERS = [["todas", "Todas"], ["critico", "Críticas"], ["aviso", "Avisos"], ["info", "Info"]];
const ALERT_CAP = 6;

function exportCsv(reports) {
  const columns = ["id", "reportado", "lote", "tipo_corte", "toneladas_cortadas", "cortadores", "quema_dia",
    "quema_hora", "horas_desde_quema", "cana_pendiente_ton", "azucar_perdida_t", "paros", "incidentes", "texto"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = reports.map((r) => {
    const x = r.reporte;
    return [r.id, r.reportado, x.lote, x.tipo_corte, x.toneladas_cortadas, x.cortadores, x.quema_dia,
      x.quema_hora, x.derivados?.horas_desde_quema, x.cana_pendiente_ton, x.derivados?.azucar_perdida_t,
      x.paros.map((p) => `${p.equipo}:${p.horas ?? "?"}h`).join(" "), x.incidentes.join(" "), r.texto].map(escape).join(",");
  });
  const blob = new Blob(["﻿" + [columns.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bitacora_zafra_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const burnLevel = (hours) =>
  hours >= BURN_CRITICAL_HOURS ? "critico" : hours >= BURN_WARNING_HOURS ? "aviso" : "ok";

function BurnClock({ rows, lotsByCode }) {
  const maxHours = Math.max(72, Math.ceil(Math.max(0, ...rows.map((r) => r.hours)) / 12) * 12);
  const pct = (h) => `${(h / maxHours) * 100}%`;
  const ticks = [];
  for (let h = 0; h <= maxHours; h += 12) ticks.push(h);

  return (
    <div className="burn-clock">
      <div className="burn-scale" aria-hidden="true">
        <span className="burn-lot-col" />
        <span className="burn-track-col">
          {ticks.map((h) => (
            <span key={h} className="burn-tick num" style={{ left: pct(h) }}>{h} h</span>
          ))}
        </span>
        <span className="burn-figure-col" />
      </div>
      <ul>
        {rows.map((r) => {
          const level = burnLevel(r.hours);
          return (
            <li key={r.id} className={`burn-row burn-${level}`}>
              <span className="burn-lot-col">
                <span className="lot-code">{r.lot ?? "Sin lote"}</span>
                <span className="burn-farm">{lotsByCode[r.lot]?.finca ?? "Lote sin identificar"}</span>
              </span>
              <span className="burn-track-col">
                <span className="burn-track">
                  <span className="burn-zone zone-warning" style={{ left: pct(BURN_WARNING_HOURS), width: pct(BURN_CRITICAL_HOURS - BURN_WARNING_HOURS) }} />
                  <span className="burn-zone zone-critical" style={{ left: pct(BURN_CRITICAL_HOURS), right: 0 }} />
                  <span className="burn-fill" style={{ width: pct(r.hours) }} />
                  <span className="burn-now num" style={{ left: pct(r.hours) }}>{fmt(r.hours, 0)} h</span>
                </span>
              </span>
              <span className="burn-figure-col">
                <span className="num burn-tons">{fmt(r.pending, 0)} t</span>
                <span className={`num burn-loss ${r.lost > 0 ? "bad" : ""}`}>{r.lost != null ? `−${fmt(r.lost, 2)} t azúcar` : "—"}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="burn-key">
        <span><i className="key-warning" />Aviso desde {BURN_WARNING_HOURS} h</span>
        <span><i className="key-critical" />Crítico desde {BURN_CRITICAL_HOURS} h</span>
        <span>Horas contadas desde la quema hasta que llegó la nota.</span>
      </p>
    </div>
  );
}

function DeleteButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button type="button" className="btn-text danger" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>Borrar</button>
  ) : (
    <button type="button" className="btn-icon" aria-label="Borrar reporte" onClick={(e) => { e.stopPropagation(); setArmed(true); }}>
      <Icon name="trash" size={14} />
    </button>
  );
}

function Cell({ label, value, numeric }) {
  const empty = value === null || value === undefined || value === false;
  return (
    <td className={`${numeric ? "num" : ""} ${empty ? "empty" : ""}`} data-label={label}>
      {empty ? <span className="dash">—</span> : value}
    </td>
  );
}

const describeStops = (stops) =>
  stops.map((p) => `${EQUIPMENT_LABEL[p.equipo] ?? p.equipo}${p.horas != null ? ` ${fmt(p.horas, p.horas % 1 ? 1 : 0)} h` : ""}`).join(", ");

const describeBurn = (x) =>
  x.quema_dia ? `${BURN_DAY_LABEL[x.quema_dia]}${x.quema_hora ? ` ${x.quema_hora}` : ""}` : null;

export default function Dashboard({ version, catalog, onNewNote }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("todas");
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = () => {
    setError("");
    return api.reports()
      .then((r) => { setReports(r); setLoadedAt(new Date()); })
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, [version]);

  const lotsByCode = useMemo(
    () => Object.fromEntries((catalog?.lotes ?? []).map((l) => [l.lote, l])),
    [catalog],
  );

  const totals = useMemo(() => {
    if (!reports) return null;
    const sum = (f) => reports.reduce((acc, r) => acc + (f(r) || 0), 0);
    return {
      count: reports.length,
      cut: sum((r) => r.reporte.toneladas_cortadas),
      pending: sum((r) => r.reporte.cana_pendiente_ton),
      lost: sum((r) => r.reporte.derivados?.azucar_perdida_t),
      critical: sum((r) => r.alertas.filter((a) => a.nivel === "critico").length),
    };
  }, [reports]);

  const burnRows = useMemo(() => {
    if (!reports) return [];
    return reports
      .filter((r) => r.reporte.cana_pendiente_ton > 0 && r.reporte.derivados?.horas_desde_quema != null)
      .map((r) => ({
        id: r.id,
        lot: r.reporte.lote,
        pending: r.reporte.cana_pendiente_ton,
        hours: r.reporte.derivados.horas_desde_quema,
        lost: r.reporte.derivados.azucar_perdida_t,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [reports]);

  const cutByLot = useMemo(() => {
    if (!reports) return [];
    const groups = {};
    reports.forEach((r) => {
      const x = r.reporte;
      if (!x.toneladas_cortadas) return;
      const key = x.lote ?? "";
      groups[key] ??= { lot: x.lote, tons: 0, cutters: 0, notes: 0, type: new Set() };
      groups[key].tons += x.toneladas_cortadas;
      groups[key].cutters += x.cortadores ?? 0;
      groups[key].notes += 1;
      if (x.tipo_corte) groups[key].type.add(x.tipo_corte);
    });
    return Object.values(groups).sort((a, b) => b.tons - a.tons);
  }, [reports]);

  const allAlerts = useMemo(() => {
    if (!reports) return [];
    return reports
      .flatMap((r) => r.alertas.map((a) => ({ ...a, reportado: r.reportado, id: r.id })))
      .sort((a, b) => LEVEL_ORDER[a.nivel] - LEVEL_ORDER[b.nivel] || b.reportado.localeCompare(a.reportado));
  }, [reports]);

  const counts = useMemo(() => {
    const c = { todas: allAlerts.length, critico: 0, aviso: 0, info: 0 };
    allAlerts.forEach((a) => { c[a.nivel] += 1; });
    return c;
  }, [allAlerts]);

  const filtered = allAlerts.filter((a) => filter === "todas" || a.nivel === filter);
  const visibleAlerts = showAllAlerts ? filtered : filtered.slice(0, ALERT_CAP);

  const worst = burnRows[0];
  const finding = !reports || reports.length === 0
    ? "Todavía no hay reportes guardados en esta zafra."
    : worst
      ? `${fmt(worst.pending, 0)} t de caña quemada llevan ${fmt(worst.hours, 0)} h esperando en ${worst.lot ?? "un lote sin identificar"}${worst.lost ? `: ya se perdieron ~${fmt(worst.lost, 2)} t de azúcar` : ""}.`
      : "Ninguna caña quemada está esperando despacho.";

  if (error && !reports) {
    return (
      <div className="screen">
        <header className="title-row"><div><h1>Tablero de zafra</h1></div></header>
        <div className="panel"><p className="inline-error" role="alert"><Icon name="alert" size={14} />No se pudieron cargar los reportes: {error}. <button type="button" className="btn-text" onClick={load}>Reintentar</button></p></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="title-row">
        <div>
          <h1>Tablero de zafra</h1>
          <p className="title-sub">{finding}</p>
        </div>
        <div className="title-actions">
          {loadedAt && (
            <button type="button" className="freshness" onClick={load} title="Volver a cargar">
              Actualizado {loadedAt.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => exportCsv(reports)} disabled={!reports?.length}>
            <Icon name="download" size={14} />Exportar CSV
          </button>
        </div>
      </header>

      <dl className="kpi-strip">
        <div><dt>Reportes</dt><dd className="num">{reports ? fmt(totals.count) : <span className="bar" />}</dd></div>
        <div><dt>Caña cortada</dt><dd className="num">{reports ? <>{fmt(totals.cut)}<small> t</small></> : <span className="bar" />}</dd></div>
        <div><dt>Caña pendiente</dt><dd className="num">{reports ? <>{fmt(totals.pending)}<small> t</small></> : <span className="bar" />}</dd></div>
        <div><dt>Azúcar perdida por espera</dt><dd className={`num ${totals?.lost > 0 ? "bad" : ""}`}>{reports ? <>{fmt(totals.lost, 2)}<small> t</small></> : <span className="bar" />}</dd></div>
        <div><dt>Alertas críticas</dt><dd className={`num ${totals?.critical > 0 ? "bad" : ""}`}>{reports ? fmt(totals.critical) : <span className="bar" />}</dd></div>
      </dl>

      <div className="overview-grid">
        <div className="main-column">
          <section className="panel burn-panel" aria-labelledby="burn-heading">
            <div className="panel-head">
              <h2 id="burn-heading">Caña quemada esperando molienda</h2>
              <span className="panel-meta">{burnRows.length ? `${burnRows.length} ${burnRows.length === 1 ? "lote" : "lotes"}` : ""}</span>
            </div>
            {reports && burnRows.length === 0 ? (
              <p className="empty-box">Ningún reporte tiene caña quemada pendiente de despacho. Cada hora que la caña quemada espera pierde sacarosa; cuando una nota lo mencione, el lote aparece aquí con su reloj.</p>
            ) : (
              <BurnClock rows={burnRows} lotsByCode={lotsByCode} />
            )}
          </section>

          <section className="panel" aria-labelledby="cut-heading">
            <div className="panel-head">
              <h2 id="cut-heading">Caña cortada por lote</h2>
              <span className="panel-meta num">{cutByLot.length ? `${fmt(totals.cut)} t en ${cutByLot.length} ${cutByLot.length === 1 ? "lote" : "lotes"}` : ""}</span>
            </div>
            {reports && cutByLot.length === 0 ? (
              <p className="empty-box">Ningún reporte guardado trae toneladas cortadas todavía.</p>
            ) : (
              <ul className="cut-list">
                {cutByLot.map((g, i) => (
                  <li key={g.lot ?? "none"}>
                    <span className="cut-lot">
                      <span className="lot-code">{g.lot ?? "Sin lote"}</span>
                      <span className="burn-farm">{g.lot ? lotsByCode[g.lot]?.finca : "La nota no dijo el lote"}</span>
                    </span>
                    <span className="cut-bar"><span className={i === 0 ? "top" : ""} style={{ width: `${(g.tons / cutByLot[0].tons) * 100}%` }} /></span>
                    <span className="cut-meta">{[...g.type].map((t) => t[0].toUpperCase() + t.slice(1)).join(" y ") || "—"}{g.cutters ? ` · ${fmt(g.cutters)} cortadores` : ""}</span>
                    <span className="num cut-tons">{fmt(g.tons)}<small> t</small></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="panel alerts-panel" aria-labelledby="alerts-heading">
          <div className="panel-head">
            <h2 id="alerts-heading">Alertas</h2>
          </div>
          <div className="segmented small" role="radiogroup" aria-label="Filtrar alertas">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={filter === key}
                      className={filter === key ? "on" : ""} onClick={() => { setFilter(key); setShowAllAlerts(false); }}>
                {label} <span className="num count">{counts[key]}</span>
              </button>
            ))}
          </div>
          <AlertList alerts={visibleAlerts} showMeta empty={reports?.length ? "No hay alertas con este filtro." : "Las alertas de cada reporte guardado aparecen aquí."} />
          {filtered.length > ALERT_CAP && (
            <button type="button" className="btn btn-secondary full" onClick={() => setShowAllAlerts(!showAllAlerts)}>
              {showAllAlerts ? "Ver menos" : `Ver las ${filtered.length}`}
            </button>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="reports-heading">
        <div className="panel-head">
          <h2 id="reports-heading">Reportes guardados</h2>
          <span className="panel-meta">{reports?.length ? "Toque una fila para ver la nota original" : ""}</span>
        </div>
        {reports && reports.length === 0 ? (
          <div className="empty-box">
            Procese una nota y confírmela para verla aquí.{" "}
            <button type="button" className="btn-text" onClick={onNewNote}>Registrar la primera nota</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Recibida</th><th>Lote</th><th>Corte</th><th className="num">Cortada</th><th className="num">Cortadores</th>
                  <th>Quema</th><th className="num">Pendiente</th><th>Paros</th><th>Incidentes</th><th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {(reports ?? []).map((r) => {
                  const x = r.reporte;
                  const open = openRow === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={open ? "open" : ""} onClick={() => setOpenRow(open ? null : r.id)} tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") setOpenRow(open ? null : r.id); }} aria-expanded={open}>
                        <td className="date muted" data-label="Recibida">{shortDate(r.reportado)}</td>
                        <Cell label="Lote" value={x.lote && <span className="lot-code">{x.lote}</span>} />
                        <Cell label="Corte" value={x.tipo_corte && x.tipo_corte[0].toUpperCase() + x.tipo_corte.slice(1)} />
                        <Cell label="Cortada" numeric value={x.toneladas_cortadas != null && <>{fmt(x.toneladas_cortadas)}<small> t</small></>} />
                        <Cell label="Cortadores" numeric value={x.cortadores != null && fmt(x.cortadores)} />
                        <Cell label="Quema" value={describeBurn(x)} />
                        <Cell label="Pendiente" numeric value={x.cana_pendiente_ton != null && <>{fmt(x.cana_pendiente_ton)}<small> t</small></>} />
                        <Cell label="Paros" value={x.paros.length > 0 && describeStops(x.paros)} />
                        <Cell label="Incidentes" value={x.incidentes.length > 0 && x.incidentes.map((i) => INCIDENT_LABEL[i] ?? i).join(", ")} />
                        <td className="row-action"><DeleteButton onConfirm={() => api.remove(r.id).then(load)} /></td>
                      </tr>
                      {open && (
                        <tr className="note-row">
                          <td colSpan={10}><blockquote>{r.texto}</blockquote></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
