"""Pipeline de extracción y configuraciones de cada iteración del proyecto."""
import json
import time
from dataclasses import dataclass

from . import baseline, catalogo, config, llm, postproceso, recuperacion, reglas
from .esquema import Bitacora
from .preproceso import mensaje_usuario, sin_acentos


@dataclass(frozen=True)
class Configuracion:
    id: str
    descripcion: str
    modelo: str | None = None          # None = baseline sin LLM
    prompt: str = "v2_detallado"
    esquema: bool = True               # response_schema estricto
    fewshot: str = "ninguno"           # ninguno | fijo | dinamico
    k: int = 4
    validar: bool = False              # validación contra catálogo + autocorrección del JSON


ITERACIONES = {c.id: c for c in [
    Configuracion("It0", "Baseline sin LLM: expresiones regulares y palabras clave"),
    Configuracion("It1", "Prompt simple, modo JSON sin esquema (zero-shot)",
                  config.MODELO_PRINCIPAL, "v1_simple", esquema=False),
    Configuracion("It2", "Prompt detallado (reglas + catálogo + seguridad) y esquema estricto",
                  config.MODELO_PRINCIPAL),
    Configuracion("It3", "It2 + 4 ejemplos few-shot fijos", config.MODELO_PRINCIPAL, fewshot="fijo"),
    Configuracion("It4", "It2 + 4 ejemplos few-shot elegidos por embeddings (coseno, top-4)",
                  config.MODELO_PRINCIPAL, fewshot="dinamico"),
    Configuracion("It5", "It4 + validación contra catálogo y autocorrección del JSON",
                  config.MODELO_PRINCIPAL, fewshot="dinamico", validar=True),
    Configuracion("It6", "It5 + prompt v3: aclaraciones de lote numérico y tipo de corte (análisis de errores en dev)",
                  config.MODELO_PRINCIPAL, "v3_detallado", fewshot="dinamico", validar=True),
    Configuracion("It7", "Configuración de It6 con un modelo abierto (Gemma 4 26B MoE)",
                  config.MODELO_ABIERTO, "v3_detallado", fewshot="dinamico", validar=True),
    Configuracion("It8", "Configuración de It6 con el modelo grande (gemini-3.5-flash, muestra de 18)",
                  config.MODELO_GRANDE, "v3_detallado", fewshot="dinamico", validar=True),
]}
FINAL = "It6"


def _cantidad_cruda(ton, texto: str):
    """Para los ejemplos few-shot: muestra la cantidad en la unidad que usa la nota."""
    if ton is None:
        return None
    t = sin_acentos(texto).lower()
    for unidad, factor in (("jaulas", 25), ("viajes", 12)):
        if unidad[:-1] in t and ton % factor == 0 and ton > 0 and "+" not in t:
            return {"valor": ton / factor, "unidad": unidad}
    return {"valor": ton, "unidad": "toneladas"}


def gold_a_crudo(ej: dict) -> dict:
    g, texto = ej["gold"], ej["texto"]
    return {
        "fuera_de_tema": g["fuera_de_tema"], "lote": g["lote"], "tipo_corte": g["tipo_corte"],
        "cantidad_cortada": _cantidad_cruda(g["toneladas_cortadas"], texto),
        "cortadores": g["cortadores"], "quema_dia": g["quema_dia"], "quema_hora": g["quema_hora"],
        "cana_pendiente": _cantidad_cruda(g["cana_pendiente_ton"], texto),
        "paros": [{"equipo": p["equipo"], "horas": p["horas"]} for p in g["paros"]],
        "incidentes": [{"tipo": i, "descripcion": i.replace("_", " ")} for i in g["incidentes"]],
    }


def _bloque_ejemplos(ejemplos: list[dict]) -> str:
    partes = ["EJEMPLOS"]
    for e in ejemplos:
        partes.append(f"Entrada:\n{mensaje_usuario(e['texto'], e['reportado'])}\n"
                      f"Salida:\n{json.dumps(gold_a_crudo(e), ensure_ascii=False)}")
    return "\n\n".join(partes)


