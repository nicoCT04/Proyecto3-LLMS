import { useEffect, useState } from "react";
import { api, fmt } from "../api.js";

const PASOS = [
  { t: "Nota del caporal", d: "Texto o audio de WhatsApp" },
  { t: "Transcripción", d: "Audio → texto (Gemini multimodal)" },
  { t: "Preprocesamiento", d: "Limpieza, límite de largo, delimitadores anti-inyección" },
  { t: "Recuperación", d: "Embeddings + similitud coseno → 4 ejemplos parecidos" },
  { t: "LLM", d: "Prompt con reglas + catálogo + ejemplos → JSON con esquema" },
  { t: "Validación", d: "Pydantic, catálogo de lotes, rangos, autocorrección" },
  { t: "Reglas del ingenio", d: "Horas desde quema, KATC, azúcar en riesgo, alertas" },
  { t: "Confirmación humana", d: "El supervisor corrige campos dudosos" },
  { t: "Tablero", d: "SQLite → KPIs, alertas, CSV" },
];

const SERIES = [
  { k: "f1", n: "F1 por campo", c: "var(--brand)" },
  { k: "exactitud_nota", n: "Notas 100 % correctas", c: "var(--accent)" },
  { k: "f1_alertas", n: "F1 de alertas", c: "var(--azul)" },
];

function Grafica({ filas }) {
  const W = 640, H = 230, izq = 34, abajo = 28, arriba = 10;
  const ancho = (W - izq) / filas.length;
  const barra = Math.min(16, (ancho - 10) / SERIES.length);
  const y = (v) => arriba + (1 - v) * (H - arriba - abajo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafica" role="img" aria-label="Métricas por iteración">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={izq} x2={W} y1={y(v)} y2={y(v)} className="guia" />
          <text x={izq - 6} y={y(v) + 4} textAnchor="end" className="eje">{v}</text>
        </g>
      ))}
      {filas.map((f, i) => {
        const x0 = izq + i * ancho + (ancho - barra * SERIES.length) / 2;
        return (
          <g key={f.iteracion}>
            {SERIES.map((s, j) => (
              <rect key={s.k} x={x0 + j * barra} y={y(f[s.k])} width={barra - 2}
                    height={H - abajo - y(f[s.k])} fill={s.c} rx="2">
                <title>{`${f.iteracion} · ${s.n}: ${f[s.k].toFixed(3)}`}</title>
              </rect>
            ))}
            <text x={izq + i * ancho + ancho / 2} y={H - 9} textAnchor="middle" className="eje">{f.iteracion}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ComoFunciona({ salud }) {
  const [metricas, setMetricas] = useState([]);
  const [split, setSplit] = useState("test");
  useEffect(() => { api.metricas().then(setMetricas).catch(() => {}); }, []);
  const filas = metricas.filter((m) => m.split === split);
  const base = filas.find((f) => f.iteracion === "It0");
  const final = filas.find((f) => f.iteracion === salud?.config);

  return (
    <div className="como">
      <section className="tarjeta">
        <h2>Pipeline de punta a punta</h2>
        <ol className="pipeline">
          {PASOS.map((p, i) => (
            <li key={p.t} className={p.t === "LLM" ? "destacado" : ""}>
              <span className="num">{i + 1}</span>
              <div><b>{p.t}</b><span>{p.d}</span></div>
            </li>
          ))}
        </ol>
        <p className="ayuda">El LLM solo <b>extrae hechos</b>; todos los cálculos (toneladas por jaula, horas desde la quema, azúcar perdida) son deterministas, para que el modelo nunca invente un número.</p>
      </section>

      <section className="tarjeta">
        <div className="cabecera-seccion">
          <h2>¿Qué tan bien funciona?</h2>
          <div className="segmentado">
            {["dev", "test", "all"].map((s) => (
              <button key={s} className={split === s ? "activa" : ""} onClick={() => setSplit(s)}>
                {s === "all" ? "todo" : s}
              </button>
            ))}
          </div>
        </div>
        {filas.length === 0 ? <p className="vacio">Aún no hay resultados de evaluación (corra eval/evaluar.py).</p> : (
          <>
            {base && final && (
              <div className="kpis compactos">
                <div><span>F1 baseline (regex)</span><strong>{base.f1.toFixed(3)}</strong></div>
                <div><span>F1 sistema final</span><strong>{final.f1.toFixed(3)}</strong></div>
                <div><span>Notas 100 % correctas</span><strong>{fmt(final.exactitud_nota * 100)} %</strong></div>
                <div><span>Costo por 1000 reportes</span><strong>US$ {final.costo_usd_por_1000.toFixed(2)}</strong></div>
              </div>
            )}
            <div className="leyenda">{SERIES.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.n}</span>)}</div>
            <Grafica filas={filas} />
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr><th>It.</th><th>Cambio</th><th>F1</th><th>Exact.</th><th>Alucin.</th><th>F1 alertas</th><th>Lat. s</th><th>Tokens ent.</th></tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.iteracion} className={f.iteracion === salud?.config ? "fila-final" : ""}>
                      <td>{f.iteracion}</td><td className="desc">{f.descripcion}</td>
                      <td>{f.f1.toFixed(3)}</td><td>{f.exactitud_nota.toFixed(2)}</td>
                      <td>{f.tasa_alucinacion.toFixed(3)}</td><td>{f.f1_alertas.toFixed(3)}</td>
                      <td>{f.latencia_media_s.toFixed(2)}</td><td>{fmt(f.tokens_entrada_medios)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ayuda">Conjunto propio de 60 notas anotadas a mano (dev = 20 para ajustar prompts, test = 40 para reportar), con jerga, números en letras, casos ambiguos e intentos de prompt injection.</p>
          </>
        )}
      </section>
    </div>
  );
}
