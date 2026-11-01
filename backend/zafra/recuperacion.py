"""Few-shot dinámico: recupera las notas del banco más parecidas por similitud coseno."""
import json
from functools import lru_cache

import numpy as np

from . import llm
from .config import DATA


@lru_cache
def banco() -> list[dict]:
    with open(DATA / "fewshot_pool.jsonl", encoding="utf-8") as f:
        return [json.loads(l) for l in f]


@lru_cache
def matriz_banco() -> np.ndarray:
    m = np.array(llm.embeddings([e["texto"] for e in banco()]), dtype=np.float32)
    return m / np.linalg.norm(m, axis=1, keepdims=True)


def similares(texto: str, k: int = 4) -> list[tuple[dict, float]]:
    q = np.array(llm.embeddings([texto])[0], dtype=np.float32)
    q /= np.linalg.norm(q)
    sims = matriz_banco() @ q
    orden = np.argsort(-sims)[:k]
    return [(banco()[i], float(sims[i])) for i in orden]


FIJOS = ["P002", "P003", "P004", "P006"]   # mecanizado+paro, caña pendiente, cuadrillas+accidente, fuera de tema


def fijos() -> list[dict]:
    por_id = {e["id"]: e for e in banco()}
    return [por_id[i] for i in FIJOS]
