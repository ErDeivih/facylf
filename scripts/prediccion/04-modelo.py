#!/usr/bin/env python3
"""
04-modelo.py — entrena el modelo de ML y publica sus predicciones en analytics.prediccion_ml.

Entrena con todas las temporadas anteriores a 2026-27 y predice la 2026-27, con las mismas variables
que la validación temporal de `eval_modelos.py`: Elo, descanso, forma reciente, momento de la temporada,
calidad del rival (Elo), impacto de plantilla (temporada anterior) y cambio de entrenador.

La banda publicada es el mínimo/máximo entre ML, Elo y Poisson: una banda de desacuerdo entre modelos,
no un intervalo estadístico. El marcador más probable sale de la matriz Poisson ya calculada.

Uso:
  python scripts/prediccion/04-modelo.py
  python scripts/prediccion/04-modelo.py --seco
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import PoissonRegressor

RAIZ = Path(__file__).resolve().parents[2]
METRICAS = RAIZ / 'pruebas' / 'prediccion' / 'evaluacion.json'


def url(nombre: str) -> str:
    env = RAIZ / '.env'
    if env.exists():
        for linea in env.read_text(encoding='utf-8', errors='ignore').splitlines():
            if linea.startswith(f'{nombre}='):
                return linea.split('=', 1)[1].strip()
    return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seco', action='store_true')
    args = ap.parse_args()
    c = psycopg2.connect(url('DATABASE_URL_PUBLICADOR') or url('DATABASE_URL_MIGRACION'))
    print('cargando partidos…', flush=True)
    partidos = pd.read_sql("""
        select m.id partido, s.etiqueta temporada, s.anio_inicio,
               ce.id edicion, f.codigo federacion, pg.id grupo, d.numero jornada,
               coalesce(m.played_at, m.fecha_prevista::timestamptz) fecha,
               m.home_team_entry_id local_entry, m.away_team_entry_id visitante_entry,
               tsl.club_id local_club, tsv.club_id visitante_club,
               m.goles_local gl, m.goles_visitante gv
          from core.match m
          join core.phase_group pg on pg.id = m.phase_group_id
          join core.competition_edition ce on ce.id = pg.competition_edition_id
          join core.season s on s.id = ce.season_id
          join core.federation f on f.id = ce.federation_id
          join core.matchday d on d.id = m.matchday_id
          join core.team_entry te on te.id = m.home_team_entry_id
          join core.team_season tsl on tsl.id = te.team_season_id
          join core.team_entry tv on tv.id = m.away_team_entry_id
          join core.team_season tsv on tsv.id = tv.team_season_id
         order by fecha nulls last, m.id""", c)
    partidos['fecha'] = pd.to_datetime(partidos['fecha'], utc=True)
    partidos = partidos.sort_values(['fecha', 'partido']).reset_index(drop=True)
    print(f'partidos: {len(partidos):,}', flush=True)

    # Elo, descanso y forma reciente, en una sola pasada cronológica.
    elo, ultimo, forma = {}, {}, {}
    elo_h, elo_a = np.zeros(len(partidos)), np.zeros(len(partidos))
    resto_h, resto_a = np.full(len(partidos), 7.0), np.full(len(partidos), 7.0)
    forma_h, forma_a = np.full(len(partidos), 1.0), np.full(len(partidos), 1.0)
    gd_h, gd_a = np.zeros(len(partidos)), np.zeros(len(partidos))
    for i, r in enumerate(partidos.itertuples(index=False)):
        eh, ea = elo.get(r.local_club, 1500.0), elo.get(r.visitante_club, 1500.0)
        elo_h[i], elo_a[i] = eh, ea
        for club, col in ((r.local_club, 'resto_local'), (r.visitante_club, 'resto_visitante')):
            if club in ultimo and pd.notna(r.fecha):
                resto = min(30.0, max(0.0, (r.fecha - ultimo[club]).total_seconds() / 86400))
                if col == 'resto_local': resto_h[i] = resto
                else: resto_a[i] = resto
            if pd.notna(r.fecha): ultimo[club] = r.fecha
        for club, arr_f, arr_g in ((r.local_club, forma_h, gd_h), (r.visitante_club, forma_a, gd_a)):
            hist = forma.get(club, [])
            if hist:
                arr_f[i] = np.mean([p for p, _ in hist])
                arr_g[i] = np.mean([g for _, g in hist])
        real = 1.0 if r.gl > r.gv else 0.5 if r.gl == r.gv else 0.0
        ventaja = 60.0
        esperado = 1 / (1 + 10 ** (-((eh + ventaja) - ea) / 400))
        factor = 1.0 if abs(r.gl - r.gv) <= 1 else 1.5 if abs(r.gl - r.gv) == 2 else (11 + abs(r.gl - r.gv)) / 8
        cambio = 20.0 * factor * (real - esperado)
        elo[r.local_club], elo[r.visitante_club] = eh + cambio, ea - cambio
        dh = 1 if r.gl > r.gv else -1 if r.gl < r.gv else 0
        forma.setdefault(r.local_club, []).append((3 if dh > 0 else 1 if dh == 0 else 0, r.gl - r.gv))
        forma.setdefault(r.visitante_club, []).append((3 if dh < 0 else 1 if dh == 0 else 0, r.gv - r.gl))
        forma[r.local_club] = forma[r.local_club][-5:]
        forma[r.visitante_club] = forma[r.visitante_club][-5:]
    partidos['elo_h'], partidos['elo_a'] = elo_h, elo_a
    partidos['elo_diff'] = elo_h - elo_a
    partidos['resto_local'], partidos['resto_visitante'] = resto_h, resto_a
    partidos['forma_local'], partidos['forma_visitante'] = forma_h, forma_a
    partidos['gd_forma_local'], partidos['gd_forma_visitante'] = gd_h, gd_a
    max_j = partidos.groupby('grupo')['jornada'].transform('max').replace(0, np.nan)
    partidos['momento'] = (partidos['jornada'] / max_j).fillna(0.5).clip(0, 1)
    partidos['fed_id'] = partidos['federacion'].astype('category').cat.codes

    # Entrenador y cambio.
    print('cargando entrenadores…', flush=True)
    staff = pd.read_sql("""
        select ms.match_id partido, ms.team_entry_id entry, min(ms.person_id) coach
          from core.match_staff ms
         where lower(ms.rol) like '%entrenador%' or lower(ms.rol) like '%entrenatzaile%'
         group by 1,2""", c)
    partidos = partidos.merge(staff.rename(columns={'entry': 'local_entry', 'coach': 'coach_local'}),
                              on=['partido', 'local_entry'], how='left')
    partidos = partidos.merge(staff.rename(columns={'entry': 'visitante_entry', 'coach': 'coach_visitante'}),
                              on=['partido', 'visitante_entry'], how='left')
    partidos['cambio_entrenador_local'] = 0
    partidos['cambio_entrenador_visitante'] = 0
    anterior = {}
    for i, r in enumerate(partidos.itertuples(index=False)):
        for club, coach, col in ((r.local_club, r.coach_local, 'cambio_entrenador_local'),
                                 (r.visitante_club, r.coach_visitante, 'cambio_entrenador_visitante')):
            if pd.isna(coach): continue
            if club in anterior and anterior[club] != coach: partidos.at[i, col] = 1
            anterior[club] = coach

    # Impacto de plantilla: calidad de los jugadores de la temporada anterior del club.
    print('cargando impacto de plantilla…', flush=True)
    ojeo = pd.read_sql("""
        select s.anio_inicio, oj.club_id, oj.person_id, oj.puntuacion, oj.pct_minutos
          from analytics.ojeo_jugador oj join core.season s on s.id = oj.season_id
         where s.anio_inicio >= 2020 and oj.puntuacion is not null""", c)
    ojeo['peso'] = ojeo['puntuacion'] * (ojeo['pct_minutos'].fillna(0).clip(0, 100) / 100.0)
    impacto = (ojeo.sort_values(['anio_inicio', 'club_id', 'peso'], ascending=[True, True, False])
               .groupby(['anio_inicio', 'club_id']).head(11)
               .groupby(['anio_inicio', 'club_id'])['peso'].sum().reset_index())
    impacto.columns = ['anio', 'club', 'impacto']
    mapa = {(int(r.anio), int(r.club)): float(r.impacto) for r in impacto.itertuples(index=False)}
    medio = float(np.mean(list(mapa.values()))) or 1.0
    partidos['impacto_local'] = [mapa.get((int(a) - 1, int(cl)), 0.0) / medio
                                 for a, cl in zip(partidos['anio_inicio'], partidos['local_club'])]
    partidos['impacto_visitante'] = [mapa.get((int(a) - 1, int(cl)), 0.0) / medio
                                     for a, cl in zip(partidos['anio_inicio'], partidos['visitante_club'])]

    # Poisson ya calculado: λ y marcador probable.
    poisson = pd.read_sql("""
        select p.match_id partido, p.goles_esperados_local lh, p.goles_esperados_visitante la,
               p.prob_local p1, p.prob_empate px, p.prob_visitante p2,
               p.marcador_probable marcador, p.prob_marcador
          from analytics.poisson_partido p""", c)
    partidos = partidos.merge(poisson, on='partido', how='left')

    train = partidos[(partidos['temporada'] <= '2025-26') & partidos['gl'].notna() & partidos['gv'].notna()].copy()
    pred = partidos[partidos['temporada'] == '2026-27'].copy()
    print(f'train {len(train):,} · a predecir {len(pred):,}', flush=True)

    features = ['elo_diff', 'elo_h', 'elo_a', 'resto_local', 'resto_visitante', 'momento',
                'forma_local', 'forma_visitante', 'gd_forma_local', 'gd_forma_visitante',
                'impacto_local', 'impacto_visitante', 'cambio_entrenador_local', 'cambio_entrenador_visitante',
                'fed_id']

    # Elo -> goles esperados.
    rh = PoissonRegressor(alpha=1e-4, max_iter=500).fit(train[['elo_diff']].fillna(0.0), train.gl)
    ra = PoissonRegressor(alpha=1e-4, max_iter=500).fit(train[['elo_diff']].fillna(0.0), train.gv)
    pred['elo_lh'] = np.clip(rh.predict(pred[['elo_diff']].fillna(0.0)), 0.05, 6)
    pred['elo_la'] = np.clip(ra.predict(pred[['elo_diff']].fillna(0.0)), 0.05, 6)

    print('entrenando ML…', flush=True)
    muestra = train.sample(min(500000, len(train)), random_state=42)
    y = np.where(muestra.gl > muestra.gv, 0, np.where(muestra.gl == muestra.gv, 1, 2))
    ml = HistGradientBoostingClassifier(max_iter=240, learning_rate=0.06, max_leaf_nodes=31,
                                        l2_regularization=1.0, early_stopping=True,
                                        validation_fraction=0.1, random_state=42)
    ml.fit(muestra[features], y)

    p_ml = ml.predict_proba(pred[features])
    p_poisson = pred[['p1', 'px', 'p2']].to_numpy(dtype=float) / 100.0
    # Elo: matriz 1-X-2 a partir de sus λ, con la misma rejilla 0..8.
    def poisson_1x2(lh, la, maxg=8):
        ks = np.arange(maxg + 1)
        ph = np.exp(-lh[:, None] + ks[None, :] * np.log(np.maximum(lh[:, None], 1e-12))
                    - np.array([math.lgamma(k + 1) for k in ks])[None, :])
        pa = np.exp(-la[:, None] + ks[None, :] * np.log(np.maximum(la[:, None], 1e-12))
                    - np.array([math.lgamma(k + 1) for k in ks])[None, :])
        p = ph[:, :, None] * pa[:, None, :]
        p = p / p.sum(axis=(1, 2), keepdims=True)
        return np.column_stack([np.tril(p, -1).sum(axis=(1, 2)), np.trace(p, axis1=1, axis2=2),
                                np.triu(p, 1).sum(axis=(1, 2))])
    p_elo = poisson_1x2(pred['elo_lh'].to_numpy(), pred['elo_la'].to_numpy())
    p_poisson = np.where(np.isnan(p_poisson), p_ml, p_poisson)
    # Banda de desacuerdo entre los tres modelos.
    pila = np.stack([p_ml, p_elo, p_poisson])
    low, high = pila.min(axis=0), pila.max(axis=0)

    metricas = json.loads(METRICAS.read_text(encoding='utf-8')) if METRICAS.exists() else {}
    res = {r['modelo']: r for r in metricas.get('resultados', [])}
    ml_m = res.get('ml-variables', {})
    base = res.get('base-frecuencias', {})

    filas = []
    for i, r in enumerate(pred.itertuples(index=False)):
        marcador = getattr(r, 'marcador', None)
        if not isinstance(marcador, str) or not re.match(r'^[0-9]+-[0-9]+$', marcador):
            marcador = None
        filas.append((int(r.partido), float(round(p_ml[i, 0] * 100, 2)), float(round(p_ml[i, 1] * 100, 2)), float(round(p_ml[i, 2] * 100, 2)),
                      float(round(low[i, 0] * 100, 2)), float(round(high[i, 0] * 100, 2)),
                      float(round(low[i, 1] * 100, 2)), float(round(high[i, 1] * 100, 2)),
                      float(round(low[i, 2] * 100, 2)), float(round(high[i, 2] * 100, 2)),
                      marcador, float(r.prob_marcador) if pd.notna(r.prob_marcador) else None,
                      'ml-hgb-v1', float(ml_m.get('log_loss') or 0), float(ml_m.get('brier') or 0), float(base.get('log_loss') or 0)))
    print(f'filas a escribir: {len(filas):,}', flush=True)
    if args.seco:
        print(filas[:3])
        return
    with c.cursor() as cur:
        execute_values(cur, """
            insert into analytics.prediccion_ml
              (match_id, prob_local, prob_empate, prob_visitante,
               prob_local_low, prob_local_high, prob_empate_low, prob_empate_high,
               prob_visitante_low, prob_visitante_high, marcador_probable, prob_marcador,
               modelo, log_loss, brier, baseline_log_loss, calculado_en)
            values %s
            on conflict (match_id) do update set
              prob_local=excluded.prob_local, prob_empate=excluded.prob_empate,
              prob_visitante=excluded.prob_visitante,
              prob_local_low=excluded.prob_local_low, prob_local_high=excluded.prob_local_high,
              prob_empate_low=excluded.prob_empate_low, prob_empate_high=excluded.prob_empate_high,
              prob_visitante_low=excluded.prob_visitante_low, prob_visitante_high=excluded.prob_visitante_high,
              marcador_probable=excluded.marcador_probable, prob_marcador=excluded.prob_marcador,
              log_loss=excluded.log_loss, brier=excluded.brier, baseline_log_loss=excluded.baseline_log_loss,
              calculado_en=now()
        """, [f + (pd.Timestamp.utcnow().to_pydatetime(),) for f in filas], page_size=500)
        c.commit()
    print('escrito analytics.prediccion_ml', flush=True)


if __name__ == '__main__':
    main()
