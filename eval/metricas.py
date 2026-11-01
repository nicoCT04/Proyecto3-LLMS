"""Métricas de extracción, alertas y operación para Bitácora de Zafra."""
from collections import defaultdict

import numpy as np

from zafra import reglas

CAMPOS = ["lote", "tipo_corte", "toneladas_cortadas", "cortadores", "quema_dia", "quema_hora",
          "cana_pendiente_ton"]
NUMERICOS = {"toneladas_cortadas", "cortadores", "cana_pendiente_ton"}


def igual(campo: str, a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if campo in NUMERICOS or campo == "horas":
        return abs(float(a) - float(b)) <= max(1.0, 0.02 * abs(float(b)))
    return a == b


def _paros_iguales(p, g) -> bool:
    return p["equipo"] == g["equipo"] and igual("horas", p["horas"], g["horas"])


def conteos_caso(pred: dict, gold: dict) -> dict:
    """TP/FP/FN por campo (un valor equivocado cuenta como FP y FN) y banderas por caso."""
    c = defaultdict(lambda: [0, 0, 0])
    inventados = 0
    for campo in CAMPOS:
        p, g = pred.get(campo), gold.get(campo)
        if igual(campo, p, g):
            if g is not None:
                c[campo][0] += 1
        else:
            if p is not None:
                c[campo][1] += 1
                if g is None:
                    inventados += 1
            if g is not None:
                c[campo][2] += 1
    restantes = list(gold.get("paros", []))
    for p in pred.get("paros", []):
        par = next((g for g in restantes if _paros_iguales(p, g)), None)
        if par:
            c["paros"][0] += 1
            restantes.remove(par)
        else:
            c["paros"][1] += 1
            if not any(g["equipo"] == p["equipo"] for g in gold.get("paros", [])):
                inventados += 1
    c["paros"][2] += len(restantes)
    gi, pi = set(gold.get("incidentes", [])), set(pred.get("incidentes", []))
    c["incidentes"][0] += len(gi & pi)
    c["incidentes"][1] += len(pi - gi)
    c["incidentes"][2] += len(gi - pi)
    inventados += len(pi - gi)
    predichos = sum(pred.get(k) is not None for k in CAMPOS) + len(pred.get("paros", [])) + len(pi)
    exacto = all(v[1] == 0 and v[2] == 0 for v in c.values()) and \
        pred.get("fuera_de_tema") == gold.get("fuera_de_tema")
    return {"campos": dict(c), "inventados": inventados, "predichos": predichos, "exacto": exacto}


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 1.0
    r = tp / (tp + fn) if tp + fn else 1.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def resumir(filas: list[dict]) -> dict:
    """filas: [{caso, salida}] -> métricas agregadas de una iteración."""
    tot = defaultdict(lambda: [0, 0, 0])
    alert = [0, 0, 0]
    inventados = predichos = exactos = alert_exactos = 0
    fdt = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    lat, tok_in, tok_out, tok_th, costo, json_ok = [], [], [], [], [], []
    for f in filas:
        caso, sal = f["caso"], f["salida"]
        pred, gold = sal["reporte"], caso["gold"]
        k = conteos_caso(pred, gold)
        for campo, (tp, fp, fn) in k["campos"].items():
            tot[campo][0] += tp
            tot[campo][1] += fp
            tot[campo][2] += fn
        inventados += k["inventados"]
        predichos += k["predichos"]
        exactos += k["exacto"]
        gp, gg = pred.get("fuera_de_tema"), gold["fuera_de_tema"]
        fdt["tp" if gp and gg else "fp" if gp else "fn" if gg else "tn"] += 1
        ap = reglas.tipos_alerta(pred, caso["reportado"])
        ag = reglas.tipos_alerta(gold, caso["reportado"])
        alert[0] += len(ap & ag)
        alert[1] += len(ap - ag)
        alert[2] += len(ag - ap)
        alert_exactos += ap == ag
        t = sal["traza"]
        if t["modelo"] != "regex":
            lat.append(t.get("latencia_api_s", 0))
            tok_in.append(t["tokens_entrada"])
            tok_out.append(t["tokens_salida"])
            tok_th.append(t["tokens_razonamiento"])
            costo.append(t["costo_usd"])
        json_ok.append(t["json_valido"])
    n = len(filas)
    micro = prf(*[sum(v[i] for v in tot.values()) for i in range(3)])
    res = {
        "n": n,
        "precision": micro[0], "recall": micro[1], "f1": micro[2],
        "exactitud_nota": exactos / n,
        "tasa_alucinacion": inventados / predichos if predichos else 0.0,
        "f1_alertas": prf(*alert)[2], "exactitud_alertas": alert_exactos / n,
        "f1_fuera_de_tema": prf(fdt["tp"], fdt["fp"], fdt["fn"])[2],
        "json_valido": float(np.mean(json_ok)),
        "latencia_media_s": float(np.mean(lat)) if lat else 0.0,
        "latencia_p95_s": float(np.percentile(lat, 95)) if lat else 0.0,
        "tokens_entrada_medios": float(np.mean(tok_in)) if tok_in else 0.0,
        "tokens_salida_medios": float(np.mean(tok_out)) if tok_out else 0.0,
        "tokens_razonamiento_medios": float(np.mean(tok_th)) if tok_th else 0.0,
        "costo_usd_por_1000": float(np.mean(costo)) * 1000 if costo else 0.0,
    }
    for campo, v in tot.items():
        res[f"f1_{campo}"] = prf(*v)[2]
    return res
