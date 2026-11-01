"""Bot de Telegram: el caporal manda su nota (texto o audio) y recibe el reporte y las alertas.

Cada nota se guarda en la misma base que la web, así que aparece en el Tablero (sin confirmar).
Usa long polling: corre en la laptop, no necesita URL pública ni abrir puertos.

    cd backend && ../.venv/bin/python bot_telegram.py      # requiere TELEGRAM_TOKEN en .env
"""
import fcntl
import html
import os
import time
from datetime import datetime

import httpx

from zafra import almacen, catalogo, config, transcripcion
from zafra.extractor import FINAL, extraer

TOKEN = os.getenv("TELEGRAM_TOKEN", "")
CONFIG_APP = os.getenv("ZAFRA_CONFIG", FINAL)
API = f"https://api.telegram.org/bot{TOKEN}"
ARCHIVOS = f"https://api.telegram.org/file/bot{TOKEN}"

ICONO = {"critico": "🔴", "aviso": "🟠", "info": "🔵"}
DIA = {"hoy": "hoy", "ayer": "ayer", "anteayer": "anteayer"}

AYUDA = (
    "<b>Bitácora de Zafra</b>\n"
    "Mándeme el reporte de la jornada como lo mandaría al grupo, por texto o por audio. "
    "Yo saco el lote, lo cortado, la quema, los paros y los incidentes, y le aviso si hay azúcar en riesgo.\n\n"
    "Ejemplo:\n<i>en el 47 todavía hay 4 jaulas en el patio, se quemaron antier a las 10 de la noche. "
    "la cosechadora 2 lleva 3 horas parada</i>\n\n"
    "/ejemplo — probar con esa nota"
)
EJEMPLO = ("en el 47 todavía hay 4 jaulas en el patio, se quemaron antier a las 10 de la noche y el ingenio "
           "no ha recibido. la cosechadora 2 lleva 3 horas parada")


def _num(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ") if x == int(x) else f"{x:,.1f}"


def formatear(r: dict) -> str:
    """Resultado del pipeline -> mensaje de Telegram (HTML)."""
    rep, der = r["reporte"], r["derivados"]
    if rep.get("fuera_de_tema"):
        return "Esa nota no parece un reporte de campo. Mándeme lo de la jornada: lote, corte, quema, paros…"
    filas = []
    if rep.get("lote"):
        lote = catalogo.lotes()[rep["lote"]]
        filas.append(f"📍 <b>{rep['lote']}</b> · {html.escape(lote['finca'])}")
    else:
        filas.append("📍 <b>Lote sin identificar</b> — indíquelo para registrarlo bien")
    if rep.get("toneladas_cortadas"):
        corte = f" ({rep['tipo_corte']})" if rep.get("tipo_corte") else ""
        filas.append(f"🌾 Cortado: <b>{_num(rep['toneladas_cortadas'])} t</b>{corte}")
    if rep.get("cortadores"):
        filas.append(f"👷 Cortadores: {rep['cortadores']}")
    if rep.get("quema_dia") and rep.get("quema_hora"):
        horas = der.get("horas_desde_quema")
        extra = f" — hace {horas:.0f} h" if horas is not None else ""
        filas.append(f"🔥 Quema: {DIA[rep['quema_dia']]} {rep['quema_hora']}{extra}")
    if rep.get("cana_pendiente_ton"):
        filas.append(f"🚛 Pendiente de despacho: <b>{_num(rep['cana_pendiente_ton'])} t</b>")
    for p in rep.get("paros", []):
        horas = f" {p['horas']:g} h" if p.get("horas") is not None else ""
        filas.append(f"⛔ Paro: {html.escape(p['equipo'].replace('_', ' '))}{horas}")
    if r["alertas"]:
        filas.append("")
        filas += [f"{ICONO[a['nivel']]} {html.escape(a['mensaje'])}" for a in r["alertas"]]
    if r.get("banderas"):
        filas.append("")
        filas += [f"<i>Revisar: {html.escape(b)}</i>" for b in r["banderas"][:2]]
    return "\n".join(filas)


class Bot:
    def __init__(self):
        self.http = httpx.Client(timeout=40)

    def llamar(self, metodo: str, **datos):
        r = self.http.post(f"{API}/{metodo}", json=datos)
        r.raise_for_status()
        return r.json()["result"]

    def responder(self, chat: int, texto: str):
        self.llamar("sendMessage", chat_id=chat, text=texto, parse_mode="HTML")

    def audio(self, file_id: str) -> bytes:
        ruta = self.llamar("getFile", file_id=file_id)["file_path"]
        return self.http.get(f"{ARCHIVOS}/{ruta}").content

    def procesar(self, msg: dict):
        chat = msg["chat"]["id"]
        texto = (msg.get("text") or "").strip()
        if texto in ("/start", "/ayuda", "/help"):
            return self.responder(chat, AYUDA)
        if texto == "/ejemplo":
            texto = EJEMPLO
        voz = msg.get("voice") or msg.get("audio")
        if voz:
            self.responder(chat, "🎙️ Escuchando el audio…")
            texto = transcripcion.transcribir(self.audio(voz["file_id"]), voz.get("mime_type", "audio/ogg"))
            self.responder(chat, f"🎙️ <i>{html.escape(texto)}</i>")
        if not texto:
            return self.responder(chat, "Mándeme la nota por texto o audio.")
        self.llamar("sendChatAction", chat_id=chat, action="typing")
        reportado = datetime.fromtimestamp(msg["date"]).strftime("%Y-%m-%d %H:%M")
        r = extraer(texto, reportado, CONFIG_APP)
        print(f"{reportado} {'audio' if voz else 'texto'} -> lote {r['reporte'].get('lote')}, "
              f"{len(r['alertas'])} alertas, {r['traza']['latencia_total_s']:.1f} s")
        self.responder(chat, formatear(r))
        if not r["reporte"].get("fuera_de_tema"):
            # sin nombre de la persona: solo el canal (privacidad); queda sin confirmar en el Tablero
            almacen.guardar(texto, reportado, "Telegram", r, confirmado=False)

    def correr(self):
        yo = self.llamar("getMe")
        print(f"Bot @{yo['username']} escuchando ({CONFIG_APP}). Ctrl+C para salir.")
        desde = 0
        while True:
            try:
                for u in self.llamar("getUpdates", offset=desde, timeout=30,
                                     allowed_updates=["message"]):
                    desde = u["update_id"] + 1
                    if "message" not in u:
                        continue
                    try:
                        self.procesar(u["message"])
                    except Exception as err:  # noqa: BLE001 - un mensaje malo no tumba el bot
                        print("error:", err)
                        texto = str(err)
                        aviso = ("Se agotó la cuota del modelo; intente en un momento."
                                 if "429" in texto or "RESOURCE_EXHAUSTED" in texto
                                 else "No pude procesar esa nota, intente de nuevo.")
                        self.responder(u["message"]["chat"]["id"], aviso)
            except httpx.HTTPError as err:
                print("sin conexión con Telegram, reintento:", err)
                time.sleep(5)


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Falta TELEGRAM_TOKEN en .env (créelo con @BotFather)")
    # una sola instancia: dos bots leyendo el mismo token responderían cada mensaje dos veces
    candado = open(config.DATA / ".bot_telegram.lock", "w")
    try:
        fcntl.flock(candado, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("El bot ya está corriendo en otra terminal")
    Bot().correr()
