"""Prueba temporal de minutos compartidos por parejas en el terreno de juego."""
import argparse
from collections import defaultdict
from itertools import combinations, groupby

import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

from datos import RAIZ, conexion, extrae, guarda_json
from modelos import CONFIGS, entrena, metricas, pliegues, predice
from publica import PLAN
from variables import actas, construye


def tramos(titulares, convocados, movimientos, duracion):
    """Reconstruye intervalos a partir de las sustituciones y expulsiones del acta."""
    if not titulares or not movimientos or not any(tipo in ('entra', 'sale') for tipo, _, _ in movimientos):
        return None
    activos = {j: 0 for j in titulares}
    expulsados = set()
    periodos = defaultdict(list)
    for tipo, minuto, j in movimientos:
        if pd.isna(j) or j not in convocados or pd.isna(minuto) or not 0 <= minuto <= duracion + 30:
            return None
        m = min(minuto, duracion)
        if tipo == 'entra':
            if j in activos or j in expulsados:
                return None
            activos[j] = m
        elif j in activos:
            ini = activos.pop(j)
            if m > ini:
                periodos[j].append((ini, m))
        elif tipo == 'sale':
            return None
        if tipo == 'tarjeta_roja':
            expulsados.add(j)
    if len(activos) + len(expulsados & titulares) > len(titulares):
        return None
    for j, ini in activos.items():
        if duracion > ini:
            periodos[j].append((ini, duracion))
    return periodos


def solape(a, b):
    return sum(max(0, min(fin, otro_fin) - max(ini, otro_ini)) for ini, fin in a for otro_ini, otro_fin in b)


def variables_grafo(muestra, partidos):
    eventos, listas, _ = actas(muestra)
    duraciones = muestra['duraciones'].set_index('grupo').duracion.to_dict()
    ultima = {}
    grafo = defaultdict(lambda: defaultdict(float))
    x = np.full((len(partidos), 4), np.nan, dtype=np.float32)
    verificadas = 0
    for _, lote in groupby(enumerate(partidos.itertuples(index=False)), key=lambda p: p[1].dia):
        pendientes = list(lote)
        for i, r in pendientes:
            for lado, eq in enumerate((r.equipo_local, r.equipo_visitante)):
                if eq not in ultima:
                    continue
                minutos = [grafo[eq].get(par, 0) for par in combinations(ultima[eq], 2)]
                if minutos:
                    x[i, lado * 2:lado * 2 + 2] = np.mean(minutos), np.mean(np.asarray(minutos) >= 90)
        for _, r in pendientes:
            duracion = duraciones.get(r.grupo)
            if r.calidad != 'correct' or not pd.notna(duracion) or r.tipo != 'liga':
                continue
            for lado, eq, inscripcion in (('local', r.equipo_local, r.local), ('visitante', r.equipo_visitante, r.visitante)):
                lista = listas.get((r.partido, inscripcion))
                if lista is None:
                    continue
                movimientos = [(tipo, minuto, j) for _, tipo, _, minuto, _, le, _, j, sujeto in eventos.get(r.partido, ())
                               if le == lado and (tipo in ('entra', 'sale') or (tipo == 'tarjeta_roja' and sujeto == 'jugador'))]
                jugando = tramos(lista[1], lista[0], movimientos, duracion)
                if jugando is None:
                    continue
                verificadas += 1
                aristas = grafo[eq]
                for a, b in combinations(sorted(jugando), 2):
                    m = solape(jugando[a], jugando[b])
                    if m:
                        aristas[a, b] += m
                ultima[eq] = sorted(lista[1])
    return pd.DataFrame(x, columns=['minutos_compartidos_local', 'pares_90_local',
                                    'minutos_compartidos_visitante', 'pares_90_visitante']), verificadas


def main():
    import json

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--salida', type=type(RAIZ), default=RAIZ / 'tmp' / 'prediccion' / 'grafo-minutos.json')
    args = ap.parse_args()
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    with conexion() as c:
        muestra = extrae(c, 'castilla-leon')
    p, x = construye(muestra)
    g, verificadas = variables_grafo(muestra, p)
    print(f'{verificadas:,} lados con tramos reconstruidos', flush=True)
    y = np.select([p.gl.gt(p.gv), p.gl.eq(p.gv)], [0, 1], default=2)
    combinado = pd.concat([x, g], axis=1)
    oficial = plan['columnas']
    resultados, acumulado = {}, {'base': [], 'grafo': [], 'y': []}
    with threadpool_limits(limits=4):
        for anio, t, v in pliegues(p):
            if anio not in (2024, 2025):
                continue
            resultados[str(anio)] = {'cobertura_grafo': float(g.loc[v].notna().any(axis=1).mean())}
            acumulado['y'].append(y[v])
            for nombre, cols in [('base', oficial), ('grafo', oficial + g.columns.tolist())]:
                m = entrena(combinado.loc[t], y[t], CONFIGS[plan['ganador']], cols)
                prob = predice(m, combinado.loc[v])
                resultados[str(anio)][nombre] = metricas(y[v], prob)
                acumulado[nombre].append(prob)
    total = {k: metricas(np.concatenate(acumulado['y']), np.concatenate(acumulado[k])) for k in ('base', 'grafo')}
    datos = {'lados_verificados': verificadas, 'por_temporada': resultados, 'total': total,
             'mejora_log_loss': total['base']['log_loss'] - total['grafo']['log_loss']}
    guarda_json(args.salida, datos)
    print({k: {m: r[m] for m in ('n', 'log_loss', 'brier')} for k, r in total.items()}, flush=True)


if __name__ == '__main__':
    main()
