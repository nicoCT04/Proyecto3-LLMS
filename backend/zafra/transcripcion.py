"""Audio -> texto con el modelo pequeño de Gemini (entrada multimodal). Lo usan la web y el bot de Telegram."""
from google.genai import types

from . import config, llm

TAMANO_MAXIMO = 8 * 1024 * 1024   # ~1 minuto de audio


def transcribir(datos: bytes, mime: str) -> str:
    if config.MODO_DEMO:
        raise RuntimeError("La transcripción no está disponible en modo demo")
    if len(datos) > TAMANO_MAXIMO:
        raise ValueError("El audio es demasiado largo (máx. ~1 minuto)")
    r = llm.cliente().models.generate_content(
        model=config.MODELO_PEQUENO,
        contents=[types.Part.from_bytes(data=datos, mime_type=mime),
                  "Transcribe literalmente este audio en español de Guatemala. "
                  "Devuelve solo la transcripción, sin comentarios."],
        config=types.GenerateContentConfig(temperature=0))
    return (r.text or "").strip()
