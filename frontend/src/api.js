async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return response.json();
}

const post = (body) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request("/api/salud"),
  catalog: () => request("/api/catalogo"),
  examples: () => request("/api/ejemplos"),
  metrics: () => request("/api/metricas"),
  extract: (texto, reportado) => request("/api/extraer", post({ texto, reportado })),
  recompute: (data) => request("/api/recalcular", post(data)),
  save: (data) => request("/api/reportes", post(data)),
  reports: () => request("/api/reportes"),
  remove: (id) => request(`/api/reportes/${id}`, { method: "DELETE" }),
  transcribe: (blob) => {
    const form = new FormData();
    form.append("audio", blob, "nota.webm");
    return request("/api/transcribir", { method: "POST", body: form });
  },
};

export const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const fmt = (n, decimals = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString("es-GT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const shortDate = (stamp) => {
  if (!stamp) return "—";
  const [date, time] = stamp.replace("T", " ").split(" ");
  const [, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} · ${time?.slice(0, 5) ?? ""}`;
};

export const BURN_DAY_LABEL = { hoy: "Hoy", ayer: "Ayer", anteayer: "Anteayer" };

export const INCIDENT_LABEL = {
  accidente: "Accidente",
  plaga: "Plaga",
  incendio_no_programado: "Quema no programada",
  lluvia: "Lluvia",
  robo_cana: "Robo de caña",
  otro: "Otro",
};

export const EQUIPMENT_LABEL = {
  cosechadora: "Cosechadora",
  alzadora: "Alzadora",
  tractor: "Tractor",
  camion: "Camión",
  jaula: "Jaula",
  bomba_riego: "Bomba de riego",
  otro: "Otro",
};

export const BURN_WARNING_HOURS = 24;
export const BURN_CRITICAL_HOURS = 48;