def construir_sistema(cfg: Configuracion, texto: str) -> tuple[str, list[dict]]:
    base = (config.PROMPTS / f"{cfg.prompt}.txt").read_text(encoding="utf-8")
    sistema = base.replace("{catalogo}", catalogo.contexto_prompt())
    usados: list[dict] = []
    if cfg.fewshot == "fijo":
        ejemplos = recuperacion.fijos()
        usados = [{"id": e["id"], "similitud": None} for e in ejemplos]
    elif cfg.fewshot == "dinamico":
        pares = recuperacion.similares(texto, cfg.k)
        ejemplos = [e for e, _ in pares]
        usados = [{"id": e["id"], "similitud": round(s, 3), "texto": e["texto"]} for e, s in pares]
    else:
        ejemplos = []
    if ejemplos:
        sistema += "\n" + _bloque_ejemplos(ejemplos)
    if cfg.modelo and cfg.modelo.startswith("gemma"):
        claves = (config.PROMPTS / "v1_simple.txt").read_text(encoding="utf-8").splitlines()[1]
        sistema += f"\nClaves del JSON: {claves}\nNo agregues texto fuera del JSON."
    return sistema, usados


def extraer(texto: str, reportado: str, cfg: Configuracion | str = FINAL) -> dict:
    """Corre una nota por el pipeline completo y devuelve el reporte + trazas para la UI/evaluación."""
    if isinstance(cfg, str):
        cfg = ITERACIONES[cfg]
    t0 = time.perf_counter()
    traza = {"config": cfg.id, "modelo": cfg.modelo or "regex", "tokens_entrada": 0,
             "tokens_salida": 0, "tokens_razonamiento": 0, "costo_usd": 0.0, "llamadas": 0,
             "desde_cache": True, "json_valido": True, "autocorreccion": False, "ejemplos": []}

    if cfg.modelo is None:
        rep, banderas = baseline.extraer(texto)
        traza["crudo"] = None
    else:
        sistema, usados = construir_sistema(cfg, texto)
        traza["ejemplos"] = usados
        usuario = mensaje_usuario(texto, reportado)
        esquema = Bitacora if cfg.esquema else None
        r = llm.generar(cfg.modelo, sistema, usuario, esquema=esquema)
        respuestas = [r]
        try:
            crudo = postproceso.parsear_json(r.texto)
        except postproceso.JSONInvalido as err:
            traza["json_valido"] = False
            crudo = {}
            if cfg.validar:
                # autocorrección: una segunda llamada con el error y la respuesta anterior
                traza["autocorreccion"] = True
                r2 = llm.generar(cfg.modelo, sistema,
                                 f"{usuario}\n\nTu respuesta anterior no era JSON válido ({err}). "
                                 f"Respuesta anterior:\n{r.texto[:800]}\nDevuelve solo el JSON corregido.",
                                 esquema=esquema)
                respuestas.append(r2)
                try:
                    crudo = postproceso.parsear_json(r2.texto)
                except postproceso.JSONInvalido:
                    crudo = {}
        rep, banderas = postproceso.normalizar(crudo, validar=cfg.validar, texto=texto)
        if not crudo:
            banderas.insert(0, "El modelo no devolvió un JSON válido; revise la nota manualmente")
        traza["crudo"] = crudo
        for x in respuestas:
            traza["tokens_entrada"] += x.tokens_entrada
            traza["tokens_salida"] += x.tokens_salida
            traza["tokens_razonamiento"] += x.tokens_razonamiento
            traza["costo_usd"] += x.costo_usd
            traza["llamadas"] += 1
            traza["desde_cache"] = traza["desde_cache"] and x.desde_cache
        traza["latencia_api_s"] = round(sum(x.latencia_s for x in respuestas), 3)

    traza["latencia_total_s"] = round(time.perf_counter() - t0, 3)
    enriquecido = reglas.enriquecer(rep, reportado)
    return {"reporte": rep, "derivados": enriquecido["derivados"],
            "alertas": enriquecido["alertas"], "banderas": banderas, "traza": traza}
