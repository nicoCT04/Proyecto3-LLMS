const ICONO = { critico: "●", aviso: "▲", info: "i" };
const NOMBRE = { critico: "Crítico", aviso: "Aviso", info: "Info" };

export default function Alertas({ alertas, lote }) {
  if (!alertas?.length) return <p className="vacio">Sin alertas para este reporte.</p>;
  return (
    <ul className="alertas">
      {alertas.map((a, i) => (
        <li key={i} className={`alerta ${a.nivel}`}>
          <span className="nivel"><b aria-hidden>{ICONO[a.nivel]}</b> {NOMBRE[a.nivel]}</span>
          <span className="msg">{lote ? <b>{lote} · </b> : null}{a.mensaje}</span>
        </li>
      ))}
    </ul>
  );
}
