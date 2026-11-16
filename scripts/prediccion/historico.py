"""Ejecuta la revisión exacta que produjo la evaluación histórica de referencia."""
import os
import subprocess
import sys
import types

import numpy as np
from threadpoolctl import threadpool_limits

from datos import RAIZ, url


@threadpool_limits.wrap(limits=4)
def reproduce(salida):
    ruta = 'scripts/prediccion/eval_modelos.py'
    revision = 'a51b649'
    fuente = subprocess.check_output(['git', 'show', f'{revision}:{ruta}'], cwd=RAIZ)
    mod = types.ModuleType('evaluador_historico')
    mod.__file__ = str(RAIZ / ruta)
    exec(compile(fuente, mod.__file__, 'exec'), mod.__dict__)
    mod.url_lector = url
    mod.SALIDA = salida
    salida.mkdir(parents=True, exist_ok=True)
    original = mod.matriz_1x2

    def matriz_por_lotes(lh, la, *args, **kwargs):
        return np.concatenate([original(lh[i:i + 10000], la[i:i + 10000], *args, **kwargs)
                               for i in range(0, len(lh), 10000)])

    mod.matriz_1x2 = matriz_por_lotes
    argumentos, opciones = sys.argv, os.environ.get('PGOPTIONS')
    try:
        sys.argv = [ruta]
        os.environ['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=240000 -c max_parallel_workers_per_gather=0'
        mod.main()
    finally:
        sys.argv = argumentos
        if opciones is None:
            os.environ.pop('PGOPTIONS', None)
        else:
            os.environ['PGOPTIONS'] = opciones
