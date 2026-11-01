import { useEffect, useState } from "react";
import { api } from "./api.js";
import Dashboard from "./components/Dashboard.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import Icon, { Mark } from "./components/Icon.jsx";
import NewReport from "./components/NewReport.jsx";

const SCREENS = [
  { id: "nota", label: "Registrar nota", short: "Nota", icon: "note" },
  { id: "tablero", label: "Tablero", short: "Tablero", icon: "board" },
  { id: "como-funciona", label: "Cómo funciona", short: "Cómo funciona", icon: "flow" },
];

const screenFromHash = () => {
  const id = window.location.hash.replace("#/", "");
  return SCREENS.some((s) => s.id === id) ? id : "nota";
};

function initialTheme() {
  try {
    return localStorage.getItem("tema") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch {
    return "light";
  }
}

export default function App() {
  const [screen, setScreen] = useState(screenFromHash);
  const [theme, setTheme] = useState(initialTheme);
  const [health, setHealth] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("tema", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
    api.catalog().then(setCatalog).catch(() => setCatalog({ lotes: [] }));
  }, []);

  const go = (id) => {
    window.location.hash = `#/${id}`;
    window.scrollTo({ top: 0 });
  };
  const current = SCREENS.find((s) => s.id === screen);

  const status = health && (
    <span className={`status ${health.ok ? "" : "down"}`} title={health.descripcion}>
      <i />
      {health.ok ? <>{health.modelo}{health.modo_demo && <b> · demo sin internet</b>}</> : "Sin conexión con el servidor"}
    </span>
  );

  const themeToggle = (
    <button type="button" className="btn-icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Bitácora de Zafra</strong>
            <span>Zafra {catalog?.temporada ?? "2026-2027"} · {catalog?.lotes?.length ?? 48} lotes</span>
          </div>
        </div>
        <nav aria-label="Secciones">
          {SCREENS.map((s) => (
            <a key={s.id} href={`#/${s.id}`} className={screen === s.id ? "active" : ""}
               aria-current={screen === s.id ? "page" : undefined}>
              <Icon name={s.icon} />{s.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">{status}</div>
      </aside>

      <header className="topbar">
        <div className="crumbs">
          <span className="phone-brand"><Mark size={24} />Bitácora de Zafra</span>
          <span className="crumb-scope">Ingenio · Zafra {catalog?.temporada ?? "2026-2027"}</span>
          <span className="crumb-sep" aria-hidden="true">/</span>
          <span className="crumb-current">{current.label}</span>
        </div>
        <div className="topbar-actions">
          <span className="topbar-status">{status}</span>
          {themeToggle}
        </div>
      </header>

      <main className="sheet">
        {screen === "nota" && (
          <NewReport catalog={catalog} health={health} onSaved={() => { setVersion((v) => v + 1); go("tablero"); }} />
        )}
        {screen === "tablero" && <Dashboard version={version} catalog={catalog} onNewNote={() => go("nota")} />}
        {screen === "como-funciona" && <HowItWorks health={health} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {SCREENS.map((s) => (
          <a key={s.id} href={`#/${s.id}`} className={screen === s.id ? "active" : ""}
             aria-current={screen === s.id ? "page" : undefined}>
            <Icon name={s.icon} size={20} />{s.short}
          </a>
        ))}
      </nav>
    </div>
  );
}
