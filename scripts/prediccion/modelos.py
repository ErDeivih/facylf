"""Comparación 1-X-2 con origen móvil y selección previa a las dos temporadas de prueba."""
from itertools import product

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from scipy.stats import skellam
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from variables import BASE, VARIABLES

DESARROLLO = (2021, 2022, 2023)
PRUEBA = (2024, 2025)
CLASES = ('local', 'empate', 'visitante')
CONFIGS = {
    'hgb': ('hgb', 31, 100, 130, 1.),
    'hgb_regularizado': ('hgb', 31, 250, 220, 5.),
    'hgb_hojas_15': ('hgb', 15, 120, 200, 1.),
    'lightgbm': ('lightgbm', 31, 120, 220, 5.),
    'lightgbm_hojas_63': ('lightgbm', 63, 200, 200, 10.),
    'logistica_C_0.1': ('logistica', .1),
    'logistica_C_1': ('logistica', 1.),
}


def probabilidades(p):
    p = np.clip(np.asarray(p, dtype=np.float64), 1e-12, 1)
    return p / p.sum(axis=1, keepdims=True)


def metricas(y, p):
    p = probabilidades(p)
    y = np.asarray(y)
    real = np.eye(3)[y]
    perdidas = -np.log(p[np.arange(len(y)), y])
    ece, filas = {}, []
    for i, clase in enumerate(CLASES):
        error = 0.
        for b in range(5):
            mascara = np.minimum((p[:, i] * 5).astype(int), 4) == b
            n = int(mascara.sum())
            if not n:
                continue
            previsto, observado = float(p[mascara, i].mean()), float(real[mascara, i].mean())
            error += n * abs(previsto - observado)
            filas.append({'clase': clase, 'desde': b / 5, 'hasta': (b + 1) / 5,
                          'n': n, 'previsto': previsto, 'observado': observado})
        ece[clase] = error / len(y)
    return {'n': len(y), 'log_loss': float(perdidas.mean()),
            'brier': float(np.square(p - real).sum(axis=1).mean()),
            'acierto': float((p.argmax(axis=1) == y).mean()), 'ece': float(np.mean(list(ece.values()))),
            'ece_por_clase': ece, 'calibracion': filas}


def categorias(p):
    senior = p.categoria.eq('aficionados')
    tercera = senior & p.competicion.str.contains(r'tercera\s*(?:rfef|federaci[oó]n|divisi[oó]n)', case=False, regex=True)
    return np.select([tercera, senior & p.ambito.eq('regional'), senior & p.ambito.eq('provincial')],
                     ['Tercera RFEF', 'Regional aficionados', 'Provinciales aficionados'],
                     default=np.where(senior, 'Otros aficionados', p.categoria))


def pliegues(p):
    for anio in (*DESARROLLO, *PRUEBA):
        inicio, fin = [pd.Timestamp(year=a, month=7, day=1).toordinal() for a in (anio, anio + 1)]
        train = p.anio.lt(anio) & p.dia.lt(inicio)
        valid = p.anio.eq(anio) & p.dia.ge(inicio) & p.dia.lt(fin)
        if not train.any() or not valid.any():
            raise ValueError(f'Partición vacía en {anio}')
        yield anio, train.to_numpy(), valid.to_numpy()


def clasificador(config, columnas):
    if config[0] == 'logistica':
        return make_pipeline(SimpleImputer(strategy='median', add_indicator=True), StandardScaler(),
                             LogisticRegression(C=config[1], max_iter=250))
    _, hojas, muestras, vueltas, l2 = config
    categoricas = [i for i, c in enumerate(columnas) if c.endswith('_id')]
    if config[0] == 'hgb':
        return HistGradientBoostingClassifier(max_iter=vueltas, learning_rate=.065, max_leaf_nodes=hojas,
                                              min_samples_leaf=muestras, l2_regularization=l2,
                                              categorical_features=categoricas or None, early_stopping=False,
                                              random_state=42)
    return LGBMClassifier(objective='multiclass', n_estimators=vueltas, num_leaves=hojas,
                          min_child_samples=muestras, learning_rate=.05, reg_lambda=l2, colsample_bytree=.9,
                          deterministic=True, force_col_wise=True, random_state=42, n_jobs=4, verbosity=-1)


