"""Dibuja reports/arquitectura.png (diagrama del pipeline para el informe y la presentación)."""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

VERDE, AMBAR, AZUL, GRIS, TINTA = "#2e7d5b", "#c9821f", "#3f6fb0", "#eef2ec", "#17221c"

CAJAS = [
    (0.6, 3.0, "Nota de campo", "texto de WhatsApp\no audio", GRIS),
    (2.9, 3.0, "Transcripción", "Gemini multimodal\n(audio → texto)", GRIS),
    (5.2, 3.0, "Preprocesamiento", "NFC · ≤1500 caract.\ndelimitadores <nota>", GRIS),
    (7.5, 3.0, "Recuperación", "embedding 768 d\ncoseno · top-4 ejemplos", AZUL),
    (9.8, 3.0, "Prompt", "reglas + catálogo\n+ ejemplos + nota", AZUL),
    (9.8, 1.2, "LLM", "gemini-3.5-flash-lite\nJSON con esquema", AMBAR),
    (7.5, 1.2, "Validación", "Pydantic · catálogo\nrangos · autocorrección", VERDE),
    (5.2, 1.2, "Reglas del ingenio", "horas desde quema · KATC\nazúcar en riesgo · alertas", VERDE),
    (2.9, 1.2, "Confirmación", "el supervisor corrige\ncampos dudosos", GRIS),
    (0.6, 1.2, "Tablero", "SQLite → KPIs,\nalertas, CSV", GRIS),
]
W, H = 2.0, 1.15


def main() -> None:
    fig, ax = plt.subplots(figsize=(12.5, 4.6))
    ax.set_xlim(-0.6, 11.4)
    ax.set_ylim(0.2, 4.3)
    ax.axis("off")
    centros = []
    for x, y, t, d, borde in CAJAS:
        ax.add_patch(FancyBboxPatch((x - W / 2, y - H / 2), W, H, boxstyle="round,pad=0.02,rounding_size=0.12",
                                    fc="white" if borde == GRIS else borde + "18", ec=borde if borde != GRIS else "#b9c4bd",
                                    lw=1.6))
        ax.text(x, y + 0.2, t, ha="center", va="center", fontsize=10.5, weight="bold", color=TINTA)
        ax.text(x, y - 0.2, d, ha="center", va="center", fontsize=8, color="#4b5a52", linespacing=1.25)
        centros.append((x, y))
    for (x0, y0), (x1, y1) in zip(centros, centros[1:]):
        if y0 == y1:
            ini, fin = (x0 + W / 2 * (1 if x1 > x0 else -1), y0), (x1 - W / 2 * (1 if x1 > x0 else -1), y1)
        else:
            ini, fin = (x0, y0 - H / 2), (x1, y1 + H / 2)
        ax.add_patch(FancyArrowPatch(ini, fin, arrowstyle="-|>", mutation_scale=14, lw=1.4, color="#6b7a72"))
    ax.annotate("", xy=(5.2 - W / 2, 3.0), xytext=(0.6, 3.0 + H / 2 + 0.05),
                arrowprops=dict(arrowstyle="-|>", color="#b9c4bd", lw=1.2, ls="--",
                                connectionstyle="arc3,rad=-0.25"))
    ax.text(2.9, 4.05, "si es texto, no se transcribe", ha="center", fontsize=7.5, color="#7c8a82", style="italic")
    ax.text(5.6, 0.32, "El LLM solo extrae hechos · todos los cálculos son deterministas · el humano confirma antes de guardar",
            ha="center", fontsize=8.5, color=VERDE)
    salida = Path(__file__).resolve().parent / "arquitectura.png"
    plt.savefig(salida, dpi=200, bbox_inches="tight", facecolor="white")
    print("escrito", salida)


if __name__ == "__main__":
    main()
