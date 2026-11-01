import { useEffect, useState } from "react";
import { api, fmt } from "../api.js";

const LANES = [
  ["person", "Personas"],
  ["model", "Gemini"],
  ["code", "Código determinista"],
];

const STEPS = [
  { lane: "person", title: "Nota", text: "Texto o audio de WhatsApp" },
  { lane: "model", title: "Transcripción", text: "Solo si es audio" },
  { lane: "code", title: "Limpieza", text: "Delimitadores contra inyección" },
  { lane: "model", title: "Embedding", text: "768 dimensiones" },
  { lane: "code", title: "Few-shot", text: "4 notas parecidas por coseno" },
  { lane: "model", title: "Extracción", text: "JSON estricto, solo hechos" },
  { lane: "code", title: "Validación", text: "Pydantic y catálogo de lotes" },
  { lane: "code", title: "Reglas", text: "Horas, KATC y alertas" },
  { lane: "person", title: "Confirmación", text: "Corrige lo dudoso" },
  { lane: "code", title: "Tablero", text: "SQLite y CSV" },
];

const METRICS = [
  ["f1", "F1 por campo", 3],
  ["exactitud_nota", "Notas exactas", 2],
  ["f1_alertas", "F1 alertas", 3],
];

const SPLITS = [["test", "Test (40)"], ["dev", "Dev (20)"], ["all", "Todas (60)"]];

function DotStrip({ rows, metric, finalId, baseline }) {
  const values = rows.map((r) => r[metric]);
  const low = Math.min(0.7, Math.floor(Math.min(...values) * 10) / 10);
  const ticks = [];
  for (let t = low; t <= 1.0001; t += 0.1) ticks.push(Math.round(t * 10) / 10);
  const pct = (v) => `${((v - low) / (1 - low)) * 100}%`;
  const decimals = METRICS.find(([k]) => k === metric)[2];

  return (
    <div className="dot-strip">
      <div className="dot-scale" aria-hidden="true">
        <span />
        <span className="dot-track-col">
          {ticks.map((t) => <span key={t} className="dot-tick num" style={{ left: pct(t) }}>{t.toFixed(1)}</span>)}
        </span>
        <span />
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.iteracion} className={r.iteracion === finalId ? "final" : ""}>
            <span className="dot-label">
              <b>{r.iteracion}</b>
              <span>{r.descripcion}</span>
            </span>
            <span className="dot-track-col">
              <span className="dot-line" />
              <span className="dot-gridlines" aria-hidden="true">
                {ticks.map((t) => <i key={t} style={{ left: pct(t) }} />)}
                {baseline != null && <i className="ref" style={{ left: pct(baseline) }} />}
              </span>
              <span className="dot" style={{ left: pct(r[metric]) }} />
            </span>
            <span className="dot-value num">{r[metric].toFixed(decimals)}</span>
          </li>
        ))}
      </ul>
      {baseline != null && (
        <p className="dot-key"><i />Línea punteada: el baseline con expresiones regulares (It0), sin LLM.</p>
      )}
    </div>
  );
}

