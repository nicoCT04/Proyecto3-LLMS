"""Esquemas de datos: salida cruda del LLM y reporte normalizado."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Equipo = Literal["cosechadora", "alzadora", "tractor", "camion", "jaula", "bomba_riego", "otro"]
TipoIncidente = Literal["accidente", "plaga", "incendio_no_programado", "lluvia", "robo_cana", "otro"]


class Cantidad(BaseModel):
    valor: float
    unidad: Literal["toneladas", "jaulas", "viajes"]


class Paro(BaseModel):
    equipo: Equipo
    horas: Optional[float] = Field(None, description="Horas detenido; null si la nota no lo dice")
    causa: Optional[str] = None


class Incidente(BaseModel):
    tipo: TipoIncidente
    descripcion: str


class Bitacora(BaseModel):
    """Lo que el LLM debe devolver (esquema estricto, response_schema de Gemini)."""
    fuera_de_tema: bool
    lote: Optional[str] = Field(None, description="Código F-NN; null si no hay un único lote claro")
    tipo_corte: Optional[Literal["manual", "mecanizado"]] = None
    cantidad_cortada: Optional[Cantidad] = None
    cortadores: Optional[int] = None
    quema_dia: Optional[Literal["hoy", "ayer", "anteayer"]] = None
    quema_hora: Optional[str] = Field(None, description="HH:MM en formato 24 h")
    cana_pendiente: Optional[Cantidad] = None
    paros: list[Paro] = []
    incidentes: list[Incidente] = []
    resumen: Optional[str] = Field(None, description="Una frase en español para el jefe de cosecha")


CAMPOS_ESCALARES = ["fuera_de_tema", "lote", "tipo_corte", "toneladas_cortadas", "cortadores",
                    "quema_dia", "quema_hora", "cana_pendiente_ton"]
