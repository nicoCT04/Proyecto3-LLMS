"""Cliente de Gemini con caché en disco, reintentos y registro de tokens/latencia.

La caché (data/cache/llm/*.json) indexa cada llamada por el hash de (modelo, prompt, parámetros):
  - hace reproducibles las métricas (re-ejecutar la evaluación no vuelve a llamar a la API),
  - y sirve de plan B en la feria (ZAFRA_DEMO=1 responde solo desde caché).
"""
import hashlib
import json
import threading
import time
from dataclasses import dataclass, field

from google import genai
from google.genai import types

from . import config

_local = threading.local()


def cliente() -> genai.Client:
    """Un cliente por hilo: el cliente de google-genai no es seguro para compartir entre hilos."""
    if getattr(_local, "cliente", None) is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("Falta GEMINI_API_KEY en el archivo .env")
        _local.cliente = genai.Client(api_key=config.GEMINI_API_KEY)
    return _local.cliente


@dataclass
class Respuesta:
    texto: str
    modelo: str
    tokens_entrada: int = 0
    tokens_salida: int = 0
    tokens_razonamiento: int = 0
    latencia_s: float = 0.0
    desde_cache: bool = False
    intentos: int = 1
    extra: dict = field(default_factory=dict)

    @property
    def costo_usd(self) -> float:
        p = config.PRECIOS.get(self.modelo, {"entrada": 0, "salida": 0})
        salida = self.tokens_salida + self.tokens_razonamiento
        return (self.tokens_entrada * p["entrada"] + salida * p["salida"]) / 1e6


def _clave(*partes) -> str:
    return hashlib.sha256(json.dumps(partes, sort_keys=True, ensure_ascii=False,
                                     default=str).encode()).hexdigest()[:24]


def _reintentable(err: Exception) -> bool:
    texto = str(err)
    if "per day" in texto or "PerDay" in texto:   # cuota diaria agotada: esperar no sirve
        return False
    return any(c in texto for c in ("429", "500", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE",
                                    "INTERNAL", "timed out", "Timeout", "Connection"))


def generar(modelo: str, sistema: str, usuario: str, esquema=None, json_mode: bool = True,
            temperature: float = config.TEMPERATURE, max_reintentos: int = 8,
            usar_cache: bool = True) -> Respuesta:
    carpeta = config.CACHE / "llm"
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre_esquema = getattr(esquema, "__name__", None)
    esquema_json = esquema.model_json_schema() if esquema is not None else None
    clave = _clave(modelo, sistema, usuario, esquema_json, json_mode, temperature,
                   config.TOP_P, config.MAX_TOKENS, config.NIVEL_RAZONAMIENTO)
    ruta = carpeta / f"{clave}.json"
    if usar_cache and ruta.exists():
        d = json.loads(ruta.read_text(encoding="utf-8"))
        return Respuesta(**{**d, "desde_cache": True})
    if config.MODO_DEMO:
        raise RuntimeError("Modo demo: la nota no está en caché y la API está deshabilitada")

    # Gemma no admite instrucciones de sistema ni JSON forzado: va todo en el turno del usuario.
    es_gemma = modelo.startswith("gemma")
    cfg = {"temperature": temperature, "top_p": config.TOP_P, "max_output_tokens": config.MAX_TOKENS}
    if not es_gemma:
        cfg["system_instruction"] = sistema
        # el razonamiento interno cuenta dentro de max_output_tokens; "low" evita JSON truncado
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level=config.NIVEL_RAZONAMIENTO)
        if json_mode:
            cfg["response_mime_type"] = "application/json"
        if esquema is not None:
            cfg["response_schema"] = esquema
    contenido = f"{sistema}\n\n{usuario}" if es_gemma else usuario

    espera = 4.0
    for intento in range(1, max_reintentos + 1):
        t0 = time.perf_counter()
        try:
            r = cliente().models.generate_content(
                model=modelo, contents=contenido, config=types.GenerateContentConfig(**cfg))
            lat = time.perf_counter() - t0
            u = r.usage_metadata
            resp = Respuesta(
                texto=r.text or "", modelo=modelo,
                tokens_entrada=(u.prompt_token_count or 0) if u else 0,
                tokens_salida=(u.candidates_token_count or 0) if u else 0,
                tokens_razonamiento=(getattr(u, "thoughts_token_count", 0) or 0) if u else 0,
                latencia_s=round(lat, 3), intentos=intento,
                extra={"esquema": nombre_esquema})
            ruta.write_text(json.dumps(resp.__dict__, ensure_ascii=False, indent=1), encoding="utf-8")
            return resp
        except Exception as err:  # noqa: BLE001 - la API lanza varios tipos
            if intento == max_reintentos or not _reintentable(err):
                raise
            time.sleep(espera)
            espera = min(espera * 2, 60)
    raise RuntimeError("sin respuesta")


def embeddings(textos: list[str], tarea: str = "SEMANTIC_SIMILARITY") -> list[list[float]]:
    """Embeddings con caché por texto (gemini-embedding-001, truncado a DIM_EMBEDDINGS)."""
    carpeta = config.CACHE / "emb"
    carpeta.mkdir(parents=True, exist_ok=True)
    salida: list[list[float] | None] = [None] * len(textos)
    faltan = []
    for i, t in enumerate(textos):
        ruta = carpeta / f"{_clave(config.MODELO_EMBEDDINGS, config.DIM_EMBEDDINGS, tarea, t)}.json"
        if ruta.exists():
            salida[i] = json.loads(ruta.read_text())
        else:
            faltan.append((i, t, ruta))
    if faltan and config.MODO_DEMO:
        raise RuntimeError("Modo demo: embedding no está en caché")
    for lote in range(0, len(faltan), 50):
        grupo = faltan[lote:lote + 50]
        espera = 4.0
        for intento in range(8):
            try:
                r = cliente().models.embed_content(
                    model=config.MODELO_EMBEDDINGS, contents=[t for _, t, _ in grupo],
                    config=types.EmbedContentConfig(task_type=tarea,
                                                    output_dimensionality=config.DIM_EMBEDDINGS))
                break
            except Exception as err:  # noqa: BLE001
                if intento == 7 or not _reintentable(err):
                    raise
                time.sleep(espera)
                espera = min(espera * 2, 60)
        for (i, _, ruta), e in zip(grupo, r.embeddings):
            salida[i] = list(e.values)
            ruta.write_text(json.dumps(salida[i]))
    return salida  # type: ignore[return-value]
