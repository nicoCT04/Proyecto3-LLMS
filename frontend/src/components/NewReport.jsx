import { useEffect, useRef, useState } from "react";
import { api, BURN_DAY_LABEL, EQUIPMENT_LABEL, fmt, INCIDENT_LABEL, localNow } from "../api.js";
import AlertList from "./AlertList.jsx";
import Icon from "./Icon.jsx";
import Waveform from "./Waveform.jsx";

function useRecorder(onText, onError) {
  const [stream, setStream] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef(null);

  useEffect(() => {
    if (!stream) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [stream]);

  async function toggle() {
    if (stream) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Este navegador solo permite dictar con https o en localhost. Escriba la nota.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(media);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        media.getTracks().forEach((t) => t.stop());
        setStream(null);
        setTranscribing(true);
        try {
          const { texto } = await api.transcribe(new Blob(chunks, { type: rec.mimeType }));
          onText(texto);
        } catch (e) {
          onError(e.message);
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setStream(media);
    } catch {
      onError("No se pudo usar el micrófono. Revise el permiso del navegador.");
    }
  }
  return { stream, recording: !!stream, transcribing, seconds, toggle };
}

function Field({ label, hint, flagged, children, wide }) {
  return (
    <label className={`field ${flagged ? "flagged" : ""} ${wide ? "wide" : ""}`}>
      <span className="field-label">
        {label}
        {flagged && <span className="field-flag">Confirmar</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key ?? "none"}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={value === key ? "on" : ""}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Select({ value, onChange, children, label }) {
  return (
    <span className="select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>{children}</select>
      <Icon name="chevron" size={14} />
    </span>
  );
}

const toNumber = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const saidHint = (raw) =>
  raw?.unidad && raw.unidad !== "toneladas" ? `Dijo ${fmt(raw.valor, raw.valor % 1 ? 1 : 0)} ${raw.unidad}` : null;

const withUnit = (value, decimals, unit, sign = "") =>
  value == null ? <span className="dash">—</span> : <>{sign}{fmt(value, decimals)}<small> {unit}</small></>;

const PLACEHOLDER_FIELDS = ["Lote", "Tipo de corte", "Caña cortada", "Cortadores", "Quema", "Caña pendiente"];

export default function NewReport({ catalog, health, onSaved }) {
  const [text, setText] = useState("");
  const [reportedAt, setReportedAt] = useState(localNow());
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [report, setReport] = useState(null);
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);
  const resultRef = useRef(null);
  const recorder = useRecorder((t) => setText((x) => (x ? `${x} ${t}` : t)), setError);

  useEffect(() => {
    api.examples().then(setExamples).catch(() => {});
  }, []);

  useEffect(() => {
    if (!report || !result) return;
    const timer = setTimeout(() => {
      api.recompute({ texto: text, reportado: result.reportado, reporte: report })
        .then((r) => setView({ derivados: r.derivados, alertas: r.alertas }))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [report]);

  async function process() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setReport(null);
    try {
      const r = await api.extract(text, reportedAt);
      setResult(r);
      setReport(r.reporte);
      setView({ derivados: r.derivados, alertas: r.alertas });
      if (window.matchMedia("(max-width: 960px)").matches) {
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.save({ texto: text, reportado: result.reportado, reporte: report, traza: result.traza });
      setText("");
      setResult(null);
      setReport(null);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setResult(null);
    setReport(null);
  }

  const set = (key, value) => setReport({ ...report, [key]: value });
  const setStop = (i, patch) => set("paros", report.paros.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const raw = result?.traza?.crudo || {};
  const lotFlagged = report && !report.fuera_de_tema && !report.lote;
  const burnFlagged = report && !!report.quema_dia !== !!report.quema_hora;
  const derived = view?.derivados;
  const trace = result?.traza;
  const figures = derived
    ? [
        { label: "Horas desde la quema", raw: derived.horas_desde_quema, value: withUnit(derived.horas_desde_quema, 0, "h") },
        { label: "Azúcar ya perdida", raw: derived.azucar_perdida_t, value: withUnit(derived.azucar_perdida_t, 2, "t"), bad: derived.azucar_perdida_t > 0 },
        { label: "Si espera 24 h más", raw: derived.azucar_perdida_24h_mas_t, value: withUnit(derived.azucar_perdida_24h_mas_t, 2, "t", "+") },
        { label: "Azúcar estimada", raw: derived.azucar_estimada_t, value: withUnit(derived.azucar_estimada_t, 1, "t") },
        { label: "KATC del lote", raw: derived.katc, value: withUnit(derived.katc, 1, "kg/t") },
      ].filter((f) => f.raw != null)
    : [];

  return (
    <div className="screen">
      <header className="title-row">
        <div>
          <h1>Registrar nota</h1>
          <p className="title-sub">Pegue o dicte la nota del caporal tal como llegó por WhatsApp. El sistema la convierte en un reporte que usted confirma.</p>
        </div>
      </header>

      <div className="compose-grid">
        <section className="panel compose" aria-labelledby="note-heading">
          <div className="panel-head">
            <h2 id="note-heading">Nota del caporal</h2>
            <span className="panel-meta num">{text.length} / 3000</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) process(); }}
            placeholder="ing en el 47 todavía hay 4 jaulas, se quemaron antier a las 10 de la noche…"
            rows={6}
            maxLength={3000}
            aria-label="Texto de la nota"
          />

          <div className="compose-controls">
            <button
              type="button"
              className={`btn btn-secondary dictate ${recorder.recording ? "recording" : ""}`}
              onClick={recorder.toggle}
              disabled={recorder.transcribing}
            >
              <Icon name={recorder.recording ? "stop" : "mic"} />
              {recorder.recording ? "Detener" : recorder.transcribing ? "Transcribiendo…" : "Dictar"}
            </button>
            {recorder.recording && (
              <div className="recording-meter">
                <Waveform stream={recorder.stream} />
                <span className="num">{`${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, "0")}`}</span>
              </div>
            )}
            {!recorder.recording && (
              <label className="inline-field">
                <span>Recibida</span>
                <input type="datetime-local" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} />
              </label>
            )}
            <button type="button" className="btn btn-primary process" onClick={process} disabled={loading || !text.trim()}>
              {loading ? "Procesando…" : "Procesar nota"}
            </button>
          </div>
          {error && <p className="inline-error" role="alert"><Icon name="alert" size={14} />{error}</p>}

          {examples.length > 0 && (
            <div className="examples">
              <h3>Notas de ejemplo</h3>
              <ul>
                {examples.map((ex) => (
                  <li key={ex.titulo}>
                    <button
                      type="button"
                      className={text === ex.texto ? "picked" : ""}
                      onClick={() => { setText(ex.texto); setReportedAt(ex.reportado.replace(" ", "T")); setError(""); }}
                    >
                      <span className="example-title">{ex.titulo}</span>
                      <span className="example-text">{ex.texto}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section ref={resultRef} className={`panel result ${loading ? "is-loading" : ""}`} aria-labelledby="result-heading" aria-busy={loading}>
          <div className="panel-head">
            <h2 id="result-heading">Reporte extraído</h2>
            {trace && (
              <span className="panel-meta num">
                {trace.modelo} · {fmt(trace.latencia_api_s, 2)} s{trace.desde_cache ? " · caché" : ""}
              </span>
            )}
          </div>

          {!report && (
            <div className="result-empty">
              <p className="empty-line">
                {loading
                  ? `Buscando los 4 ejemplos más parecidos y extrayendo los datos con ${health?.modelo ?? "el modelo"}…`
                  : "Aquí aparece lo que el sistema entendió de la nota, listo para revisar."}
              </p>
              <dl className="ghost-fields">
                {PLACEHOLDER_FIELDS.map((f) => (
                  <div key={f}><dt>{f}</dt><dd>{loading ? <span className="bar" /> : "—"}</dd></div>
                ))}
              </dl>
            </div>
          )}

          {report?.fuera_de_tema && (
            <div className="off-topic">
              <h3>No parece un reporte de campo</h3>
              <p>La nota no habla de corte, quema, paros ni incidentes, así que no se registra nada. Si sí es un reporte, agregue el lote y lo que pasó.</p>
            </div>
          )}

          {report && !report.fuera_de_tema && (
            <div className="result-body">
              {result.banderas.length > 0 && (
                <ul className="notice">
                  {result.banderas.map((b) => <li key={b}><Icon name="alert" size={14} />{b}</li>)}
                </ul>
              )}

              {figures.length > 0 && (
                <dl className="figures">
                  {figures.map((f) => (
                    <div key={f.label}><dt>{f.label}</dt><dd className={`num ${f.bad ? "bad" : ""}`}>{f.value}</dd></div>
                  ))}
                </dl>
              )}

              <AlertList alerts={view?.alertas} />

              <h3 className="block-title">Datos de la nota</h3>
              <div className="field-grid">
                <Field label="Lote" flagged={lotFlagged}>
                  <Select label="Lote" value={report.lote || ""} onChange={(v) => set("lote", v || null)}>
                    <option value="">Sin identificar</option>
                    {catalog?.lotes?.map((l) => <option key={l.lote} value={l.lote}>{l.lote} · {l.finca}</option>)}
                  </Select>
                </Field>
                <Field label="Tipo de corte">
                  <Segmented
                    label="Tipo de corte"
                    value={report.tipo_corte}
                    onChange={(v) => set("tipo_corte", v)}
                    options={[["manual", "Manual"], ["mecanizado", "Mecanizado"], [null, "—"]]}
                  />
                </Field>
                <Field label="Caña cortada" hint={saidHint(raw.cantidad_cortada)}>
                  <span className="unit-input">
                    <input inputMode="decimal" value={report.toneladas_cortadas ?? ""} onChange={(e) => set("toneladas_cortadas", toNumber(e.target.value.replace(",", ".")))} />
                    <span>t</span>
                  </span>
                </Field>
                <Field label="Cortadores">
                  <span className="unit-input">
                    <input inputMode="numeric" value={report.cortadores ?? ""} onChange={(e) => set("cortadores", toNumber(e.target.value))} />
                    <span>personas</span>
                  </span>
                </Field>
                <Field label="Quema" flagged={burnFlagged}>
                  <span className="burn-input">
                    <Segmented
                      label="Día de la quema"
                      value={report.quema_dia}
                      onChange={(v) => set("quema_dia", v)}
                      options={[...Object.entries(BURN_DAY_LABEL), [null, "—"]]}
                    />
                    <input type="time" value={report.quema_hora || ""} onChange={(e) => set("quema_hora", e.target.value || null)} aria-label="Hora de la quema" />
                  </span>
                </Field>
                <Field label="Caña pendiente de despacho" hint={saidHint(raw.cana_pendiente)}>
                  <span className="unit-input">
                    <input inputMode="decimal" value={report.cana_pendiente_ton ?? ""} onChange={(e) => set("cana_pendiente_ton", toNumber(e.target.value.replace(",", ".")))} />
                    <span>t</span>
                  </span>
                </Field>
              </div>

              <div className="sub-block">
                <div className="sub-head">
                  <h3 className="block-title">Paros de equipo</h3>
                  <button type="button" className="btn-text" onClick={() => set("paros", [...report.paros, { equipo: "otro", horas: null }])}>
                    <Icon name="plus" size={14} />Agregar paro
                  </button>
                </div>
                {report.paros.length === 0 && <p className="empty-line">La nota no menciona paros.</p>}
                {report.paros.map((p, i) => (
                  <div className="stop-row" key={i}>
                    <Select label="Equipo" value={p.equipo} onChange={(v) => setStop(i, { equipo: v })}>
                      {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <span className="unit-input">
                      <input inputMode="decimal" placeholder="?" value={p.horas ?? ""} onChange={(e) => setStop(i, { horas: toNumber(e.target.value.replace(",", ".")) })} aria-label="Horas detenido" />
                      <span>h</span>
                    </span>
                    <button type="button" className="btn-icon" aria-label="Quitar paro" onClick={() => set("paros", report.paros.filter((_, j) => j !== i))}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="sub-block">
                <h3 className="block-title">Incidentes</h3>
                <div className="toggles">
                  {Object.entries(INCIDENT_LABEL).map(([k, label]) => {
                    const on = report.incidentes.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        className={on ? "on" : ""}
                        onClick={() => set("incidentes", on ? report.incidentes.filter((x) => x !== k) : [...report.incidentes, k].sort())}
                      >
                        {on && <Icon name="check" size={13} />}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {trace && (
            <details className="trace">
              <summary>Cómo se procesó esta nota</summary>
              <dl className="trace-facts">
                <div><dt>Configuración</dt><dd>{trace.config} · {trace.modelo}</dd></div>
                <div><dt>Tokens</dt><dd className="num">{fmt(trace.tokens_entrada)} de entrada · {fmt(trace.tokens_salida)} de salida</dd></div>
                <div><dt>Costo</dt><dd className="num">US$ {trace.costo_usd.toFixed(5)}</dd></div>
                <div><dt>JSON</dt><dd>{trace.json_valido ? "Válido" : "Inválido"}{trace.autocorreccion ? ", con autocorrección" : ", sin autocorrección"}</dd></div>
              </dl>
              {trace.ejemplos?.length > 0 && (
                <>
                  <h4>Ejemplos recuperados por similitud coseno</h4>
                  <ol className="neighbours">
                    {trace.ejemplos.map((e) => (
                      <li key={e.id}>
                        <span className="neighbour-score num">{e.similitud?.toFixed(3)}</span>
                        <span className="neighbour-bar"><span style={{ width: `${(e.similitud ?? 0) * 100}%` }} /></span>
                        <span className="neighbour-text">{e.texto}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <h4>Respuesta JSON del modelo</h4>
              <pre>{JSON.stringify(trace.crudo, null, 2)}</pre>
            </details>
          )}

          {report && (
            <div className="result-actions">
              <button type="button" className="btn btn-secondary" onClick={discard}>Descartar</button>
              {!report.fuera_de_tema && (
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Confirmar y guardar"}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
