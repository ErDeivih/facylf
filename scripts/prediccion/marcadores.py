"""Probabilidades de marcador condicionadas por el signo del modelo 1-X-2."""
import numpy as np
from scipy.stats import poisson

GOLES = np.arange(41)
SIGNOS = np.sign(GOLES[:, None] - GOLES[None, :])
INDICES = [np.where(SIGNOS == signo) for signo in (1, 0, -1)]


def rejilla(lh, lv, proba):
    matriz = np.outer(poisson.pmf(GOLES, lh), poisson.pmf(GOLES, lv))
    for k, celdas in enumerate(INDICES):
        matriz[celdas] *= proba[k] / matriz[celdas].sum()
    return matriz


def sortea(rng, lh, lv, probabilidades):
    p = np.asarray(probabilidades)
    uniforme = rng.random(len(p))
    signos = np.sum(uniforme[:, None] > p.cumsum(axis=1)[:, :2], axis=1)
    matriz = rejilla(lh, lv, [1., 1., 1.])
    gl = np.empty(len(p), dtype=int)
    gv = np.empty_like(gl)
    for k, celdas in enumerate(INDICES):
        sel = signos == k
        cdf = matriz[celdas].cumsum()
        filas = np.searchsorted(cdf / cdf[-1], rng.random(sel.sum()), side='right')
        gl[sel], gv[sel] = celdas[0][filas], celdas[1][filas]
    return gl, gv
