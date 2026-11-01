"""Baseline sin LLM: expresiones regulares y listas de palabras clave.

Sirve para responder "¿hacía falta un LLM?": cubre las notas bien formadas pero falla con números en
letras, horas coloquiales, cuadrillas, ambigüedad de lote y mensajes fuera de tema.
"""
import re

from . import catalogo
from .postproceso import normalizar
from .preproceso import limpiar, sin_acentos

NUM = r"(\d+(?:[.,]\d+)?)"
EQUIPOS = {"cosechadora": "cosechadora", "alzadora": "alzadora", "tractor": "tractor",
           "camion": "camion", "bomba": "bomba_riego"}
INCIDENTES = {
    "accidente": ["accident", "lastim", "herid", "se corto", "desmay", "igss", "culebra", "paramedic"],
    "plaga": ["salivazo", "chinche", "barrenador", "rata", "plaga"],
    "incendio_no_programado": ["se nos fue el fuego", "sin autorizacion", "no programad"],
    "lluvia": ["llovio", "lluvia", "aguacero"],
    "robo_cana": ["robaron", "robo"],
}
PALABRAS_CAMPO = ["lote", "cortador", "tonelad", "jaula", "quema", "cosechadora", "alzadora",
                  "corte", "plaga", "llovio", "caña", "cana"]


def _hora(t: str) -> str | None:
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m|p\.?m|de la manana|de la madrugada|"
                  r"de la tarde|de la noche)", t)
    if not m:
        return None
    h, mi, suf = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if suf.startswith("p") or "tarde" in suf or "noche" in suf:
        h = h % 12 + 12
    elif h == 12:
        h = 0
    return f"{h:02d}:{mi:02d}"


def extraer(texto: str) -> tuple[dict, list[str]]:
    t = sin_acentos(limpiar(texto)).lower()
    crudo: dict = {"fuera_de_tema": not any(p in t for p in PALABRAS_CAMPO)}

    m = re.search(r"\b(?:lote|f-?)\s*(\d{1,3})\b", t)
    crudo["lote"] = catalogo.codigo(m.group(1)) if m else None

    m = re.search(NUM + r"\s*(?:t|ton|tons|toneladas)\b", t)
    if m:
        crudo["cantidad_cortada"] = {"valor": m.group(1).replace(",", "."), "unidad": "toneladas"}
    else:
        m = re.search(NUM + r"\s*(jaulas|viajes)", t)
        if m:
            crudo["cantidad_cortada"] = {"valor": m.group(1), "unidad": m.group(2)}

    m = re.search(r"(\d+)\s*cortadores|cortadores:?\s*(\d+)", t)
    if m:
        crudo["cortadores"] = int(m.group(1) or m.group(2))
    if "cosechadora" in t and crudo.get("cantidad_cortada"):
        crudo["tipo_corte"] = "mecanizado"
    elif "cortador" in t or "cuadrilla" in t:
        crudo["tipo_corte"] = "manual"

    if "quem" in t:
        crudo["quema_hora"] = _hora(t[t.index("quem"):])
        tramo = t[t.index("quem"):t.index("quem") + 60]
        if "anteayer" in tramo or "antier" in tramo:
            crudo["quema_dia"] = "anteayer"
        elif "ayer" in tramo or "anoche" in tramo:
            crudo["quema_dia"] = "ayer"
        elif crudo["quema_hora"]:
            crudo["quema_dia"] = "hoy"

    m = re.search(r"quedaron\s+(?:como\s+)?" + NUM + r"\s*(t|ton|toneladas|jaulas)", t)
    if m:
        unidad = "jaulas" if m.group(2) == "jaulas" else "toneladas"
        crudo["cana_pendiente"] = {"valor": m.group(1), "unidad": unidad}

    paros = []
    for clave, eq in EQUIPOS.items():
        if clave in t and re.search(r"par[oa]|fall|arruin|descompu|no arranca|atasc|taller|apag", t):
            m = re.search(clave + r".{0,60}?" + NUM + r"\s*hora", t)
            paros.append({"equipo": eq, "horas": float(m.group(1)) if m else None})
    crudo["paros"] = paros
    crudo["incidentes"] = [tipo for tipo, pals in INCIDENTES.items() if any(p in t for p in pals)]
    return normalizar(crudo)
