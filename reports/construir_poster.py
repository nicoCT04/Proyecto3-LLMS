"""Genera reports/poster.html (póster de la feria) con las métricas de eval/resultados/resumen.csv.

Se abre en el navegador para proyectarlo, o se imprime a PDF (horizontal, sin márgenes) para llevarlo impreso.
    python reports/construir_poster.py
"""
import base64
import csv
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "backend"))
from zafra.extractor import FINAL, ITERACIONES

def incrustar(ruta: Path) -> str:
    """Imagen como data URI: el póster queda en un solo archivo, fácil de compartir e imprimir."""
    return "data:image/png;base64," + base64.b64encode(ruta.read_bytes()).decode()


LOGO = incrustar(RAIZ.parent / "uvg_logo.png")
ARQ = incrustar(AQUI / "arquitectura.png")
MET = incrustar(AQUI / "metricas_iteraciones.png")

filas = list(csv.DictReader(open(RAIZ / "eval" / "resultados" / "resumen.csv", encoding="utf-8")))
test = {f["iteracion"]: {k: (float(v) if k not in ("iteracion", "descripcion", "split") else v)
                         for k, v in f.items()} for f in filas if f["split"] == "test"}
base, ingenuo, final = test["It0"], test["It1"], test[FINAL]

CORTO = {"It0": "Regex, sin LLM (baseline)", "It1": "LLM con prompt simple", "It2": "+ reglas, catálogo y esquema",
         "It3": "+ 4 ejemplos fijos", "It4": "+ 4 ejemplos por embeddings", "It5": "+ validación y autocorrección",
         "It6": "+ prompt v3 (errores de dev)", "It7": "Gemma 4 26B MoE (abierto)", "It8": "Gemini Flash (muestra 18)"}

filas_tabla = "\n".join(
    f"<tr class=\"{'final' if it == FINAL else ''}\"><td>{it}</td><td>{CORTO.get(it, r['descripcion'])}</td>"
    f"<td>{r['f1']:.3f}</td><td>{r['exactitud_nota'] * 100:.0f} %</td><td>{r['f1_alertas']:.3f}</td>"
    f"<td>{r['tasa_alucinacion'] * 100:.1f} %</td><td>{r['latencia_media_s']:.1f}</td><td>{int(r['n'])}</td></tr>"
    for it, r in test.items())

