"""Preprocesamiento de la nota antes de llegar al LLM."""
import re
import unicodedata
from datetime import datetime

from .config import LARGO_MAXIMO_NOTA

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def limpiar(texto: str) -> str:
    """Normaliza Unicode, quita caracteres de control, colapsa espacios y recorta el largo."""
    texto = unicodedata.normalize("NFC", texto or "")
    texto = "".join(c for c in texto if c in "\n\t" or unicodedata.category(c)[0] != "C")
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto).strip()
    return texto[:LARGO_MAXIMO_NOTA]


def neutralizar(texto: str) -> str:
    """Evita que la nota cierre el delimitador <nota> (defensa básica contra prompt injection)."""
    return texto.replace("<", "‹").replace(">", "›")


def mensaje_usuario(texto: str, reportado: str) -> str:
    dt = datetime.fromisoformat(reportado)
    return (f"Fecha y hora del reporte: {reportado} ({DIAS[dt.weekday()]})\n"
            f"<nota>\n{neutralizar(limpiar(texto))}\n</nota>")


def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
