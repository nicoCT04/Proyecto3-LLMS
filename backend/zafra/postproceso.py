"""Del JSON crudo del LLM al reporte normalizado (mismo formato que la respuesta de referencia)."""
import json
import re
from typing import Any

from . import catalogo, config
from .preproceso import sin_acentos

EQUIPOS = {"cosechadora", "alzadora", "tractor", "camion", "jaula", "bomba_riego", "otro"}
INCIDENTES = {"accidente", "plaga", "incendio_no_programado", "lluvia", "robo_cana", "otro"}


class JSONInvalido(ValueError):
    pass


UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
            "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte",
            "veintiuno", "veintidos", "veintitres", "veinticuatro", "veinticinco", "veintiseis", "veintisiete",
            "veintiocho", "veintinueve"]
DECENAS = {30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta", 70: "setenta", 80: "ochenta",
           90: "noventa"}


def numero_en_letras(n: int) -> str:
    if n < 30:
        return UNIDADES[n]
    d, u = n // 10 * 10, n % 10
    return DECENAS[d] + (f" y {UNIDADES[u]}" if u else "")


def lote_en_texto(cod: str, texto: str) -> bool:
    """¿La nota menciona el número del lote (en dígitos o en letras)? Evita lotes inferidos de la finca."""
    n = int(cod[2:])
    t = sin_acentos(texto).lower()
    # el número no debe ser parte de otra cifra, hora o decimal ("4:30", "8.5", "120")
    return bool(re.search(rf"(?<!\d)(?<!\d[.,:])0?{n}(?!\d)(?![.,:]\d)", t)) or \
        re.search(rf"\b{numero_en_letras(n)}\b", t) is not None


def parsear_json(texto: str) -> dict:
    """Acepta JSON puro o envuelto en ```json ... ``` / con texto alrededor."""
    t = texto.strip()
    t = re.sub(r"^```(?:json)?|```$", "", t, flags=re.MULTILINE).strip()
    try:
        d = json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, flags=re.DOTALL)
        if not m:
            raise JSONInvalido("la respuesta no contiene un objeto JSON")
        try:
            d = json.loads(m.group(0))
        except json.JSONDecodeError as err:
            raise JSONInvalido(str(err)) from err
    if isinstance(d, list) and d and isinstance(d[0], dict):
        d = d[0]
    if not isinstance(d, dict):
        raise JSONInvalido("el JSON no es un objeto")
    return d


def _num(v) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(v))
    return float(m.group(0).replace(",", ".")) if m else None


def _toneladas(v) -> float | None:
    """{'valor': 18, 'unidad': 'jaulas'} -> 450.0 ; también acepta un número suelto."""
    if v is None:
        return None
    if isinstance(v, dict):
        valor = _num(v.get("valor"))
        unidad = sin_acentos(str(v.get("unidad") or "toneladas")).lower()
        if valor is None:
            return None
        for clave, factor in config.TONELADAS_POR_UNIDAD.items():
            if unidad.startswith(clave[:5]):
                return round(valor * factor, 2)
        return valor
    return _num(v)


def _hora(v) -> str | None:
    if not v:
        return None
    m = re.match(r"^\s*(\d{1,2})(?::(\d{2}))?\s*$", str(v))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def _texto_enum(v, permitidos: set[str]) -> str | None:
    if v is None:
        return None
    t = sin_acentos(str(v)).lower().strip().replace(" ", "_")
    return t if t in permitidos else None


def normalizar(crudo: dict[str, Any], validar: bool = False,
               texto: str | None = None) -> tuple[dict, list[str]]:
    """Devuelve (reporte_normalizado, banderas). `validar` activa los chequeos de la iteración final."""
    banderas: list[str] = []
    fdt = bool(crudo.get("fuera_de_tema", False))
    paros = []
    for p in crudo.get("paros") or []:
        if isinstance(p, dict):
            eq = _texto_enum(p.get("equipo"), EQUIPOS) or "otro"
            paros.append({"equipo": eq, "horas": _num(p.get("horas"))})
    incidentes = set()
    for i in crudo.get("incidentes") or []:
        tipo = i.get("tipo") if isinstance(i, dict) else i
        t = _texto_enum(tipo, INCIDENTES)
        if t:
            incidentes.add(t)

    rep = {
        "fuera_de_tema": fdt,
        "lote": catalogo.codigo(crudo.get("lote")),
        "tipo_corte": _texto_enum(crudo.get("tipo_corte"), {"manual", "mecanizado"}),
        "toneladas_cortadas": _toneladas(crudo.get("cantidad_cortada", crudo.get("toneladas_cortadas"))),
        "cortadores": None,
        "quema_dia": _texto_enum(crudo.get("quema_dia"), {"hoy", "ayer", "anteayer"}),
        "quema_hora": _hora(crudo.get("quema_hora")),
        "cana_pendiente_ton": _toneladas(crudo.get("cana_pendiente", crudo.get("cana_pendiente_ton"))),
        "paros": paros,
        "incidentes": sorted(incidentes),
    }
    c = _num(crudo.get("cortadores"))
    rep["cortadores"] = int(c) if c is not None else None

    if validar:
        if rep["lote"] and not catalogo.existe(rep["lote"]):
            banderas.append(f"El lote {rep['lote']} no existe en el catálogo; se dejó vacío")
            rep["lote"] = None
        if rep["lote"] and texto is not None and not lote_en_texto(rep["lote"], texto):
            banderas.append(f"El modelo propuso {rep['lote']}, pero la nota no menciona ese número; se dejó vacío")
            rep["lote"] = None
        for campo, maximo in (("toneladas_cortadas", 3000), ("cana_pendiente_ton", 3000)):
            v = rep[campo]
            if v is not None and not (0 <= v <= maximo):
                banderas.append(f"{campo}={v} fuera de rango plausible; se dejó vacío")
                rep[campo] = None
        if rep["cortadores"] is not None and not (0 <= rep["cortadores"] <= 400):
            banderas.append(f"cortadores={rep['cortadores']} fuera de rango; se dejó vacío")
            rep["cortadores"] = None
        if crudo.get("quema_hora") and rep["quema_hora"] is None:
            banderas.append(f"Hora de quema '{crudo.get('quema_hora')}' no reconocida")

    if fdt:
        rep.update({k: None for k in ("lote", "tipo_corte", "toneladas_cortadas", "cortadores",
                                      "quema_dia", "quema_hora", "cana_pendiente_ton")})
        rep["paros"], rep["incidentes"] = [], []
    elif not rep["lote"]:
        banderas.append("No se identificó un único lote: confirme el lote antes de guardar")
    return rep, banderas