html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Bitácora de Zafra — póster</title>
<style>
@page {{ size: 1600px 1131px; margin: 0; }}
:root {{ --verde:#2e7d5b; --ambar:#c9821f; --azul:#3f6fb0; --rojo:#b3261e; --tinta:#17221c; --tenue:#5b6a61; --fondo:#f4f6f3; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; overflow:hidden; font-family:"Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif; color:var(--tinta); background:var(--fondo); }}
.poster {{ width:1600px; height:1131px; margin:0; padding:34px 40px; display:grid; grid-template-rows:auto 1fr; gap:22px; background:var(--fondo); }}
header {{ display:flex; align-items:center; gap:22px; border-bottom:3px solid var(--verde); padding-bottom:16px; }}
header img {{ height:78px; }}
header h1 {{ margin:0; font-size:46px; letter-spacing:-.02em; }}
header h1 span {{ color:var(--verde); }}
header p {{ margin:4px 0 0; color:var(--tenue); font-size:18px; }}
header .autores {{ margin-left:auto; text-align:right; font-size:16px; color:var(--tenue); }}
header .autores b {{ color:var(--tinta); font-size:18px; }}
.cuerpo {{ display:grid; grid-template-columns:0.95fr 1.45fr 0.85fr; gap:22px; min-height:0; }}
.col {{ display:flex; flex-direction:column; gap:18px; min-height:0; }}
.caja {{ background:#fff; border:1px solid #e0e6df; border-radius:16px; padding:16px 20px; }}
.caja h2 {{ margin:0 0 10px; font-size:21px; color:var(--verde); }}
.caja p, .caja li {{ font-size:15.5px; line-height:1.45; margin:0 0 6px; }}
.caja ul {{ margin:0; padding-left:20px; }}
.nota {{ background:#e9f5e4; border-radius:14px 14px 14px 4px; padding:12px 14px; font-size:15.5px; font-style:italic; margin-bottom:10px; }}
.json {{ font-family:Menlo,Consolas,monospace; font-size:13px; background:#10201a; color:#d6e4dd; border-radius:10px; padding:10px 12px; margin-bottom:10px; white-space:pre; }}
.alerta {{ border-left:5px solid var(--ambar); background:#fff6e0; border-radius:8px; padding:9px 12px; font-size:15px; }}
.alerta b {{ color:var(--ambar); }}
img.ancha {{ width:100%; border-radius:10px; }}
.kpis {{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }}
.kpi {{ background:#fff; border:1px solid #e0e6df; border-radius:14px; padding:12px 14px; }}
.kpi span {{ display:block; font-size:13px; color:var(--tenue); }}
.kpi strong {{ font-size:28px; white-space:nowrap; font-variant-numeric:tabular-nums; }}
.kpi.verde strong {{ color:var(--verde); }} .kpi.rojo strong {{ color:var(--rojo); }}
table {{ width:100%; border-collapse:collapse; font-size:12.5px; margin-top:6px; }}
th {{ text-align:left; color:var(--tenue); font-weight:600; border-bottom:1px solid #e0e6df; padding:4px 5px; }}
td {{ border-bottom:1px solid #eef1ed; padding:2px 5px; font-variant-numeric:tabular-nums; }}
tr.final td {{ background:#fbf1df; font-weight:700; }}
.pie {{ font-size:13px; color:var(--tenue); }}
</style></head>
<body><div class="poster">
<header>
  <img src="{LOGO}" alt="UVG">
  <div><h1>Bitácora de <span>Zafra</span></h1>
  <p>Notas informales de campo → reportes estructurados y alertas de azúcar en riesgo, con un LLM</p></div>
  <div class="autores"><b>Nicolás Concuá · Esteban Cárcamo</b><br>CC3092 Deep Learning y Sistemas Inteligentes<br>Universidad del Valle de Guatemala · noviembre 2026</div>
</header>
<div class="cuerpo">
  <div class="col">
    <div class="caja"><h2>El problema</h2>
      <ul>
        <li>En la zafra, caporales y supervisores reportan la jornada por <b>WhatsApp o audio</b>, con jerga, números en letras y horas coloquiales.</li>
        <li>Alguien los transcribe a mano horas después: la <b>caña quemada que espera</b> pierde sacarosa cada hora sin que nadie lo vea.</li>
        <li><b>Usuario:</b> supervisor de campo y jefe de cosecha de un ingenio de la costa sur de Guatemala.</li>
      </ul></div>
    <div class="caja"><h2>De la nota a la alerta</h2>
      <div class="nota">"ing en el 47 todavía hay 4 jaulas en el patio, se quemaron antier a las 10 de la noche y el ingenio no ha recibido. la cosechadora 2 lleva 3 horas parada"</div>
      <div class="json">{{"lote": "F-47", "cana_pendiente": {{"valor": 4, "unidad": "jaulas"}},
 "quema_dia": "anteayer", "quema_hora": "22:00",
 "paros": [{{"equipo": "cosechadora", "horas": 3}}]}}</div>
      <div class="alerta"><b>AVISO</b> · 100 t de caña quemada hace 44 h sin llegar al ingenio: ~1.05 t de azúcar perdidas; esperar 24 h más cuesta ~0.57 t adicionales.</div>
    </div>
    <div class="caja"><h2>Decisiones clave</h2>
      <ul>
        <li>El LLM <b>solo extrae hechos</b>; conversiones, horas y azúcar perdida se calculan con reglas deterministas.</li>
        <li><b>Few-shot dinámico</b>: embeddings + similitud coseno recuperan las 4 notas más parecidas como ejemplos.</li>
        <li>Salida JSON con <b>esquema estricto</b>, validación contra el catálogo y <b>confirmación humana</b>.</li>
      </ul></div>
    <div class="caja"><h2>Aprendizaje principal</h2>
      <p>Con un prompt ingenuo el LLM salió <b>peor que el regex</b> (F1 {ingenuo['f1']:.2f} vs {base['f1']:.2f}). Lo que lo hizo funcionar no fue un modelo más grande, sino <b>especificar la tarea</b>: reglas, catálogo, esquema y ejemplos recuperados.</p>
      <p class="pie">Repositorio: github.com/nicoCT04/Proyecto3-LLMS</p></div>
  </div>
  <div class="col">
    <div class="caja"><h2>Pipeline</h2><img class="ancha" src="{ARQ}" alt="Diagrama del pipeline"></div>
    <div class="caja"><h2>Resultados por iteración (split test)</h2>
      <img class="ancha" src="{MET}" alt="Métricas por iteración">
      <table><thead><tr><th>It.</th><th>Cambio respecto a la anterior</th><th>F1</th><th>Notas exactas</th><th>F1 alertas</th><th>Alucinación</th><th>Lat. (s)</th><th>n</th></tr></thead>
      <tbody>{filas_tabla}</tbody></table>
      <p class="pie" style="margin:6px 0 0">60 notas propias (dev 20 / test 40) con jerga, números en letras, lotes ambiguos y prompt injection. "Exactas" = todos los campos correctos.</p></div>
  </div>
  <div class="col">
    <div class="kpis">
      <div class="kpi"><span>F1 baseline sin LLM (regex)</span><strong>{base['f1']:.2f}</strong></div>
      <div class="kpi verde"><span>F1 sistema final ({FINAL})</span><strong>{final['f1']:.2f}</strong></div>
      <div class="kpi"><span>Notas 100 % correctas (regex → final)</span><strong>{base['exactitud_nota'] * 100:.0f} → {final['exactitud_nota'] * 100:.0f} %</strong></div>
      <div class="kpi verde"><span>F1 de alertas del sistema final</span><strong>{final['f1_alertas']:.2f}</strong></div>
      <div class="kpi"><span>Latencia media por nota</span><strong>{final['latencia_media_s']:.1f} s</strong></div>
      <div class="kpi"><span>Costo por 1 000 reportes</span><strong>US$ {final['costo_usd_por_1000']:.2f}</strong></div>
    </div>
    <div class="caja"><h2>Límites y riesgos</h2>
      <ul>
        <li>Notas redactadas por el equipo: falta validar con reportes reales de un ingenio.</li>
        <li>Aún fallan las unidades mezcladas ("12 viajes + 3 jaulas").</li>
        <li>Las alertas apoyan la decisión; el supervisor confirma antes de guardar.</li>
        <li>El texto viaja a la API: en producción, acuerdo de datos o modelo local.</li>
      </ul></div>
  </div>
</div>
</div>
<script>
// en pantalla: escalar el lienzo de 1600×1000 para que quepa en la ventana (al imprimir se usa el tamaño real)
function ajustar() {{
  const p = document.querySelector(".poster");
  const k = Math.min(window.innerWidth / 1600, window.innerHeight / 1131);
  p.style.transformOrigin = "top left";
  p.style.transform = k < 1 ? `scale(${{k}})` : "";
  document.body.style.height = k < 1 ? `${{1131 * k}}px` : "";
}}
window.addEventListener("resize", ajustar); ajustar();
window.addEventListener("beforeprint", () => {{ document.querySelector(".poster").style.transform = ""; }});
window.addEventListener("afterprint", ajustar);
</script>
</body></html>
"""
(AQUI / "poster.html").write_text(html, encoding="utf-8")
print("escrito", AQUI / "poster.html")
