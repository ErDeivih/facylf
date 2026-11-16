#!/usr/bin/env python3
"""
grafo_jugadores.py — construye el grafo jugador-compañero y mide si aporta.

Grafo: para cada club y temporada, los jugadores con minutos son nodos; hay arista entre dos que
coincidieron en la misma plantilla, con peso min(minutos)/1000. Se derivan:
  · pares con ambos >=300 minutos,
  · minutos medios de las parejas.
Para un partido se usa el grafo de la temporada anterior del club (sin fuga).

Medición: HGB con Elo y localía, y el mismo HGB añadiendo las dos variables del grafo. Train
2024-25, validación 2025-26 (temporal), log-loss/Brier y permutación sobre la validación.
"""
from __future__ import annotations

import json
import math
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import log_loss

RAIZ = Path(__file__).resolve().parents[2]
ENV = RAIZ / '.env'


def url():
    for linea in ENV.read_text(encoding='utf-8', errors='ignore').splitlines():
        if linea.startswith('DATABASE_URL_LECTOR='):
            return linea.split('=', 1)[1].strip()
    raise SystemExit('sin DATABASE_URL_LECTOR')


c = psycopg2.connect(url())
print('cargando partidos CyL…', flush=True)
partidos = pd.read_sql("""
    select m.id, s.etiqueta temporada, s.anio_inicio,
           coalesce(m.played_at, m.fecha_prevista::timestamptz) fecha,
           tsl.club_id local_club, tsv.club_id visitante_club, m.goles_local gl, m.goles_visitante gv
      from core.match m
      join core.phase_group pg on pg.id=m.phase_group_id
      join core.competition_edition ce on ce.id=pg.competition_edition_id
      join core.federation f on f.id=ce.federation_id
      join core.season s on s.id=ce.season_id
      join core.team_entry el on el.id=m.home_team_entry_id
      join core.team_season tsl on tsl.id=el.team_season_id
      join core.team_entry ev on ev.id=m.away_team_entry_id
      join core.team_season tsv on tsv.id=ev.team_season_id
     where f.codigo='castilla-leon' and s.anio_inicio between 2024 and 2025
       and m.goles_local is not null
     order by fecha nulls last, m.id""", c)
partidos['fecha'] = pd.to_datetime(partidos['fecha'], utc=True)
print(len(partidos), flush=True)

print('cargando plantillas…', flush=True)
jugadores = pd.read_sql("""
    select s.anio_inicio, ts.club_id, ps.person_id,
           coalesce(ps.minutos_exactos, ps.minutos_estimados, 0) minutos
      from analytics.player_team_season_summary ps
      join core.team_entry te on te.id=ps.team_entry_id
      join core.team_season ts on ts.id=te.team_season_id
      join core.season s on s.id=ts.season_id
     where s.anio_inicio between 2023 and 2024 and coalesce(ps.minutos_exactos, ps.minutos_estimados, 0) > 0""", c)
grafo = {}
for (anio, club), grupo in jugadores.groupby(['anio_inicio', 'club_id']):
    minutos = grupo['minutos'].astype(float).tolist()
    pares = list(combinations(minutos, 2))
    fuertes = sum(1 for a, b in pares if a >= 300 and b >= 300)
    grafo[(int(anio), int(club))] = (fuertes, float(np.mean([min(a, b) for a, b in pares])) if pares else 0.0)
print('grafos club-temporada:', len(grafo), flush=True)

# Elo secuencial.
elo = {}
eh, ea = np.zeros(len(partidos)), np.zeros(len(partidos))
for i, r in enumerate(partidos.itertuples(index=False)):
    a, b = elo.get(r.local_club, 1500.0), elo.get(r.visitante_club, 1500.0)
    eh[i], ea[i] = a, b
    esperado = 1 / (1 + 10 ** (-((a + 60) - b) / 400))
    real = 1 if r.gl > r.gv else 0.5 if r.gl == r.gv else 0
    cambio = 20 * (real - esperado)
    elo[r.local_club], elo[r.visitante_club] = a + cambio, b - cambio
partidos['elo_diff'] = eh - ea
partidos['pares_local'] = [grafo.get((int(a) - 1, int(cl)), (0, 0))[0] for a, cl in zip(partidos.anio_inicio, partidos.local_club)]
partidos['pares_visitante'] = [grafo.get((int(a) - 1, int(cl)), (0, 0))[0] for a, cl in zip(partidos.anio_inicio, partidos.visitante_club)]
partidos['minutos_local'] = [grafo.get((int(a) - 1, int(cl)), (0, 0))[1] for a, cl in zip(partidos.anio_inicio, partidos.local_club)]
partidos['minutos_visitante'] = [grafo.get((int(a) - 1, int(cl)), (0, 0))[1] for a, cl in zip(partidos.anio_inicio, partidos.visitante_club)]
y = np.where(partidos.gl > partidos.gv, 0, np.where(partidos.gl == partidos.gv, 1, 2))
train = partidos['temporada'].to_numpy() == '2024-25'
valid = partidos['temporada'].to_numpy() == '2025-26'

base = ['elo_diff']
conGrafo = ['elo_diff', 'pares_local', 'pares_visitante', 'minutos_local', 'minutos_visitante']
resultados = {}
for nombre, cols in [('base-elo', base), ('con-grafo', conGrafo)]:
    m = HistGradientBoostingClassifier(max_iter=160, learning_rate=0.06, max_leaf_nodes=31,
                                       early_stopping=True, validation_fraction=0.1, random_state=42)
    m.fit(partidos.loc[train, cols], y[train])
    p = m.predict_proba(partidos.loc[valid, cols])
    resultados[nombre] = {
        'log_loss': round(float(log_loss(y[valid], p, labels=[0, 1, 2])), 5),
        'brier': round(float(np.mean(np.sum((p - np.eye(3)[y[valid]]) ** 2, axis=1))), 5),
    }
    if nombre == 'con-grafo':
        idx = np.random.RandomState(0).choice(np.where(valid)[0], size=min(20000, int(valid.sum())), replace=False)
        imp = permutation_importance(m, partidos.loc[idx, cols], y[idx], n_repeats=4, random_state=0,
                                     scoring='neg_log_loss')
        importancia = sorted(zip(cols, imp.importances_mean.tolist()), key=lambda x: -x[1])
    print(nombre, resultados[nombre], flush=True)

salida = {'train': '2024-25', 'validacion': '2025-26', 'resultados': resultados,
          'importancia_permutacion': [{'variable': k, 'importancia': round(v, 5)} for k, v in importancia],
          'n_train': int(train.sum()), 'n_valid': int(valid.sum())}
(RAIZ / 'pruebas' / 'prediccion').mkdir(parents=True, exist_ok=True)
(RAIZ / 'pruebas' / 'prediccion' / 'grafo.json').write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(salida, ensure_ascii=False, indent=2))
