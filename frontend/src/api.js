async function pedir(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    headers: opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...opciones,
  });
  if (!r.ok) {
    let detalle = `Error ${r.status}`;
    try {
      const j = await r.json();
      detalle = j.detail || detalle;
    } catch {}
    throw new Error(typeof detalle === "string" ? detalle : JSON.stringify(detalle));
  }
  return r.json();
}

const json = (body) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  salud: () => pedir("/api/salud"),
  catalogo: () => pedir("/api/catalogo"),
  ejemplos: () => pedir("/api/ejemplos"),
  metricas: () => pedir("/api/metricas"),
  extraer: (texto, reportado) => pedir("/api/extraer", json({ texto, reportado })),
  recalcular: (datos) => pedir("/api/recalcular", json(datos)),
  guardar: (datos) => pedir("/api/reportes", json(datos)),
  reportes: () => pedir("/api/reportes"),
  borrar: (id) => pedir(`/api/reportes/${id}`, { method: "DELETE" }),
  transcribir: (blob) => {
    const fd = new FormData();
    fd.append("audio", blob, "nota.webm");
    return pedir("/api/transcribir", { method: "POST", body: fd });
  },
};

export const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const fmt = (n, dec = 0) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("es-GT", { maximumFractionDigits: dec });