def entrena(x, y, config, columnas, peso=None):
    columnas = [c for c in columnas if x[c].notna().any()]
    modelo = clasificador(config, columnas)
    kwargs = {}
    if config[0] == 'lightgbm':
        kwargs['categorical_feature'] = [c for c in columnas if c.endswith('_id')]
    if peso is not None:
        kwargs['logisticregression__sample_weight' if config[0] == 'logistica' else 'sample_weight'] = peso
    return modelo.fit(x[columnas], y, **kwargs)


def predice(modelo, x):
    p = np.full((len(x), 3), 1e-12)
    p[:, modelo.classes_] = modelo.predict_proba(x[list(modelo.feature_names_in_)])
    return probabilidades(p)


def poisson(x, frecuencia):
    lh, lv = x.lambda_local.to_numpy(), x.lambda_visitante.to_numpy()
    ok = np.isfinite(lh) & np.isfinite(lv)
    p = frecuencia.copy()
    p[ok] = np.column_stack([skellam.sf(0, lh[ok], lv[ok]), skellam.pmf(0, lh[ok], lv[ok]),
                             skellam.cdf(-1, lh[ok], lv[ok])])
    return probabilidades(p)


def lineas_base(p_train, x_train, y, p_previsto, x_previsto):
    c = ['categoria', 'modalidad', 'genero']
    globales = np.bincount(y, minlength=3) + 1
    globales = globales / globales.sum()
    tabla = p_train[c].assign(y=y).groupby([*c, 'y']).size().unstack(fill_value=0)
    indice = pd.MultiIndex.from_frame(p_previsto[c])
    frecuencia = tabla.reindex(index=indice, columns=range(3)).fillna(0).to_numpy() + 15 * globales
    frecuencia = frecuencia / frecuencia.sum(axis=1, keepdims=True)
    elo = entrena(x_train, y, ('logistica', 1.), ['elo_diff'])
    return {'siempre_local': np.tile([1., 0., 0.], (len(p_previsto), 1)), 'frecuencias': frecuencia,
            'elo': predice(elo, x_previsto), 'poisson': poisson(x_previsto, frecuencia)}


def isotonic_fit(p, y):
    return [IsotonicRegression(out_of_bounds='clip').fit(p[:, k], y == k) for k in range(3)]


def isotonic_predict(cal, p):
    return probabilidades(np.column_stack([m.predict(p[:, k]) for k, m in enumerate(cal)]))


def ajuste_meta(p):
    return np.concatenate([np.log(probabilidades(p[n])) for n in ('arbol', 'elo', 'poisson')], axis=1)


def logloss(y, p):
    return float(-np.log(probabilidades(p)[np.arange(len(y)), y]).mean())


def resumen(p, y, proba):
    etiquetas = categorias(p)
    anios = p.anio.to_numpy()
    return {'total': metricas(y, proba),
            'temporadas': {str(a): metricas(y[anios == a], proba[anios == a]) for a in sorted(set(anios))},
            'categorias': {c: metricas(y[etiquetas == c], proba[etiquetas == c]) for c in sorted(set(etiquetas))},
            'temporada_categoria': {f'{a}/{c}': metricas(y[m], proba[m])
                                    for a, c in product(sorted(set(anios)), sorted(set(etiquetas)))
                                    if (m := (anios == a) & (etiquetas == c)).any()}}


