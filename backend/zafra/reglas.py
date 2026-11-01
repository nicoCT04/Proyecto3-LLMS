"""Reglas del dominio azucarero: tiempo desde la quema, azúcar en riesgo y alertas.

El LLM solo extrae hechos; todos los cálculos son deterministas (no se le pide aritmética al modelo).
"""
from datetime import datetime, timedelta

from . import catalogo, config

DESPLAZAMIENTO_DIA = {"hoy": 0, "ayer": 1, "anteayer": 2}
NIVEL_ORDEN = {"critico": 0, "aviso": 1, "info": 2}


def horas_desde_quema(rep: dict, reportado: str) -> float | None:
    if not rep.get("quema_dia") or not rep.get("quema_hora"):
        return None
    ahora = datetime.fromisoformat(reportado)
    h, m = map(int, rep["quema_hora"].split(":"))
    quema = (ahora - timedelta(days=DESPLAZAMIENTO_DIA[rep["quema_dia"]])).replace(
        hour=h, minute=m, second=0, microsecond=0)
    horas = (ahora - quema).total_seconds() / 3600
    return round(horas, 1) if horas >= 0 else None


def katc(pol: float) -> float:
    """Kilogramos de azúcar recuperable por tonelada de caña."""
    return round(pol * 10 * config.EFICIENCIA_RECUPERACION, 1)


def pol_lote(lote: str | None) -> float:
    lotes = catalogo.lotes()
    if lote in lotes:
        return lotes[lote]["pol"]
    return round(sum(l["pol"] for l in lotes.values()) / len(lotes), 2)


def azucar_en_riesgo(toneladas: float, horas: float, pol: float) -> float:
    """Toneladas de azúcar perdidas por deterioro tras `horas` desde la quema."""
    perdida = min(config.PERDIDA_POL_POR_HORA * horas, 1.0)
    return round(toneladas * katc(pol) * perdida / 1000, 2)


def enriquecer(rep: dict, reportado: str) -> dict:
    """Agrega métricas derivadas y alertas al reporte normalizado."""
    horas = horas_desde_quema(rep, reportado)
    pol = pol_lote(rep.get("lote"))
    pend = rep.get("cana_pendiente_ton") or 0
    der = {"horas_desde_quema": horas, "pol_lote": pol, "katc": katc(pol),
           "azucar_perdida_t": None, "azucar_perdida_24h_mas_t": None,
           "azucar_estimada_t": None}
    if rep.get("toneladas_cortadas"):
        der["azucar_estimada_t"] = round(rep["toneladas_cortadas"] * katc(pol) / 1000, 1)
    if pend and horas is not None:
        der["azucar_perdida_t"] = azucar_en_riesgo(pend, horas, pol)
        der["azucar_perdida_24h_mas_t"] = round(azucar_en_riesgo(pend, horas + 24, pol)
                                                - der["azucar_perdida_t"], 2)
    return {**rep, "derivados": der, "alertas": alertas(rep, der)}


def alertas(rep: dict, der: dict) -> list[dict]:
    if rep.get("fuera_de_tema"):
        return []
    a = []
    lote = rep.get("lote") or "lote sin identificar"
    pend = rep.get("cana_pendiente_ton") or 0
    horas = der.get("horas_desde_quema")
    if pend and horas is not None and horas >= config.UMBRAL_QUEMA_HORAS:
        nivel = "critico" if horas >= config.UMBRAL_QUEMA_CRITICO else "aviso"
        a.append({"tipo": "cana_quemada_pendiente", "nivel": nivel,
                  "mensaje": f"{pend:.0f} t de caña quemada hace {horas:.0f} h sin llegar al ingenio en "
                             f"{lote}: ~{der['azucar_perdida_t']} t de azúcar perdidas; esperar 24 h más "
                             f"cuesta ~{der['azucar_perdida_24h_mas_t']} t adicionales."})
    elif pend:
        a.append({"tipo": "cana_pendiente", "nivel": "info",
                  "mensaje": f"{pend:.0f} t de caña pendientes de despacho en {lote}."})
    for p in rep.get("paros", []):
        if p.get("horas") is not None and p["horas"] >= config.UMBRAL_PARO_HORAS:
            nombre = p["equipo"].replace("_", " de ").replace("camion", "camión")
            genero = "a" if p["equipo"] in ("cosechadora", "alzadora", "jaula", "bomba_riego") else "o"
            a.append({"tipo": "paro_largo", "nivel": "aviso",
                      "mensaje": f"{nombre.capitalize()} detenid{genero} {p['horas']:g} h en {lote}."})
    textos = {
        "accidente": ("critico", "Accidente con personal reportado en {lote}: verificar atención médica y reporte IGSS."),
        "incendio_no_programado": ("critico", "Quema no programada en {lote}: coordinar corte y despacho prioritario."),
        "plaga": ("aviso", "Plaga reportada en {lote}: notificar al departamento de sanidad vegetal."),
        "lluvia": ("info", "Lluvia detuvo labores en {lote}."),
        "robo_cana": ("aviso", "Robo de caña reportado en {lote}: avisar a seguridad."),
        "otro": ("info", "Incidente reportado en {lote}."),
    }
    for inc in rep.get("incidentes", []):
        nivel, msg = textos[inc]
        a.append({"tipo": inc, "nivel": nivel, "mensaje": msg.format(lote=lote)})
    return sorted(a, key=lambda x: NIVEL_ORDEN[x["nivel"]])


def tipos_alerta(rep: dict, reportado: str) -> set[str]:
    return {a["tipo"] for a in enriquecer(rep, reportado)["alertas"]}
