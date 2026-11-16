#!/usr/bin/env python3
"""
eval_modelos.py — comparación temporal de modelos de predicción 1-X-2.

Entrena con temporadas anteriores y valida en temporadas posteriores (nunca aleatorio):
  train: 2019-20 … 2023-24
  validación: 2024-25 y 2025-26 (y 2026-27 como muestra parcial)

Modelos:
  1. Poisson con corrección Dixon-Coles (fuerza por club, media de la liga, ventaja de casa, rho).
  2. Elo secuencial + regresión Poisson de goles sobre la diferencia de Elo.
  3. ML (HistGradientBoostingClassifier) con Elo, Poisson, descanso, calidad del rival, momento
     de la temporada, impacto de plantilla (prior season) y cambio de entrenador.

Mide log-loss y Brier multiclase contra la línea base ingenua (frecuencias del train) y publica
la calibración (bin de probabilidad predicha vs frecuencia observada).

Uso:
  python scripts/prediccion/eval_modelos.py
  python scripts/prediccion/eval_modelos.py --train-hasta 2023-24 --validar 2024-25 2025-26
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import log_loss

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'pruebas' / 'prediccion'
SALIDA.mkdir(parents=True, exist_ok=True)


def url_lector() -> str:
    env = RAIZ / '.env'
    if env.exists():
        for linea in env.read_text(encoding='utf-8', errors='ignore').splitlines():
            if linea.startswith('DATABASE_URL_LECTOR='):
                return linea.split('=', 1)[1].strip()
    return 'postgres://facylf_lector:facylf_local_2026_lector@127.0.0.1:5433/facylf'


def carga(c, sql, params=None):
    return pd.read_sql(sql, c, params=params)


def poisson_pmf(k, lam):
    return np.exp(-lam) * lam ** k / np.array([math.factorial(int(x)) for x in k])


def dc_tau(h, a, lh, la, rho):
    tau = np.ones(len(h))
    tau[(h == 0) & (a == 0)] = 1 - lh[(h == 0) & (a == 0)] * la[(h == 0) & (a == 0)] * rho
    tau[(h == 0) & (a == 1)] = 1 + lh[(h == 0) & (a == 1)] * rho
    tau[(h == 1) & (a == 0)] = 1 + la[(h == 1) & (a == 0)] * rho
    tau[(h == 1) & (a == 1)] = 1 - rho
    return np.clip(tau, 1e-9, None)


def matriz_1x2(lh, la, rho=0.0, maxg=8):
    """Probabilidades 1-X-2 de una matriz Poisson (o DC) de 0..maxg para arrays de λ."""
    lh = np.asarray(lh, dtype=float)
    la = np.asarray(la, dtype=float)
    ks = np.arange(maxg + 1)
    ph = np.exp(-lh[:, None] + ks[None, :] * np.log(np.maximum(lh[:, None], 1e-12))
                - np.array([math.lgamma(k + 1) for k in ks])[None, :])
    pa = np.exp(-la[:, None] + ks[None, :] * np.log(np.maximum(la[:, None], 1e-12))
                - np.array([math.lgamma(k + 1) for k in ks])[None, :])
    p = ph[:, :, None] * pa[:, None, :]
    if rho:
        # Corrección DC sólo en las celdas 0-0, 0-1, 1-0 y 1-1.
        p[:, 0, 0] *= np.clip(1 - lh * la * rho, 1e-9, None)
        p[:, 0, 1] *= np.clip(1 + lh * rho, 1e-9, None)
        p[:, 1, 0] *= np.clip(1 + la * rho, 1e-9, None)
        p[:, 1, 1] *= np.clip(1 - rho, 1e-9, None)
    p = np.clip(p, 1e-12, None)
    p = p / p.sum(axis=(1, 2), keepdims=True)
    home = np.tril(p, -1).sum(axis=(1, 2))
    draw = np.trace(p, axis1=1, axis2=2)
    away = np.triu(p, 1).sum(axis=(1, 2))
    total = home + draw + away
    return np.column_stack([home / total, draw / total, away / total])


def metricas(y, p, nombre):
    y = np.asarray(y)
    p = np.clip(np.asarray(p), 1e-12, 1)
    p = p / p.sum(axis=1, keepdims=True)
    ll = float(log_loss(y, p, labels=[0, 1, 2]))
    uno = np.zeros_like(p)
    uno[np.arange(len(y)), y] = 1
    brier = float(np.mean(np.sum((p - uno) ** 2, axis=1)))
    acierto = float(np.mean(p.argmax(axis=1) == y))
    return {'modelo': nombre, 'log_loss': round(ll, 5), 'brier': round(brier, 5), 'acierto': round(acierto, 4), 'n': int(len(y))}


def calibracion(y, p, bins=10):
    """Fiabilidad de P(local) y de la clase predicha."""
    salida = []
    for k, nombre in [(0, 'local'), (1, 'empate'), (2, 'visitante')]:
        filas = []
        for i in range(bins):
            lo, hi = i / bins, (i + 1) / bins
            m = (p[:, k] >= lo) & (p[:, k] < hi if i < bins - 1 else p[:, k] <= hi)
            if m.sum() == 0:
                continue
            filas.append({'bin': f'{lo:.1f}-{hi:.1f}', 'n': int(m.sum()),
                          'previsto': round(float(p[m, k].mean()), 4),
                          'observado': round(float((y[m] == k).mean()), 4)})
        # ECE ponderado
        total = sum(f['n'] for f in filas)
        ece = sum(f['n'] * abs(f['previsto'] - f['observado']) for f in filas) / max(total, 1)
        salida.append({'clase': nombre, 'ece': round(ece, 4), 'bins': filas})
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--train-hasta', default='2023-24')
    ap.add_argument('--validar', nargs='+', default=['2024-25', '2025-26'])
    args = ap.parse_args()

    c = psycopg2.connect(url_lector())
    print('cargando partidos con resultado…', flush=True)
    partidos = carga(c, """
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
         where s.anio_inicio >= 2019 and m.goles_local is not null and m.goles_visitante is not null
         order by fecha nulls last, m.id""")
    partidos['fecha'] = pd.to_datetime(partidos['fecha'], utc=True)
    partidos = partidos.sort_values(['fecha', 'partido']).reset_index(drop=True)
    print(f'partidos: {len(partidos):,}', flush=True)

    # ── Elo secuencial (sólo pasado) ──────────────────────────────────────────────────────────────
    elo = {}
    elo_h = np.zeros(len(partidos))
    elo_a = np.zeros(len(partidos))
    k_elo = 20.0
    ventaja = 60.0
    for i, r in enumerate(partidos.itertuples(index=False)):
        eh = elo.get(r.local_club, 1500.0)
        ea = elo.get(r.visitante_club, 1500.0)
        elo_h[i], elo_a[i] = eh, ea
        esperado = 1 / (1 + 10 ** (-((eh + ventaja) - ea) / 400))
        real = 1.0 if r.gl > r.gv else 0.5 if r.gl == r.gv else 0.0
        factor = 1.0 if abs(r.gl - r.gv) <= 1 else 1.5 if abs(r.gl - r.gv) == 2 else (11 + abs(r.gl - r.gv)) / 8
        cambio = k_elo * factor * (real - esperado)
        elo[r.local_club] = eh + cambio
        elo[r.visitante_club] = ea - cambio
    partidos['elo_h'] = elo_h
    partidos['elo_a'] = elo_a
    partidos['elo_diff'] = partidos['elo_h'] - partidos['elo_a']

    # ── Descanso y momento de temporada ───────────────────────────────────────────────────────────
    partidos['resto_local'] = 7.0
    partidos['resto_visitante'] = 7.0
    ultimo = {}
    for i, r in enumerate(partidos.itertuples(index=False)):
        for club, col in ((r.local_club, 'resto_local'), (r.visitante_club, 'resto_visitante')):
            if club in ultimo and pd.notna(r.fecha):
                dias = (r.fecha - ultimo[club]).total_seconds() / 86400
                partidos.at[i, col] = min(30.0, max(0.0, dias))
            if pd.notna(r.fecha):
                ultimo[club] = r.fecha
    max_j = partidos.groupby('grupo')['jornada'].transform('max').replace(0, np.nan)
    partidos['momento'] = (partidos['jornada'] / max_j).fillna(0.5).clip(0, 1)

    # ── Entrenador: cambio respecto al partido anterior del mismo club ───────────────────────────
    print('cargando entrenadores…', flush=True)
    staff = carga(c, """
        select ms.match_id partido, ms.team_entry_id entry, min(ms.person_id) coach
          from core.match_staff ms
         where lower(ms.rol) like '%entrenador%' or lower(ms.rol) like '%entrenatzaile%'
         group by 1,2""")
    partidos = partidos.merge(staff.rename(columns={'partido': 'partido', 'entry': 'local_entry', 'coach': 'coach_local'}),
                              on=['partido', 'local_entry'], how='left')
    partidos = partidos.merge(staff.rename(columns={'partido': 'partido', 'entry': 'visitante_entry', 'coach': 'coach_visitante'}),
                              on=['partido', 'visitante_entry'], how='left')
    partidos['cambio_entrenador_local'] = 0
    partidos['cambio_entrenador_visitante'] = 0
    anterior = {}
    for i, r in enumerate(partidos.itertuples(index=False)):
        for club, coach, col in ((r.local_club, r.coach_local, 'cambio_entrenador_local'),
                                 (r.visitante_club, r.coach_visitante, 'cambio_entrenador_visitante')):
            if pd.isna(coach):
                continue
            if club in anterior and anterior[club] != coach:
                partidos.at[i, col] = 1
            anterior[club] = coach

    # ── Impacto de plantilla: calidad de los jugadores de la temporada anterior del club ───────
    print('cargando impacto de plantilla…', flush=True)
    ojeo = carga(c, """
        select s.anio_inicio, oj.club_id, oj.person_id, oj.puntuacion, oj.pct_minutos
          from analytics.ojeo_jugador oj join core.season s on s.id = oj.season_id
         where s.anio_inicio >= 2020 and oj.puntuacion is not null""")
    ojeo['peso'] = ojeo['puntuacion'] * (ojeo['pct_minutos'].fillna(0).clip(0, 100) / 100.0)
    impacto = (ojeo.sort_values(['anio_inicio', 'club_id', 'peso'], ascending=[True, True, False])
               .groupby(['anio_inicio', 'club_id']).head(11)
               .groupby(['anio_inicio', 'club_id'])['peso'].sum().reset_index())
    impacto.columns = ['anio', 'club', 'impacto']
    mapa_impacto = {(int(r.anio), int(r.club)): float(r.impacto) for r in impacto.itertuples(index=False)}
    partidos['impacto_local'] = [mapa_impacto.get((int(a) - 1, int(c)), 0.0)
                                 for a, c in zip(partidos['anio_inicio'], partidos['local_club'])]
    partidos['impacto_visitante'] = [mapa_impacto.get((int(a) - 1, int(c)), 0.0)
                                     for a, c in zip(partidos['anio_inicio'], partidos['visitante_club'])]
    impacto_medio = float(np.mean([v for v in mapa_impacto.values()] or [1.0])) or 1.0
    partidos['impacto_local'] /= impacto_medio
    partidos['impacto_visitante'] /= impacto_medio

    # ── Poisson/Dixon-Coles: sólo train, luego aplicado a validación ─────────────────────────────
    train = partidos[partidos['temporada'] <= args.train_hasta].copy()
    valid = partidos[partidos['temporada'].isin(args.validar)].copy()
    if train.empty or valid.empty:
        sys.exit('split temporal vacío: revisa --train-hasta/--validar')
    print(f'train {len(train):,} · validación {len(valid):,}', flush=True)

    # Fuerza por club con decaimiento por temporada y encogido.
    train['peso'] = 0.75 ** (train['anio_inicio'].max() - train['anio_inicio'])
    lados = []
    for lado, club, gf, ga in [('local', 'local_club', 'gl', 'gv'), ('visitante', 'visitante_club', 'gv', 'gl')]:
        x = train[['temporada', 'anio_inicio', 'peso', club, gf, ga]].copy()
        x.columns = ['temporada', 'anio', 'peso', 'club', 'gf', 'ga']
        lados.append(x)
    lados = pd.concat(lados, ignore_index=True)
    fuerza = lados.groupby('club').apply(
        lambda d: pd.Series({'gf': np.average(d.gf, weights=d.peso), 'ga': np.average(d.ga, weights=d.peso),
                             'n': d.peso.sum()}), include_groups=False).reset_index()
    media_gf = float(np.average(lados.gf, weights=lados.peso))
    media_ga = float(np.average(lados.ga, weights=lados.peso))
    k = 6.0
    fuerza['ataque'] = (fuerza.gf * fuerza.n + k * media_gf) / ((fuerza.n + k) * media_gf)
    fuerza['defensa'] = (fuerza.ga * fuerza.n + k * media_ga) / ((fuerza.n + k) * media_ga)
    mapa_fuerza = {int(r.club): (float(r.ataque), float(r.defensa)) for r in fuerza.itertuples(index=False)}

    def lambdas(df):
        ah, dh = zip(*[mapa_fuerza.get(int(c), (1.0, 1.0)) for c in df.local_club])
        aa, da = zip(*[mapa_fuerza.get(int(c), (1.0, 1.0)) for c in df.visitante_club])
        lh = media_gf * np.array(ah) * np.array(da)
        la = media_ga * np.array(aa) * np.array(dh)
        return np.clip(lh, 0.05, 6), np.clip(la, 0.05, 6)

    # rho DC por rejilla sobre una muestra del train.
    muestra = train.sample(min(120000, len(train)), random_state=7)
    lh_m, la_m = lambdas(muestra)
    mejor_rho, mejor_ll = 0.0, -1e18
    for rho in np.linspace(-0.18, 0.18, 19):
        p = matriz_1x2(lh_m, la_m, rho=rho)
        y = np.where(muestra.gl > muestra.gv, 0, np.where(muestra.gl == muestra.gv, 1, 2))
        ll = -log_loss(y, p, labels=[0, 1, 2])
        if ll > mejor_ll:
            mejor_ll, mejor_rho = ll, float(rho)
    print(f'rho DC: {mejor_rho:.3f}', flush=True)

    # ── Elo: regresión Poisson de goles sobre diferencia de Elo ─────────────────────────────────
    muestra_elo = train.sample(min(500000, len(train)), random_state=11)
    rh = PoissonRegressor(alpha=1e-4, max_iter=500).fit(muestra_elo[['elo_diff']], muestra_elo.gl)
    ra = PoissonRegressor(alpha=1e-4, max_iter=500).fit(muestra_elo[['elo_diff']], muestra_elo.gv)
    elo_lh = np.clip(rh.predict(valid[['elo_diff']]), 0.05, 6)
    elo_la = np.clip(ra.predict(valid[['elo_diff']]), 0.05, 6)

    # ── Predicciones de los tres modelos ─────────────────────────────────────────────────────────
    lh_v, la_v = lambdas(valid)
    p_poisson = matriz_1x2(lh_v, la_v, rho=mejor_rho)
    p_elo = matriz_1x2(elo_lh, elo_la, rho=0.0)
    y_valid = np.where(valid.gl > valid.gv, 0, np.where(valid.gl == valid.gv, 1, 2))
    frec = train.assign(y=np.where(train.gl > train.gv, 0, np.where(train.gl == train.gv, 1, 2)))['y'].value_counts(normalize=True)
    p_naive = np.tile([frec.get(0, 1/3), frec.get(1, 1/3), frec.get(2, 1/3)], (len(valid), 1))

    # ── ML con variables ─────────────────────────────────────────────────────────────────────────
    print('entrenando ML…', flush=True)
    features = ['elo_diff', 'elo_h', 'elo_a', 'resto_local', 'resto_visitante', 'momento',
                'impacto_local', 'impacto_visitante',
                'cambio_entrenador_local', 'cambio_entrenador_visitante']
    train = train.copy()
    train['lh'], train['la'] = lambdas(train)
    valid = valid.copy()
    valid['lh'], valid['la'] = lh_v, la_v
    features += ['lh', 'la']
    muestra_ml = train.sample(min(500000, len(train)), random_state=23)
    y_train = np.where(muestra_ml.gl > muestra_ml.gv, 0, np.where(muestra_ml.gl == muestra_ml.gv, 1, 2))
    ml = HistGradientBoostingClassifier(max_iter=220, learning_rate=0.06, max_leaf_nodes=31,
                                        l2_regularization=1.0, early_stopping=True,
                                        validation_fraction=0.1, random_state=42)
    ml.fit(muestra_ml[features], y_train)
    p_ml = ml.predict_proba(valid[features])

    # Ponderación por importancia: menos peso a goleadas contra rivales muy inferiores, más a los
    # igualados y a los partidos de la parte final de la temporada. Es una aproximación sin fuga:
    # solo usa goles, Elo previo y momento, todos conocidos antes del partido.
    gd = (muestra_ml.gl - muestra_ml.gv).abs().to_numpy()
    dif_elo = muestra_ml.elo_diff.abs().fillna(0).to_numpy()
    momento = muestra_ml.momento.fillna(0.5).to_numpy()
    pesos = np.ones(len(muestra_ml))
    pesos[(gd >= 4) & (dif_elo > 150)] *= 0.55
    pesos[gd <= 1] *= 1.15
    pesos[momento > 0.75] *= 1.25
    pesos[(momento > 0.6) & (dif_elo < 60)] *= 1.15
    pesos = np.clip(pesos, 0.5, 2.0)
    ml_peso = HistGradientBoostingClassifier(max_iter=220, learning_rate=0.06, max_leaf_nodes=31,
                                             l2_regularization=1.0, early_stopping=True,
                                             validation_fraction=0.1, random_state=42)
    ml_peso.fit(muestra_ml[features], y_train, sample_weight=pesos)
    p_ml_peso = ml_peso.predict_proba(valid[features])

    modelos = [('base-frecuencias', p_naive), ('poisson-dixon-coles', p_poisson), ('elo', p_elo),
               ('ml-variables', p_ml), ('ml-ponderado', p_ml_peso)]
    resultados = [metricas(y_valid, p, n) for n, p in modelos]
    print(json.dumps(resultados, ensure_ascii=False, indent=2), flush=True)

    # Por temporada de validación.
    por_temporada = {}
    for temp in args.validar:
        m = valid['temporada'].to_numpy() == temp
        if not m.any():
            continue
        por_temporada[temp] = {n: metricas(y_valid[m], p[m], n) for n, p in modelos}

    # Por federación. La consulta de arriba no filtra federación: entrena y valida con TODAS las del
    # canónico, así que el número global no es el de ninguna en concreto. Esto dice cuál es el de cada una.
    por_federacion = {}
    fed_valid = valid['federacion'].to_numpy()
    for fed in sorted(set(fed_valid)):
        m = fed_valid == fed
        if int(m.sum()) < 500:
            continue
        try:
            por_federacion[fed] = {'n': int(m.sum()), **{n: metricas(y_valid[m], p[m], n) for n, p in modelos}}
        except ValueError:
            # Una federación sin alguna de las tres clases en validación no se puede medir con log-loss.
            continue
    partidos_por_federacion = {
        'train': {k: int(v) for k, v in train['federacion'].value_counts().items()},
        'valid': {k: int(v) for k, v in valid['federacion'].value_counts().items()},
    }

    # Calibración del mejor modelo (menor log-loss).
    mejor = min(resultados, key=lambda r: r['log_loss'])
    p_mejor = dict(modelos)[mejor['modelo']]
    calib = calibracion(y_valid, p_mejor)

    salida = {
        'generado_en': datetime.now().isoformat(timespec='seconds'),
        'train_hasta': args.train_hasta,
        'validacion': args.validar,
        'n_train': int(len(train)),
        'n_valid': int(len(valid)),
        'rho_dc': mejor_rho,
        'resultados': resultados,
        'por_temporada': por_temporada,
        'por_federacion': por_federacion,
        'partidos_por_federacion': partidos_por_federacion,
        'calibracion_mejor': {'modelo': mejor['modelo'], 'bins': calib},
        'features_ml': features,
    }
    (SALIDA / 'evaluacion.json').write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'guardado {SALIDA / "evaluacion.json"}', flush=True)


if __name__ == '__main__':
    main()
