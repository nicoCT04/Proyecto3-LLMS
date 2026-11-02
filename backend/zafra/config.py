"""Rutas, constantes del dominio y parámetros de los modelos."""
import os
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[2]          # Proyecto3-LLMS/
DATA = RAIZ / "data"
CACHE = DATA / "cache"
PROMPTS = Path(__file__).resolve().parent / "prompts"

load_dotenv(RAIZ / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# El tier gratuito de la API limita gemini-3.5-flash a 20 solicitudes/día, así que el modelo de trabajo
# es flash-lite y el modelo grande se evalúa solo sobre una muestra.
MODELO_PRINCIPAL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
MODELO_GRANDE = "gemini-3.5-flash"
MODELO_PEQUENO = "gemini-3.5-flash-lite"            # también transcribe el audio
MODELO_ABIERTO = "gemma-4-26b-a4b-it"               # pesos abiertos (Gemma), servido por la misma API
MODELO_EMBEDDINGS = "gemini-embedding-001"
DIM_EMBEDDINGS = 768                                 # truncado Matryoshka (3072 -> 768)

# Modo demo: si no hay red o la API falla, se responde solo con la caché en disco.
MODO_DEMO = os.getenv("ZAFRA_DEMO", "0") == "1"

# Precios de referencia (USD por millón de tokens). Verificar contra la página oficial de precios
# de Gemini antes de reportar; se usan para estimar el costo por reporte.
PRECIOS = {
    "gemini-3.5-flash": {"entrada": 0.30, "salida": 2.50},
    "gemini-3.5-flash-lite": {"entrada": 0.10, "salida": 0.40},
    "gemma-4-26b-a4b-it": {"entrada": 0.0, "salida": 0.0},
    "gemini-embedding-001": {"entrada": 0.15, "salida": 0.0},
}

# Parámetros de generación (iguales en todas las iteraciones salvo que se indique)
TEMPERATURE = 0.0
TOP_P = 0.95
MAX_TOKENS = 2048
NIVEL_RAZONAMIENTO = "low"           # razonamiento interno de Gemini 3.x (minimal | low | medium | high)

# Dominio azucarero (mismas fórmulas del servidor sugarmill del proyecto de redes)
TONELADAS_POR_UNIDAD = {"toneladas": 1.0, "jaulas": 25.0, "viajes": 12.0}
EFICIENCIA_RECUPERACION = 0.88     # KATC = pol * 10 * eficiencia  (kg de azúcar por tonelada)
PERDIDA_POL_POR_HORA = 0.002       # pérdida relativa de pol por hora entre quema y molienda
UMBRAL_QUEMA_HORAS = 24            # caña quemada sin moler: aviso
UMBRAL_QUEMA_CRITICO = 48          # caña quemada sin moler: crítico
UMBRAL_PARO_HORAS = 2              # paro de equipo que se considera largo
LARGO_MAXIMO_NOTA = 1500           # caracteres; protege la ventana de contexto
# En el tier gratuito, de vez en cuando una solicitud se queda en cola casi un minuto: se corta y se reintenta
TIEMPO_MAXIMO_S = 15                # Gemma (abierto, más lento) usa 8 veces esto
