"""Catálogo de lotes (derivado de la base del servidor sugarmill)."""
import json
import re
from functools import lru_cache

from .config import DATA


@lru_cache
def cargar() -> dict:
    return json.loads((DATA / "catalogo_lotes.json").read_text(encoding="utf-8"))


@lru_cache
def lotes() -> dict[str, dict]:
    return {l["lote"]: l for l in cargar()["lotes"]}


def codigo(valor) -> str | None:
    """Lleva '14', 'lote 14', 'F14', 'f-14' a 'F-14' (sin validar existencia)."""
    if valor is None:
        return None
    m = re.search(r"(\d{1,3})", str(valor))
    return f"F-{int(m.group(1)):02d}" if m else None


def existe(cod: str | None) -> bool:
    return cod is not None and cod in lotes()


def fincas_con_lotes() -> dict[str, list[str]]:
    resultado: dict[str, list[str]] = {}
    for l in cargar()["lotes"]:
        resultado.setdefault(l["finca"], []).append(l["lote"])
    return resultado


def contexto_prompt() -> str:
    """Resumen compacto del catálogo que se inyecta en el prompt detallado (~250 tokens)."""
    c = cargar()
    lineas = [f"Lotes válidos: F-01 a F-{len(c['lotes']):02d}. "
              f"1 jaula = {c['toneladas_por_jaula']} t; 1 viaje de camión = {c['toneladas_por_viaje_camion']} t.",
              "Fincas y sus lotes (nombrar solo la finca es ambiguo):"]
    for finca, ls in fincas_con_lotes().items():
        lineas.append(f"- {finca}: {', '.join(ls)}")
    return "\n".join(lineas)