export default function HowItWorks({ health }) {
  const [metrics, setMetrics] = useState(null);
  const [split, setSplit] = useState("test");
  const [metric, setMetric] = useState("f1");
  useEffect(() => { api.metrics().then(setMetrics).catch(() => setMetrics([])); }, []);

  const rows = (metrics ?? []).filter((m) => m.split === split);
  const base = rows.find((r) => r.iteracion === "It0");
  const final = rows.find((r) => r.iteracion === health?.config);
  const chartRows = rows.filter((r) => r.n === Math.max(...rows.map((x) => x.n)));
  const partial = rows.filter((r) => !chartRows.includes(r));

  return (
    <div className="screen">
      <header className="title-row">
        <div>
          <h1>Cómo funciona</h1>
          <p className="title-sub">El modelo solo extrae los hechos de la nota; las cuentas las hace código, así un error de cálculo del modelo nunca llega al tablero.</p>
        </div>
      </header>

      <section className="panel" aria-labelledby="pipeline-heading">
        <div className="panel-head">
          <h2 id="pipeline-heading">Recorrido de una nota</h2>
          <span className="panel-meta">De izquierda a derecha</span>
        </div>
        <ol className="lanes" style={{ "--steps": STEPS.length }}>
          {LANES.map(([key, label], row) => (
            <li key={key} className={`lane-label lane-${key}`} style={{ gridRow: row + 1 }} aria-hidden="true">{label}</li>
          ))}
          {STEPS.map((s, i) => (
            <li key={s.title} className={`step lane-${s.lane}`}
                style={{ gridColumn: i + 2, gridRow: LANES.findIndex(([k]) => k === s.lane) + 1 }}>
              <b>{s.title}</b>
              <span>{s.text}</span>
              <span className="step-owner">{LANES.find(([k]) => k === s.lane)[1]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel" aria-labelledby="eval-heading">
        <div className="panel-head">
          <h2 id="eval-heading">Qué tan bien funciona</h2>
          <div className="control-row">
            <div className="segmented small" role="radiogroup" aria-label="Métrica">
              {METRICS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={metric === k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{label}</button>
              ))}
            </div>
            <div className="segmented small" role="radiogroup" aria-label="Conjunto">
              {SPLITS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={split === k} className={split === k ? "on" : ""} onClick={() => setSplit(k)}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {metrics && rows.length === 0 ? (
          <p className="empty-box">Todavía no hay resultados de evaluación. Corra <code>python eval/evaluar.py</code> para generarlos.</p>
        ) : (
          <>
            <dl className="kpi-strip inner">
              <div><dt>F1 con expresiones regulares</dt><dd className="num">{base ? base.f1.toFixed(3) : <span className="bar" />}</dd></div>
              <div><dt>F1 del sistema ({final?.iteracion ?? "—"})</dt><dd className="num lead">{final ? final.f1.toFixed(3) : <span className="bar" />}</dd></div>
              <div><dt>Notas 100 % correctas</dt><dd className="num">{final ? <>{fmt(final.exactitud_nota * 100)}<small> %</small></> : <span className="bar" />}</dd></div>
              <div><dt>Costo por 1000 notas</dt><dd className="num">{final ? <><small>US$ </small>{final.costo_usd_por_1000.toFixed(2)}</> : <span className="bar" />}</dd></div>
            </dl>

            {chartRows.length > 0 && (
              <DotStrip rows={chartRows} metric={metric} finalId={health?.config} baseline={metric === "f1" ? base?.f1 : base?.[metric]} />
            )}
            {partial.length > 0 && (
              <p className="footnote">
                {partial.map((r) => r.iteracion).join(", ")} se evaluó sobre {fmt(partial[0].n)} notas por la cuota del modelo grande, por eso no está en la gráfica; sus cifras están en la tabla.
              </p>
            )}

            <div className="table-wrap">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Iteración</th><th className="num">Notas</th><th className="num">F1</th><th className="num">Exactas</th>
                    <th className="num">Alucinación</th><th className="num">F1 alertas</th><th className="num">Latencia</th><th className="num">US$ / 1000</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.iteracion} className={r.iteracion === health?.config ? "selected" : ""}>
                      <td data-label="Iteración"><b>{r.iteracion}</b> <span className="muted">{r.descripcion}</span></td>
                      <td className="num" data-label="Notas">{fmt(r.n)}</td>
                      <td className="num" data-label="F1">{r.f1.toFixed(3)}</td>
                      <td className="num" data-label="Exactas">{fmt(r.exactitud_nota * 100)}<small> %</small></td>
                      <td className="num" data-label="Alucinación">{fmt(r.tasa_alucinacion * 100, 1)}<small> %</small></td>
                      <td className="num" data-label="F1 alertas">{r.f1_alertas.toFixed(3)}</td>
                      <td className="num" data-label="Latencia">{fmt(r.latencia_media_s, 2)}<small> s</small></td>
                      <td className="num" data-label="US$ / 1000">{r.costo_usd_por_1000.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnote">60 notas propias anotadas a mano, con jerga, números en letras, casos ambiguos e intentos de inyección de instrucciones: 20 de dev para ajustar los prompts y 40 de test para reportar.</p>
          </>
        )}
      </section>
    </div>
  );
}
