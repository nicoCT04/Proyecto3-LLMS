"""Corre las iteraciones sobre el conjunto de evaluación y guarda resultados y resumen.

Uso (desde la raíz del proyecto):
    python eval/evaluar.py                     # todas las iteraciones, todos los casos
    python eval/evaluar.py --it It0 It6        # solo algunas
    python eval/evaluar.py --split dev         # solo el split de desarrollo

Las llamadas al LLM quedan en data/cache/, así que re-ejecutar reproduce las mismas métricas sin costo.
"""
import argparse
import csv
import hashlib
import json
import sys
import time
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend"))
sys.path.insert(0, str(RAIZ / "eval"))

from metricas import resumir
from zafra import config
from zafra.extractor import ITERACIONES, construir_sistema

SALIDA = RAIZ / "eval" / "resultados"


def cargar_casos(split: str) -> list[dict]:
    with open(RAIZ / "data" / "eval_set.jsonl", encoding="utf-8") as f:
        casos = [json.loads(l) for l in f]
    return casos if split == "all" else [c for c in casos if c["split"] == split]


def correr(it: str, casos: list[dict], hilos: int) -> list[dict]:
    from zafra.extractor import extraer
    cfg = ITERACIONES[it]

    def uno(caso):
        try:
            salida = extraer(caso["texto"], caso["reportado"], cfg)
        except Exception as err:
            salida = {"reporte": {"fuera_de_tema": False, "paros": [], "incidentes": []},
                      "alertas": [], "banderas": [f"error: {err}"],
                      "traza": {"config": it, "modelo": cfg.modelo or "regex", "tokens_entrada": 0,
                                "tokens_salida": 0, "tokens_razonamiento": 0, "costo_usd": 0.0,
                                "json_valido": False, "latencia_api_s": 0.0, "error": str(err)}}
        return {"caso": caso, "salida": salida}

    with ThreadPoolExecutor(max_workers=1 if cfg.modelo is None else hilos) as ex:
        return list(ex.map(uno, casos))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--it", nargs="*", default=list(ITERACIONES))
    ap.add_argument("--split", default="all", choices=["all", "dev", "test"])
    ap.add_argument("--hilos", type=int, default=4)
    ap.add_argument("--muestra", type=int, default=0,
                    help="evaluar solo N casos espaciados uniformemente (para modelos con cuota diaria baja)")
    args = ap.parse_args()

    SALIDA.mkdir(parents=True, exist_ok=True)
    casos = cargar_casos(args.split)
    if args.muestra and args.muestra < len(casos):
        casos = [casos[round(i * len(casos) / args.muestra)] for i in range(args.muestra)]
    for it in args.it:
        t0 = time.time()
        filas = correr(it, casos, args.hilos)
        errores = sum("error" in f["salida"]["traza"] for f in filas)
        with open(SALIDA / f"{it}.jsonl", "w", encoding="utf-8") as f:
            for fila in filas:
                f.write(json.dumps(fila, ensure_ascii=False) + "\n")
        cfg = ITERACIONES[it]
        resumen_split = {}
        for sp in ("dev", "test", "all"):
            sub = [f for f in filas if sp == "all" or f["caso"]["split"] == sp]
            if sub:
                resumen_split[sp] = resumir(sub)
        prompt_hash = ""
        if cfg.modelo:
            sistema, _ = construir_sistema(replace(cfg, fewshot="ninguno"), "")
            prompt_hash = hashlib.sha256(sistema.encode()).hexdigest()[:10]
        with open(SALIDA / "registro.csv", "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if f.tell() == 0:
                w.writerow(["fecha", "iteracion", "modelo", "prompt", "esquema", "fewshot", "k",
                            "validar", "prompt_hash", "temperature", "top_p", "max_tokens",
                            "split", "f1", "exactitud_nota", "f1_alertas", "errores"])
            for sp, r in resumen_split.items():
                w.writerow([datetime.now().isoformat(timespec="seconds"), it, cfg.modelo or "regex",
                            cfg.prompt if cfg.modelo else "", cfg.esquema, cfg.fewshot, cfg.k,
                            cfg.validar, prompt_hash, config.TEMPERATURE, config.TOP_P,
                            config.MAX_TOKENS, sp, round(r["f1"], 4), round(r["exactitud_nota"], 4),
                            round(r["f1_alertas"], 4), errores])
        r = resumen_split.get("test") or resumen_split["all"]
        print(f"{it}: F1={r['f1']:.3f} exact={r['exactitud_nota']:.2f} alertas={r['f1_alertas']:.3f} "
              f"aluc={r['tasa_alucinacion']:.3f} lat={r['latencia_media_s']:.2f}s errores={errores} "
              f"({time.time() - t0:.0f}s)", flush=True)

    filas_csv = []
    for it in ITERACIONES:
        ruta = SALIDA / f"{it}.jsonl"
        if not ruta.exists():
            continue
        filas = [json.loads(l) for l in open(ruta, encoding="utf-8")]
        for sp in ("dev", "test", "all"):
            sub = [f for f in filas if sp == "all" or f["caso"]["split"] == sp]
            if sub:
                filas_csv.append({"iteracion": it, "descripcion": ITERACIONES[it].descripcion,
                                  "split": sp, **{k: round(v, 4) for k, v in resumir(sub).items()}})
    with open(SALIDA / "resumen.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas_csv[0]))
        w.writeheader()
        w.writerows(filas_csv)


if __name__ == "__main__":
    main()
