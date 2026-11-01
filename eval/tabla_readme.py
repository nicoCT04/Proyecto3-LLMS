"""Actualiza la tabla de resultados del README (entre <!-- RESULTADOS --> y <!-- /RESULTADOS -->)."""
import csv
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
filas = [f for f in csv.DictReader(open(RAIZ / "eval" / "resultados" / "resumen.csv", encoding="utf-8"))
         if f["split"] == "test"]
lineas = ["| It. | Cambio | n | F1 | Notas exactas | F1 alertas | Alucinación | Latencia (s) | US$ / 1000 |",
          "|---|---|---|---|---|---|---|---|---|"]
for f in filas:
    v = {k: float(x) for k, x in f.items() if k not in ("iteracion", "descripcion", "split")}
    lineas.append(f"| {f['iteracion']} | {f['descripcion']} | {int(v['n'])} | {v['f1']:.3f} | "
                  f"{v['exactitud_nota'] * 100:.0f} % | {v['f1_alertas']:.3f} | {v['tasa_alucinacion'] * 100:.1f} % | "
                  f"{v['latencia_media_s']:.2f} | {v['costo_usd_por_1000']:.2f} |")
readme = RAIZ / "README.md"
texto = readme.read_text(encoding="utf-8")
nuevo = re.sub(r"<!-- RESULTADOS -->.*?<!-- /RESULTADOS -->",
               "<!-- RESULTADOS -->\n" + "\n".join(lineas) + "\n<!-- /RESULTADOS -->", texto, flags=re.DOTALL)
readme.write_text(nuevo, encoding="utf-8")
print("\n".join(lineas))
