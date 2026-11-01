"""API de Bitácora de Zafra (FastAPI). Sirve también el frontend compilado (frontend/dist).

    cd backend && ../.venv/bin/uvicorn app:app --port 8000
"""
import csv
import json
import os
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from zafra import almacen, catalogo, config, reglas, transcripcion
from zafra.extractor import FINAL, ITERACIONES, extraer

CONFIG_APP = os.getenv("ZAFRA_CONFIG", FINAL)
DIST = config.RAIZ / "frontend" / "dist"

app = FastAPI(title="Bitácora de Zafra")


class Nota(BaseModel):
    texto: str = Field(..., min_length=1, max_length=config.LARGO_MAXIMO_NOTA * 2)
    reportado: str | None = None


class Guardar(BaseModel):
    texto: str
    reportado: str
    reporte: dict
    autor: str | None = None
    traza: dict = {}
    confirmado: bool = True


def _ahora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _validar_fecha(valor: str | None) -> str:
    if not valor:
        return _ahora()
    try:
        return datetime.fromisoformat(valor.replace("T", " ")).strftime("%Y-%m-%d %H:%M")
    except ValueError as err:
        raise HTTPException(422, f"Fecha inválida: {valor}") from err


@app.get("/api/salud")
def salud():
    cfg = ITERACIONES[CONFIG_APP]
    return {"ok": True, "config": cfg.id, "descripcion": cfg.descripcion, "modelo": cfg.modelo,
            "modo_demo": config.MODO_DEMO, "lotes": len(catalogo.lotes())}


@app.post("/api/extraer")
def api_extraer(nota: Nota):
    reportado = _validar_fecha(nota.reportado)
    try:
        return {"reportado": reportado, **extraer(nota.texto, reportado, CONFIG_APP)}
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    except Exception as err:  # noqa: BLE001 - errores de la API externa
        texto = str(err)
        if "429" in texto or "RESOURCE_EXHAUSTED" in texto:
            raise HTTPException(429, "Se agotó la cuota del modelo; intente en un momento.") from err
        raise HTTPException(502, f"El modelo no respondió: {texto[:200]}") from err


@app.post("/api/recalcular")
def api_recalcular(datos: Guardar):
    """Recalcula derivados y alertas cuando el usuario corrige un campo a mano."""
    rep = dict(datos.reporte)
    rep["lote"] = rep.get("lote") if catalogo.existe(rep.get("lote")) else None
    enr = reglas.enriquecer(rep, _validar_fecha(datos.reportado))
    return {"reporte": rep, "derivados": enr["derivados"], "alertas": enr["alertas"]}


@app.post("/api/reportes")
def api_guardar(datos: Guardar):
    reportado = _validar_fecha(datos.reportado)
    rep = dict(datos.reporte)
    enr = reglas.enriquecer(rep, reportado)
    id_ = almacen.guardar(datos.texto, reportado, datos.autor,
                          {"reporte": rep, "derivados": enr["derivados"], "alertas": enr["alertas"],
                           "traza": datos.traza}, datos.confirmado)
    return {"id": id_}


@app.get("/api/reportes")
def api_listar():
    return almacen.listar()


@app.delete("/api/reportes/{id_}")
def api_borrar(id_: int):
    almacen.borrar(id_)
    return {"ok": True}


@app.get("/api/catalogo")
def api_catalogo():
    return catalogo.cargar()


@app.get("/api/ejemplos")
def api_ejemplos():
    """Notas del banco few-shot para que un visitante pruebe con un clic (no son casos de evaluación)."""
    with open(config.DATA / "ejemplos_demo.json", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/metricas")
def api_metricas():
    ruta = config.RAIZ / "eval" / "resultados" / "resumen.csv"
    if not ruta.exists():
        return []
    with open(ruta, encoding="utf-8") as f:
        return [{k: (float(v) if k not in ("iteracion", "descripcion", "split") else v)
                 for k, v in fila.items()} for fila in csv.DictReader(f)]


@app.post("/api/transcribir")
async def api_transcribir(audio: UploadFile = File(...)):
    """Audio del celular -> texto, con el modelo pequeño de Gemini (entrada multimodal)."""
    datos = await audio.read()
    mime = (audio.content_type or "audio/webm").split(";")[0]
    try:
        return {"texto": transcripcion.transcribir(datos, mime)}
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    except ValueError as err:
        raise HTTPException(413, str(err)) from err
    except Exception as err:  # noqa: BLE001
        raise HTTPException(502, f"No se pudo transcribir: {str(err)[:200]}") from err


if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{ruta:path}")
    def spa(ruta: str):
        archivo = DIST / ruta
        if ruta and archivo.is_file():
            return FileResponse(archivo)
        return FileResponse(DIST / "index.html")
