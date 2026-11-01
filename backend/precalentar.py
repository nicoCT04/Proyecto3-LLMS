"""Deja en caché las notas de ejemplo con la configuración de la app, para el modo demo (ZAFRA_DEMO=1).

    cd backend && ../.venv/bin/python precalentar.py
"""
import json
import os

from zafra import config
from zafra.extractor import FINAL, extraer

CONFIG_APP = os.getenv("ZAFRA_CONFIG", FINAL)

ejemplos = json.loads((config.DATA / "ejemplos_demo.json").read_text(encoding="utf-8"))
for e in ejemplos:
    r = extraer(e["texto"], e["reportado"], CONFIG_APP)
    alertas = ", ".join(a["tipo"] for a in r["alertas"]) or "sin alertas"
    origen = "caché" if r["traza"]["desde_cache"] else "API"
    print(f"[{origen}] {e['titulo']}: lote {r['reporte']['lote']} · {alertas}")
print(f"{len(ejemplos)} ejemplos listos para el modo demo ({CONFIG_APP})")
