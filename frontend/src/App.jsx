import { useEffect, useState } from "react";
import { api } from "./api.js";
import NuevoReporte from "./components/NuevoReporte.jsx";
import Tablero from "./components/Tablero.jsx";
import ComoFunciona from "./components/ComoFunciona.jsx";

const VISTAS = [
  { id: "nuevo", etiqueta: "Nuevo reporte" },
  { id: "tablero", etiqueta: "Tablero" },
  { id: "como", etiqueta: "Cómo funciona" },
];

function temaInicial() {
  try {
    return localStorage.getItem("tema") || "light";
  } catch {
    return "light";
  }
}

export default function App() {
  const [vista, setVista] = useState("nuevo");
  const [tema, setTema] = useState(temaInicial);
  const [salud, setSalud] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem("tema", tema);
    } catch {}
  }, [tema]);

  useEffect(() => {
    api.salud().then(setSalud).catch(() => setSalud({ ok: false }));
    api.catalogo().then(setCatalogo).catch(() => setCatalogo({ lotes: [] }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="marca">
          <img src="/cana.svg" alt="" width="30" height="30" />
          <div>
            <h1>Bitácora de Zafra</h1>
            <span className="sub">Notas de campo → reportes y alertas con un LLM</span>
          </div>
        </div>
        <div className="estado">
          {salud && (
            <span className={`pastilla ${salud.ok ? "ok" : "mal"}`} title={salud.descripcion}>
              {salud.ok ? `${salud.modelo}${salud.modo_demo ? " · demo" : ""}` : "sin conexión"}
            </span>
          )}
          <button className="icono" onClick={() => setTema(tema === "dark" ? "light" : "dark")}
                  aria-label="Cambiar tema">{tema === "dark" ? "☀" : "☾"}</button>
        </div>
      </header>
      <nav className="pestanas">
        {VISTAS.map((v) => (
          <button key={v.id} className={vista === v.id ? "activa" : ""} onClick={() => setVista(v.id)}>
            {v.etiqueta}
          </button>
        ))}
      </nav>
      <main className="contenido">
        {vista === "nuevo" && (
          <NuevoReporte catalogo={catalogo} alGuardar={() => { setVersion(version + 1); setVista("tablero"); }} />
        )}
        {vista === "tablero" && <Tablero version={version} />}
        {vista === "como" && <ComoFunciona salud={salud} />}
      </main>
    </div>
  );
}