@threadpool_limits.wrap(limits=4)
def evalua(p, x):
    y = np.select([p.gl.gt(p.gv), p.gl.eq(p.gv)], [0, 1], default=2)
    pl = {a: (t, v) for a, t, v in pliegues(p)}

    def entrena_pliegue(anio, config, columnas, decaimiento=1.):
        train, valid = pl[anio]
        peso = decaimiento ** (anio - 1 - p.anio[train].to_numpy()) if decaimiento != 1 else None
        modelo = entrena(x.loc[train], y[train], config, columnas, peso)
        return predice(modelo, x.loc[valid])

    def perdidas(pred):
        return {str(a): logloss(y[pl[a][1]], pred[a]) for a in pred}

    def media(l):
        return float(np.mean(list(l.values())))

    columnas = BASE.copy()
    pred_base = {a: entrena_pliegue(a, CONFIGS['hgb'], columnas) for a in DESARROLLO}
    anterior = perdidas(pred_base)
    ablacion = []
    retenidos = []
    for nombre, variables in VARIABLES.items():
        ensayos = {}
        if nombre == 'forma_decaimiento':
            for tau in (21, 60, 180):
                subset = [v for v in variables if v.startswith(f'forma_{tau}_')]
                ensayos[str(tau)] = (subset, perdidas({a: entrena_pliegue(a, CONFIGS['hgb'], columnas + subset)
                                                     for a in DESARROLLO}))
        candidato = columnas + variables
        perdidas_c = perdidas({a: entrena_pliegue(a, CONFIGS['hgb'], candidato) for a in DESARROLLO})
        ensayo_forma = {}
        if ensayos:
            ensayos['combinados'] = (variables, perdidas_c)
            mejor_ventana = min(ensayos, key=lambda k: media(ensayos[k][1]))
            variables, perdidas_c = ensayos[mejor_ventana]
            candidato = columnas + variables
            ensayo_forma = {'variantes': {k: valor[1] for k, valor in ensayos.items()}, 'ventana': mejor_ventana}
        retener = (media(perdidas_c) < media(anterior)
                   and sum(perdidas_c[a] > anterior[a] for a in anterior) <= 1)
        cobertura = {str(a): float(x.loc[pl[a][1], variables].notna().any(axis=1).mean()) for a in DESARROLLO}
        ablacion.append({'bloque': nombre, 'antes': anterior, 'despues': perdidas_c, 'retener': retener,
                         'cobertura': cobertura, **ensayo_forma})
        print(f'{nombre}: {media(anterior):.5f} -> {media(perdidas_c):.5f} ({"sí" if retener else "no"})', flush=True)
        if retener:
            retenidos.append(nombre)
            columnas, anterior = candidato, perdidas_c

    y_des = {a: y[pl[a][1]] for a in DESARROLLO}
    modelos = {n: {a: entrena_pliegue(a, conf, columnas) for a in DESARROLLO} for n, conf in CONFIGS.items()}
    ganador_arbol = min((n for n in modelos if CONFIGS[n][0] != 'logistica'),
                        key=lambda n: media(perdidas(modelos[n])))
    desgaste = {f'{v:.2f}': perdidas({a: entrena_pliegue(a, CONFIGS[ganador_arbol], columnas, v)
                                     for a in DESARROLLO}) for v in (.75, .85, .95)}
    decaimiento = min(desgaste, key=lambda d: media(desgaste[d]))
    if media(desgaste[decaimiento]) >= media(perdidas(modelos[ganador_arbol])):
        decaimiento = '1.00'
    else:
        modelos['arbol_decaimiento'] = {a: entrena_pliegue(a, CONFIGS[ganador_arbol], columnas, float(decaimiento))
                                       for a in DESARROLLO}

    base = {a: lineas_base(p.loc[t], x.loc[t], y[t], p.loc[v], x.loc[v])
            for a, (t, v) in pl.items()}
    arbol_meta = modelos.get('arbol_decaimiento', modelos[ganador_arbol])
    meta_x = {a: ajuste_meta({**base[a], 'arbol': arbol_meta[a]}) for a in DESARROLLO}

    def logistica_meta(anios):
        return LogisticRegression(C=1., max_iter=250).fit(np.concatenate([meta_x[a] for a in anios]),
                                                         np.concatenate([y_des[a] for a in anios]))

    # Todo calibrador y apilado se puntúa sólo en los pliegues posteriores al de ajuste.
    ultimos = DESARROLLO[1:]
    seleccion = {n: perdidas({a: proba[a] for a in ultimos}) for n, proba in modelos.items()}
    ganador_simple = min(seleccion, key=lambda n: media(seleccion[n]))
    seleccion['apilado'] = perdidas({a: logistica_meta(DESARROLLO[:i]).predict_proba(meta_x[a])
                                     for i, a in enumerate(DESARROLLO) if i})
    simple = modelos[ganador_simple]
    seleccion['isotonica'] = perdidas({a: isotonic_predict(
        isotonic_fit(np.concatenate([simple[z] for z in DESARROLLO[:i]]),
                     np.concatenate([y_des[z] for z in DESARROLLO[:i]])), simple[a])
        for i, a in enumerate(DESARROLLO) if i})
    ganador = min(seleccion, key=lambda n: media(seleccion[n]))
    print(f'Selección cerrada en desarrollo: {ganador}', flush=True)

    pruebas = {n: {a: entrena_pliegue(a, conf, columnas) for a in PRUEBA} for n, conf in CONFIGS.items()}
    if float(decaimiento) != 1.:
        pruebas['arbol_decaimiento'] = {a: entrena_pliegue(a, CONFIGS[ganador_arbol], columnas, float(decaimiento))
                                        for a in PRUEBA}
    for n in base[PRUEBA[0]]:
        pruebas[n] = {a: base[a][n] for a in PRUEBA}
    meta = logistica_meta(DESARROLLO)
    arbol_prueba = pruebas.get('arbol_decaimiento', pruebas[ganador_arbol])
    pruebas['apilado'] = {a: meta.predict_proba(ajuste_meta({**base[a], 'arbol': arbol_prueba[a]})) for a in PRUEBA}
    cal = isotonic_fit(np.concatenate([simple[a] for a in DESARROLLO]), np.concatenate(list(y_des.values())))
    pruebas['isotonica'] = {a: isotonic_predict(cal, pruebas[ganador_simple][a]) for a in PRUEBA}
    pruebas['hgb_base_causal'] = {a: entrena_pliegue(a, CONFIGS['hgb'], BASE) for a in PRUEBA}
    indices = np.concatenate([np.flatnonzero(pl[a][1]) for a in PRUEBA])
    otros = {n: metricas(y[indices], np.concatenate([proba[a] for a in PRUEBA])) for n, proba in pruebas.items()}
    ganador_probs = np.concatenate([pruebas[ganador][a] for a in PRUEBA])
    return {'particiones': {str(a): {'entrenamiento': int(t.sum()), 'validacion': int(v.sum())} for a, (t, v) in pl.items()},
            'ablacion': ablacion, 'bloques_retenidos': retenidos, 'columnas': columnas,
            'arbitro': 'sin designaciones históricas fechadas antes del partido',
            'decaimiento_entre_temporadas': {'candidatos': desgaste, 'elegido': float(decaimiento)},
            'seleccion': seleccion, 'ganador': ganador, 'ganador_simple': ganador_simple, 'arbol': ganador_arbol,
            'prueba': otros, 'desglose': resumen(p.iloc[indices], y[indices], ganador_probs)}


