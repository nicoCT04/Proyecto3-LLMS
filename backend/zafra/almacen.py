"""Persistencia de reportes en SQLite (data/bitacora.db)."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime

from .config import DATA

RUTA = DATA / "bitacora.db"

ESQUEMA = """
CREATE TABLE IF NOT EXISTS reportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creado TEXT NOT NULL,
    reportado TEXT NOT NULL,
    autor TEXT,
    texto TEXT NOT NULL,
    lote TEXT,
    toneladas REAL,
    pendiente REAL,
    azucar_perdida REAL,
    nivel_max TEXT,
    reporte_json TEXT NOT NULL,
    alertas_json TEXT NOT NULL,
    traza_json TEXT NOT NULL,
    confirmado INTEGER DEFAULT 0
);
-- cierre de alertas por el jefe de cosecha (la alerta no se borra: queda el registro de quién la cerró y por qué)
CREATE TABLE IF NOT EXISTS resoluciones (
    reporte_id INTEGER NOT NULL,
    indice INTEGER NOT NULL,
    resuelta TEXT NOT NULL,
    nota TEXT,
    PRIMARY KEY (reporte_id, indice)
);
"""


@contextmanager
def conexion():
    con = sqlite3.connect(RUTA)
    con.row_factory = sqlite3.Row
    try:
        con.executescript(ESQUEMA)
        yield con
        con.commit()
    finally:
        con.close()


def guardar(texto: str, reportado: str, autor: str | None, resultado: dict, confirmado: bool) -> int:
    rep, der, alertas = resultado["reporte"], resultado["derivados"], resultado["alertas"]
    nivel = alertas[0]["nivel"] if alertas else None
    traza = {k: v for k, v in resultado["traza"].items() if k != "crudo"}
    with conexion() as con:
        cur = con.execute(
            "INSERT INTO reportes (creado, reportado, autor, texto, lote, toneladas, pendiente, "
            "azucar_perdida, nivel_max, reporte_json, alertas_json, traza_json, confirmado) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (datetime.now().isoformat(timespec="seconds"), reportado, autor, texto, rep.get("lote"),
             rep.get("toneladas_cortadas"), rep.get("cana_pendiente_ton"), der.get("azucar_perdida_t"),
             nivel, json.dumps({**rep, "derivados": der}, ensure_ascii=False),
             json.dumps(alertas, ensure_ascii=False), json.dumps(traza, ensure_ascii=False),
             int(confirmado)))
        return cur.lastrowid


def _fila(r: sqlite3.Row) -> dict:
    d = dict(r)
    for k in ("reporte_json", "alertas_json", "traza_json"):
        d[k.replace("_json", "")] = json.loads(d.pop(k))
    return d


def listar(limite: int = 200) -> list[dict]:
    with conexion() as con:
        filas = con.execute("SELECT * FROM reportes ORDER BY reportado DESC, id DESC LIMIT ?",
                            (limite,)).fetchall()
        cierres = {(c["reporte_id"], c["indice"]): c for c in con.execute("SELECT * FROM resoluciones")}
    salida = [_fila(r) for r in filas]
    for r in salida:
        for i, a in enumerate(r["alertas"]):
            c = cierres.get((r["id"], i))
            a.update(indice=i, resuelta=c["resuelta"] if c else None, nota_cierre=c["nota"] if c else None)
    return salida


def resolver(id_: int, indice: int, nota: str | None) -> None:
    with conexion() as con:
        con.execute("INSERT OR REPLACE INTO resoluciones VALUES (?,?,?,?)",
                    (id_, indice, datetime.now().isoformat(timespec="seconds"), nota or None))


def reabrir(id_: int, indice: int) -> None:
    with conexion() as con:
        con.execute("DELETE FROM resoluciones WHERE reporte_id = ? AND indice = ?", (id_, indice))


def borrar(id_: int) -> None:
    with conexion() as con:
        con.execute("DELETE FROM reportes WHERE id = ?", (id_,))
        con.execute("DELETE FROM resoluciones WHERE reporte_id = ?", (id_,))


def vaciar() -> None:
    with conexion() as con:
        con.execute("DELETE FROM reportes")
        con.execute("DELETE FROM resoluciones")
