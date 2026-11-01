import { useEffect, useRef, useState } from "react";
import { ahoraLocal, api, fmt } from "../api.js";
import Alertas from "./Alertas.jsx";

const EQUIPOS = ["cosechadora", "alzadora", "tractor", "camion", "jaula", "bomba_riego", "otro"];
const INCIDENTES = {
  accidente: "Accidente",
  plaga: "Plaga",
  incendio_no_programado: "Quema no programada",
  lluvia: "Lluvia",
  robo_cana: "Robo de caña",
  otro: "Otro",
};

function useGrabadora(alTexto, alError) {
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const rec = useRef(null);

  async function alternar() {
    if (grabando) {
      rec.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alError("El navegador no permite grabar audio aquí (requiere https o localhost). Escriba la nota.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const partes = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => partes.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        setTranscribiendo(true);
        try {
          const { texto } = await api.transcribir(new Blob(partes, { type: r.mimeType }));
          alTexto(texto);
        } catch (e) {
          alError(e.message);
        } finally {
          setTranscribiendo(false);
        }
      };
      rec.current = r;
      r.start();
      setGrabando(true);
    } catch {
      alError("No se pudo acceder al micrófono.");
    }
  }
  return { grabando, transcribiendo, alternar };
}

function Campo({ etiqueta, dudoso, children }) {
  return (
    <label className={`campo ${dudoso ? "dudoso" : ""}`}>
      <span>{etiqueta}{dudoso && <em> · confirmar</em>}</span>
      {children}
    </label>
  );
}

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function NuevoReporte({ catalogo, alGuardar }) {
  const [texto, setTexto] = useState("");
  const [reportado, setReportado] = useState(ahoraLocal());
  const [ejemplos, setEjemplos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState(null);
  const [rep, setRep] = useState(null);
  const [vista, setVista] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const grab = useGrabadora((t) => setTexto((x) => (x ? `${x} ${t}` : t)), setError);

  useEffect(() => {
    api.ejemplos().then(setEjemplos).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rep || !res) return;
    const t = setTimeout(() => {
      api.recalcular({ texto, reportado: res.reportado, reporte: rep })
        .then((r) => setVista({ derivados: r.derivados, alertas: r.alertas }))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [rep]);

  async function procesar() {
    if (!texto.trim()) return;
    setCargando(true);
    setError("");
    setRes(null);
    setRep(null);
    try {
      const r = await api.extraer(texto, reportado);
      setRes(r);
      setRep(r.reporte);
      setVista({ derivados: r.derivados, alertas: r.alertas });
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.guardar({ texto, reportado: res.reportado, reporte: rep, traza: res.traza });
      setTexto("");
      setRes(null);
      setRep(null);
      alGuardar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const set = (k, v) => setRep({ ...rep, [k]: v });
  const crudo = res?.traza?.crudo || {};
  const loteDudoso = rep && !rep.fuera_de_tema && !rep.lote;

  return (
    <div className="nuevo">
      <section className="tarjeta entrada">
        <h2>¿Qué pasó hoy en el campo?</h2>
        <p className="ayuda">Escriba o dicte la nota como la mandaría por WhatsApp. El sistema la convierte en un reporte.</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: lote 14, cortamos 290 toneladas con 40 cortadores, la quema fue a las 4 am. La alzadora se paró 2 horas…"
          rows={5}
          maxLength={3000}
        />
        <div className="fila-controles">
          <button className={`secundario ${grab.grabando ? "grabando" : ""}`} onClick={grab.alternar}
                  disabled={grab.transcribiendo}>
            {grab.grabando ? "■ Detener" : grab.transcribiendo ? "Transcribiendo…" : "🎙 Dictar"}
          </button>
          <label className="fecha">
            <span>Hora del reporte</span>
            <input type="datetime-local" value={reportado} onChange={(e) => setReportado(e.target.value)} />
          </label>
          <button className="primario" onClick={procesar} disabled={cargando || !texto.trim()}>
            {cargando ? "Procesando…" : "Procesar nota"}
          </button>
        </div>
        {ejemplos.length > 0 && (
          <div className="ejemplos">
            <span>Probar con:</span>
            {ejemplos.map((e) => (
              <button key={e.titulo} className="chip"
                      onClick={() => { setTexto(e.texto); setReportado(e.reportado.replace(" ", "T")); }}>
                {e.titulo}
              </button>
            ))}
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {cargando && <div className="cargando"><span /><span /><span /> Leyendo la nota, buscando ejemplos parecidos y extrayendo datos…</div>}
      </section>

      {rep && (
        <section className="tarjeta resultado">
          {rep.fuera_de_tema ? (
            <div className="fuera">
              <h2>Esto no parece un reporte de campo</h2>
              <p>El mensaje no describe labores del día (corte, quema, paros o incidentes), así que no se registró nada. Si es un reporte, agregue el lote y lo ocurrido.</p>
            </div>
          ) : (
            <>
              <div className="cabecera-resultado">
                <h2>Reporte extraído</h2>
                <span className="ayuda">Revise los campos marcados y corrija lo que haga falta antes de guardar.</span>
              </div>
              {res.banderas.length > 0 && (
                <ul className="banderas">{res.banderas.map((b) => <li key={b}>{b}</li>)}</ul>
              )}
              <div className="rejilla">
                <Campo etiqueta="Lote" dudoso={loteDudoso}>
                  <select value={rep.lote || ""} onChange={(e) => set("lote", e.target.value || null)}>
                    <option value="">— sin identificar —</option>
                    {catalogo?.lotes?.map((l) => (
                      <option key={l.lote} value={l.lote}>{l.lote} · {l.finca}</option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Tipo de corte">
                  <select value={rep.tipo_corte || ""} onChange={(e) => set("tipo_corte", e.target.value || null)}>
                    <option value="">—</option>
                    <option value="manual">Manual</option>
                    <option value="mecanizado">Mecanizado</option>
                  </select>
                </Campo>
                <Campo etiqueta={`Caña cortada (t)${crudo.cantidad_cortada?.unidad && crudo.cantidad_cortada.unidad !== "toneladas" ? ` · dijo ${fmt(crudo.cantidad_cortada.valor, 1)} ${crudo.cantidad_cortada.unidad}` : ""}`}>
                  <input type="number" min="0" value={rep.toneladas_cortadas ?? ""}
                         onChange={(e) => set("toneladas_cortadas", num(e.target.value))} />
                </Campo>
                <Campo etiqueta="Cortadores">
                  <input type="number" min="0" value={rep.cortadores ?? ""}
                         onChange={(e) => set("cortadores", num(e.target.value))} />
                </Campo>
                <Campo etiqueta="Quema" dudoso={!!rep.quema_dia !== !!rep.quema_hora}>
                  <div className="doble">
                    <select value={rep.quema_dia || ""} onChange={(e) => set("quema_dia", e.target.value || null)}>
                      <option value="">—</option>
                      <option value="hoy">Hoy</option>
                      <option value="ayer">Ayer</option>
                      <option value="anteayer">Anteayer</option>
                    </select>
                    <input type="time" value={rep.quema_hora || ""} onChange={(e) => set("quema_hora", e.target.value || null)} />
                  </div>
                </Campo>
                <Campo etiqueta={`Caña pendiente de despacho (t)${crudo.cana_pendiente?.unidad && crudo.cana_pendiente.unidad !== "toneladas" ? ` · dijo ${fmt(crudo.cana_pendiente.valor, 1)} ${crudo.cana_pendiente.unidad}` : ""}`}>
                  <input type="number" min="0" value={rep.cana_pendiente_ton ?? ""}
                         onChange={(e) => set("cana_pendiente_ton", num(e.target.value))} />
                </Campo>
              </div>

              <div className="sub-bloque">
                <h3>Paros de equipo</h3>
                {rep.paros.length === 0 && <p className="vacio">Sin paros reportados.</p>}
                {rep.paros.map((p, i) => (
                  <div className="paro" key={i}>
                    <select value={p.equipo} onChange={(e) => {
                      const paros = [...rep.paros]; paros[i] = { ...p, equipo: e.target.value }; set("paros", paros);
                    }}>
                      {EQUIPOS.map((eq) => <option key={eq} value={eq}>{eq.replace("_", " ")}</option>)}
                    </select>
                    <input type="number" min="0" step="0.25" placeholder="horas" value={p.horas ?? ""}
                           onChange={(e) => {
                             const paros = [...rep.paros]; paros[i] = { ...p, horas: num(e.target.value) }; set("paros", paros);
                           }} />
                    <button className="icono" aria-label="Quitar paro"
                            onClick={() => set("paros", rep.paros.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button className="enlace" onClick={() => set("paros", [...rep.paros, { equipo: "otro", horas: null }])}>+ agregar paro</button>
              </div>

              <div className="sub-bloque">
                <h3>Incidentes</h3>
                <div className="checks">
                  {Object.entries(INCIDENTES).map(([k, etq]) => (
                    <label key={k} className={rep.incidentes.includes(k) ? "marcado" : ""}>
                      <input type="checkbox" checked={rep.incidentes.includes(k)}
                             onChange={(e) => set("incidentes", e.target.checked
                               ? [...rep.incidentes, k].sort()
                               : rep.incidentes.filter((x) => x !== k))} />
                      {etq}
                    </label>
                  ))}
                </div>
              </div>

              {vista && (
                <>
                  <div className="kpis compactos">
                    <div><span>Azúcar estimada</span><strong>{fmt(vista.derivados.azucar_estimada_t, 1)} t</strong></div>
                    <div><span>Horas desde quema</span><strong>{fmt(vista.derivados.horas_desde_quema, 1)}</strong></div>
                    <div><span>Azúcar ya perdida</span><strong>{fmt(vista.derivados.azucar_perdida_t, 2)} t</strong></div>
                    <div><span>KATC del lote</span><strong>{fmt(vista.derivados.katc, 1)} kg/t</strong></div>
                  </div>
                  <Alertas alertas={vista.alertas} />
                </>
              )}
            </>
          )}

          <details className="traza">
            <summary>Cómo se procesó esta nota</summary>
            <ul>
              <li>Modelo: <b>{res.traza.modelo}</b> ({res.traza.config}){res.traza.desde_cache ? " · respuesta en caché" : ""}</li>
              <li>Tokens: {res.traza.tokens_entrada} de entrada · {res.traza.tokens_salida} de salida
                {res.traza.tokens_razonamiento ? ` · ${res.traza.tokens_razonamiento} de razonamiento` : ""}</li>
              <li>Latencia del modelo: {fmt(res.traza.latencia_api_s, 2)} s · costo estimado: US$ {res.traza.costo_usd.toFixed(5)}</li>
              {res.traza.ejemplos?.length > 0 && (
                <li>Ejemplos recuperados por similitud coseno:
                  <ol>{res.traza.ejemplos.map((e) => (
                    <li key={e.id}><code>{e.similitud?.toFixed(3)}</code> {e.texto}</li>
                  ))}</ol>
                </li>
              )}
            </ul>
            <pre>{JSON.stringify(res.traza.crudo, null, 2)}</pre>
          </details>

          <div className="acciones">
            <button className="secundario" onClick={() => { setRes(null); setRep(null); }}>Descartar</button>
            {!rep.fuera_de_tema && (
              <button className="primario" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Confirmar y guardar"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