@threadpool_limits.wrap(limits=4)
def pronostica(p, x, futuros, xf, plan):
    if futuros.empty:
        return np.empty((0, 3))
    y = np.select([p.gl.gt(p.gv), p.gl.eq(p.gv)], [0, 1], default=2)
    ganador = plan['ganador']
    columnas = plan['columnas']
    arbol = plan['arbol']
    simple = plan['ganador_simple']
    dec = plan['decaimiento_entre_temporadas']['elegido']
    config_id = arbol if ganador == 'apilado' or ganador == 'arbol_decaimiento' else (
        simple if ganador == 'isotonica' else ganador)
    pesos = dec if ganador in ('apilado', 'arbol_decaimiento') or config_id == 'arbol_decaimiento' else 1.
    config = CONFIGS[arbol if config_id == 'arbol_decaimiento' else config_id]

    def calcula(anio, train, pv, xv):
        w = pesos ** (anio - 1 - p.anio[train].to_numpy()) if pesos != 1. else None
        m = entrena(x.loc[train], y[train], config, columnas, w)
        proba = predice(m, xv)
        if ganador == 'apilado':
            base = lineas_base(p.loc[train], x.loc[train], y[train], pv, xv)
            return ajuste_meta({**base, 'arbol': proba})
        return proba

    anio = int(futuros.anio.iloc[0])
    inicio = pd.Timestamp(year=anio, month=7, day=1).toordinal()
    train = (p.anio.lt(anio) & p.dia.lt(inicio)).to_numpy()
    previsto = calcula(anio, train, futuros, xf)
    if ganador not in ('apilado', 'isotonica'):
        return previsto

    oof, signos = [], []
    for a, t, v in pliegues(p):
        if a not in DESARROLLO:
            break
        oof.append(calcula(a, t, p.loc[v], x.loc[v]))
        signos.append(y[v])
    oof, signos = np.concatenate(oof), np.concatenate(signos)
    if ganador == 'apilado':
        return LogisticRegression(C=1., max_iter=250).fit(oof, signos).predict_proba(previsto)
    return isotonic_predict(isotonic_fit(oof, signos), previsto)
