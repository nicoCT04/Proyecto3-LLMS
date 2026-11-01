import { useEffect, useMemo, useState } from "react";
import { api, fmt } from "../api.js";

const ORDEN = { critico: 0, aviso: 1, info: 2 };

function exportarCSV(reportes) {
  const cols = ["id", "reportado", "lote", "tipo_corte", "toneladas_cortadas", "cortadores", "quema_dia",
    "quema_hora", "horas_desde_quema", "cana_pendiente_ton", "azucar_perdida_t", "paros", "incidentes", "texto"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = reportes.map((r) => {
    const x = r.reporte;
    return [r.id, r.reportado, x.lote, x.tipo_corte, x.toneladas_cortadas, x.cortadores, x.quema_dia,
      x.quema_hora, x.derivados?.horas_desde_quema, x.cana_pendiente_ton, x.derivados?.azucar_perdida_t,
      x.paros.map((p) => `${p.equipo}:${p.horas ?? "?"}h`).join(" "), x.incidentes.join(" "), r.texto].map(esc).join(",");
  });
  const blob = new Blob(["﻿" + [cols.join(","), ...filas].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bitacora_zafra_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Tablero({ version }) {
  const [reportes, setReportes] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const cargar = () => api.reportes().then(setReportes).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [version]);

  const kpis = useMemo(() => {
    if (!reportes) return null;
    const s = (f) => reportes.reduce((acc, r) => acc + (f(r) || 0), 0);
    return {
      n: reportes.length,
      toneladas: s((r) => r.reporte.toneladas_cortadas),
      pendiente: s((r) => r.reporte.cana_pendiente_ton),
      perdida: s((r) => r.reporte.derivados?.azucar_perdida_t),
      criticas: s((r) => r.alertas.filter((a) => a.nivel === "critico").length),
    };
  }, [reportes]);

  const alertas = useMemo(() => {
    if (!reportes) return [];
    return reportes
      .flatMap((r) => r.alertas.map((a) => ({ ...a, reportado: r.reportado, id: r.id })))
      .filter((a) => filtro === "todas" || a.nivel === filtro)
      .sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel] || b.reportado.localeCompare(a.reportado));
  }, [reportes, filtro]);

  if (error) return <div className="error">{error}</div>;
  if (!reportes) return <div className="cargando"><span /><span /><span /> Cargando…</div>;

  return (
    <div className="tablero">
      <div className="kpis">
        <div><span>Reportes</span><strong>{kpis.n}</strong></div>
        <div><span>Caña cortada</span><strong>{fmt(kpis.toneladas)} t</strong></div>
        <div><span>Caña pendiente</span><strong>{fmt(kpis.pendiente)} t</strong></div>
        <div className={kpis.perdida > 0 ? "rojo" : ""}><span>Azúcar perdida por espera</span><strong>{fmt(kpis.perdida, 2)} t</strong></div>
        <div className={kpis.criticas > 0 ? "rojo" : ""}><span>Alertas críticas</span><strong>{kpis.criticas}</strong></div>
      </div>

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Alertas</h2>
          <div className="segmentado">
            {["todas", "critico", "aviso", "info"].map((f) => (
              <button key={f} className={filtro === f ? "activa" : ""} onClick={() => setFiltro(f)}>
                {f === "todas" ? "Todas" : f === "critico" ? "Críticas" : f === "aviso" ? "Avisos" : "Info"}
              </button>
            ))}
          </div>
        </div>
        {alertas.length === 0 ? <p className="vacio">No hay alertas.</p> : (
          <ul className="alertas">
            {alertas.map((a, i) => (
              <li key={i} className={`alerta ${a.nivel}`}>
                <span className="nivel">{a.reportado.slice(5)}</span>
                <span className="msg">{a.mensaje}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>Reportes</h2>
          <button className="secundario" onClick={() => exportarCSV(reportes)} disabled={!reportes.length}>Exportar CSV</button>
        </div>
        {reportes.length === 0 ? (
          <p className="vacio">Todavía no hay reportes. Procese una nota en “Nuevo reporte”.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr><th>Hora</th><th>Lote</th><th>Corte</th><th>t</th><th>Cort.</th><th>Quema</th><th>Pend. t</th><th>Paros</th><th>Incidentes</th><th /></tr>
              </thead>
              <tbody>
                {reportes.map((r) => {
                  const x = r.reporte;
                  return (
                    <tr key={r.id} title={r.texto}>
                      <td>{r.reportado.slice(5)}</td>
                      <td>{x.lote || <span className="tenue">?</span>}</td>
                      <td>{x.tipo_corte || "—"}</td>
                      <td>{fmt(x.toneladas_cortadas)}</td>
                      <td>{fmt(x.cortadores)}</td>
                      <td>{x.quema_dia ? `${x.quema_dia} ${x.quema_hora || ""}` : "—"}</td>
                      <td>{fmt(x.cana_pendiente_ton)}</td>
                      <td>{x.paros.map((p) => `${p.equipo}${p.horas != null ? ` ${p.horas}h` : ""}`).join(", ") || "—"}</td>
                      <td>{x.incidentes.join(", ").replaceAll("_", " ") || "—"}</td>
                      <td><button className="icono" aria-label="Borrar" onClick={() => api.borrar(r.id).then(cargar)}>✕</button></td>
                    </tr>
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
