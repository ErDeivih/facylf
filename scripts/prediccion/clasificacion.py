"""Monte Carlo de ligas regulares con calendario o deducción verificable."""
from collections import Counter
from itertools import combinations, permutations

import numpy as np
import pandas as pd

from marcadores import sortea

TAMANOS = (500, 1500, 3000, 6000)
PESO_LIGHTGBM = .10


def cruces_formato(equipos, jornadas):
    n = len(equipos)
    if n < 3 or not pd.notna(jornadas):
        return None, ()
    vuelta = n - 1 if n % 2 == 0 else n
    if jornadas == vuelta:
        return 'simple', combinations(sorted(equipos), 2)
    if jornadas == 2 * vuelta:
        return 'doble', permutations(sorted(equipos), 2)
    return None, ()


def calendario_restante(equipos, jornadas, jugados, pendientes):
    formato, esperados = cruces_formato(equipos, jornadas)
    orientados = set(equipos)
    jugados = list(jugados)
    pendientes = list(pendientes)
    if any(h == v or h not in orientados or v not in orientados for h, v in jugados + pendientes):
        return None
    if not formato:
        # Sin formato verificable no se conoce si el calendario visible está completo.
        return None
    clave = (lambda h, v: (h, v)) if formato == 'doble' else (lambda h, v: tuple(sorted((h, v))))
    hechos = {clave(h, v) for h, v in jugados}
    if len(hechos) != len(jugados):
        return None
    futuros = {}
    for h, v in pendientes:
        k = clave(h, v)
        if k in hechos:
            continue
        if k in futuros and futuros[k] != (h, v, False):
            return None
        futuros[k] = (h, v, False)
    deducidos = [(h, v, formato == 'simple') for h, v in esperados if (h, v) not in hechos | futuros.keys()]
    return list(futuros.values()) + deducidos, len(deducidos)


def simula(equipos, jugados, partidos, semilla, posterior=True, tamanos=TAMANOS, pronostico=None, puntos_iniciales=None):
    """Posterior Gamma-Poisson con un ataque y una defensa por equipo y trayectoria."""
    n = len(equipos)
    rng = np.random.default_rng(semilla)
    indice = {x: i for i, x in enumerate(equipos)}
    pj, gf, ga, pts = np.zeros((4, n), dtype=int)
    if puntos_iniciales is not None:
        pts = np.asarray(puntos_iniciales, dtype=int).copy()
    locales, visitantes = [], []
    for r in jugados.itertuples(index=False):
        h, a = indice[r.local], indice[r.visitante]
        locales.append(r.gl)
        visitantes.append(r.gv)
        pj[[h, a]] += 1
        gf[[h, a]] += [int(r.gl), int(r.gv)]
        ga[[h, a]] += [int(r.gv), int(r.gl)]
        if puntos_iniciales is None:
            pts[[h, a]] += [3, 0] if r.gl > r.gv else [0, 3] if r.gl < r.gv else [1, 1]

    if not locales:
        raise ValueError('No hay resultados anteriores al corte')
    ml, mv = max(.05, np.mean(locales)), max(.05, np.mean(visitantes))
    media = (ml + mv) / 2
    tasa = media * (pj + 8)
    forma_ataque, forma_defensa = gf + 8 * media, ga + 8 * media
    muestras = max(tamanos)
    if posterior:
        ataque = rng.gamma(forma_ataque, 1 / tasa, size=(muestras, n))
        defensa = rng.gamma(forma_defensa, 1 / tasa, size=(muestras, n))
    else:
        ataque = np.broadcast_to(forma_ataque / tasa, (muestras, n))
        defensa = np.broadcast_to(forma_defensa / tasa, (muestras, n))
    puntos = np.broadcast_to(pts, (muestras, n)).copy()
    favor = np.broadcast_to(gf, (muestras, n)).copy()
    contra = np.broadcast_to(ga, (muestras, n)).copy()
    if pronostico is not None:
        fuerza = np.log(ataque / (forma_ataque / tasa)) - np.log(defensa / (forma_defensa / tasa))
        rng_modelo = np.random.default_rng([semilla, 1])
    for local, visitante, neutral in partidos:
        h, a = indice[local], indice[visitante]
        lambda_local = np.clip((media if neutral else ml) * ataque[:, h] * defensa[:, a], .01, 30)
        lambda_visitante = np.clip((media if neutral else mv) * ataque[:, a] * defensa[:, h], .01, 30)
        gl, gv = rng.poisson(lambda_local), rng.poisson(lambda_visitante)
        if pronostico is not None:
            # La señal semanal pierde peso cuando se propaga a cruces de toda la temporada.
            # El resto de trayectorias conserva la fuerza de la liga y su varianza posterior.
            pl, px, pv = pronostico[local, visitante]
            usa_modelo = rng_modelo.random(muestras) < PESO_LIGHTGBM
            desvio = np.clip((fuerza[usa_modelo, h] - fuerza[usa_modelo, a]) / 2, -2, 2)
            pesos = np.exp(np.column_stack((desvio, -.5 * np.abs(desvio), -desvio))) * [pl, px, pv]
            p = pesos / pesos.sum(axis=1, keepdims=True)
            gl[usa_modelo], gv[usa_modelo] = sortea(rng_modelo, lambda_local.mean(), lambda_visitante.mean(), p)
        puntos[:, h] += np.where(gl > gv, 3, gl == gv)
        puntos[:, a] += np.where(gv > gl, 3, gl == gv)
        favor[:, h] += gl
        favor[:, a] += gv
        contra[:, h] += gv
        contra[:, a] += gl

    orden = np.lexsort((rng.random((muestras, n)), -favor, contra - favor, -puntos), axis=1)
    posiciones = np.argsort(orden, axis=1) + 1
    distribuciones = {s: np.stack([(posiciones[:s] == pos).mean(axis=0) for pos in range(1, n + 1)], axis=1)
                      for s in sorted(set(tamanos))}
    return posiciones.mean(axis=0), puntos.mean(axis=0), distribuciones


def error(pos, pts, probs, real, puntos, n=TAMANOS[-1]):
    p_real = probs[np.arange(len(real)), real - 1]
    # Jeffreys multinomial para las celdas con cero iteraciones al estimar log-loss.
    p_real = (n * p_real + .5) / (n + len(real) * .5)
    return {'mae_puesto': float(np.abs(pos - real).mean()), 'mae_puntos': float(np.abs(pts - puntos).mean()),
            'log_loss_puesto': float(-np.log(p_real).mean()),
            'brier_campeon': float(np.square(probs[:, 0] - (real == 1)).sum())}


def prepara_ligas(muestra, p, ahora=None, historico=True):
    tablas = {k: g for k, g in muestra['clasificacion'].groupby('grupo')}
    planteles = {k: g for k, g in muestra['equipos'].groupby('grupo')}
    calendarios = ({} if muestra['calendario'] is None else
                   {k: g for k, g in muestra['calendario'].groupby('grupo')})
    ligas = []
    descartes = Counter()
    ahora = pd.Timestamp.now(tz='Europe/Madrid') if ahora is None else ahora
    todos = muestra['partidos']
    actuales_pendientes = {k: g for k, g in todos[(todos.anio == 2026) & todos.estado.eq('scheduled')
                                                   & todos.gl.isna() & todos.gv.isna()
                                                   & todos.fecha.notna()].groupby('grupo')}
    anios = (2024, 2025, 2026) if historico else (2026,)
    for grupo, g in p[p.anio.isin(anios) & p.tipo.eq('liga')].groupby('grupo'):
        meta = g.iloc[0]
        plantel = planteles[grupo]
        if plantel.retirado.any():
            descartes['retirados'] += 1
            continue
        equipos = sorted(plantel.equipo)
        formato, esperados = cruces_formato(equipos, meta.jornadas)
        if not formato:
            descartes['formato'] += 1
            continue
        if meta.anio < 2026:
            oficial = tablas.get(grupo)
            if oficial is None or oficial.jornada.max() != meta.jornadas:
                descartes['clasificacion_oficial'] += 1
                continue
            oficial = oficial[oficial.jornada.eq(meta.jornadas)].set_index('equipo').reindex(equipos)
            if oficial.posicion.isna().any() or set(oficial.posicion) != set(range(1, len(equipos) + 1)):
                descartes['clasificacion_incompleta'] += 1
                continue
            llaves = list(g[['local', 'visitante']].itertuples(index=False, name=None))
            if formato == 'simple':
                llaves = [tuple(sorted(pareja)) for pareja in llaves]
            if len(set(llaves)) != len(llaves) or set(llaves) != set(esperados):
                descartes['resultados_incompletos'] += 1
                continue
            jornada10 = g.loc[g.jornada.eq(10), 'dia']
            if jornada10.empty or jornada10.max() - jornada10.min() > 10:
                descartes['jornada10'] += 1
                continue
            corte = pd.Timestamp.fromordinal(int(jornada10.max() + 1)).tz_localize('Europe/Madrid')
        else:
            oficial = tablas.get(grupo)
            if oficial is not None:
                oficial = oficial[oficial.jornada.eq(oficial.jornada.max())].set_index('equipo').reindex(equipos)
                if oficial.puntos.isna().any():
                    oficial = None
            corte = ahora.normalize()
        anterior = g[g.dia.lt(corte.toordinal())]
        vistos = set(anterior.local) | set(anterior.visitante)
        if vistos != set(equipos):
            descartes['plantel_no_confirmado'] += 1
            continue

        calendario = calendarios.get(grupo)
        conocidos = []
        if meta.anio == 2026 and grupo in actuales_pendientes:
            pendientes = actuales_pendientes[grupo]
            conocidos += list(pendientes.loc[pendientes.fecha.ge(corte.date()), ['local', 'visitante']]
                              .itertuples(index=False, name=None))
        if calendario is not None:
            observado = pd.to_datetime(calendario.observado_en, utc=True)
            anteriores = calendario[observado.le(ahora) if meta.anio == 2026 else observado.lt(corte)]
            conocidos += list(anteriores[['local', 'visitante']].itertuples(index=False, name=None))
            jornadas = {(r.local, r.visitante): r.jornada for r in anteriores.itertuples(index=False)}
        else:
            jornadas = {}
        jugados = list(anterior[['local', 'visitante']].itertuples(index=False, name=None))
        futuro = calendario_restante(equipos, meta.jornadas, jugados, conocidos)
        if futuro is None or not futuro[0]:
            descartes['cruces_inconsistentes_o_sin_pendientes'] += 1
            continue
        cruces, deducidos = futuro
        ligas.append((meta, plantel, equipos, corte, anterior, cruces, deducidos, oficial, jornadas))
    return ligas, descartes


def pronosticos(muestra, p, ahora=None, seleccion=None, modelos=None, simulaciones=TAMANOS[-1]):
    ligas, descartes = seleccion if seleccion is not None else prepara_ligas(muestra, p, ahora)
    tamanos = tuple(n for n in TAMANOS if n < simulaciones) + (simulaciones,)
    historico, actuales = [], []
    for meta, plantel, equipos, corte, anterior, cruces, deducidos, oficial, _ in ligas:
        grupo = meta.grupo
        m = modelos[grupo] if modelos is not None else None
        iniciales = oficial.puntos.to_numpy(dtype=float) if meta.anio == 2026 and oficial is not None else None
        pos, pts, dist = simula(equipos, anterior, cruces, int(grupo), tamanos=tamanos, pronostico=m, puntos_iniciales=iniciales)
        fila = {'anio': int(meta.anio), 'grupo': int(grupo), 'competicion': meta.competicion, 'corte': str(corte),
                'equipos': len(equipos), 'cruces': len(cruces), 'deducidos': deducidos,
                'estabilidad_media': {s: float(np.abs(dist[s] - dist[simulaciones]).mean()) for s in tamanos[:-1]},
                'estabilidad_maxima': {s: float(np.abs(dist[s] - dist[simulaciones]).max()) for s in tamanos[:-1]}}
        if meta.anio == 2026:
            nombres = plantel.set_index('equipo').get('nombre_fuente', pd.Series(dtype=str)).to_dict()
            fila['pronosticos'] = [{'equipo': int(eq), 'nombre': nombres.get(eq),
                                    'puesto_esperado': float(pos[i]), 'puntos_esperados': float(pts[i]),
                                    'probabilidad_por_puesto': dist[simulaciones][i].tolist()} for i, eq in enumerate(equipos)]
            actuales.append(fila)
            continue
        real = oficial.posicion.to_numpy(dtype=int)
        puntos = oficial.puntos.to_numpy(dtype=float)
        if not np.isfinite(puntos).all():
            descartes['clasificacion_incompleta'] += 1
            continue
        p_f, pts_f, dist_f = simula(equipos, anterior, cruces, int(grupo), posterior=False, tamanos=(simulaciones,))
        fila['posterior'] = error(pos, pts, dist[simulaciones], real, puntos, simulaciones)
        fila['poisson_fijo'] = error(p_f, pts_f, dist_f[simulaciones], real, puntos, simulaciones)
        if m is not None:
            pos_g, pts_g, dist_g = simula(equipos, anterior, cruces, int(grupo), tamanos=(simulaciones,))
            fila['gamma_poisson'] = error(pos_g, pts_g, dist_g[simulaciones], real, puntos, simulaciones)
        historico.append(fila)
    resumen = {}
    for anio in (2024, 2025):
        grupos = [f for f in historico if f['anio'] == anio]
        if grupos:
            resumen[anio] = {'grupos': len(grupos), 'equipos': sum(f['equipos'] for f in grupos),
                             **{m: {k: float(np.average([f[m][k] for f in grupos], weights=[f['equipos'] for f in grupos]))
                                    for k in grupos[0][m]} for m in ('posterior', 'poisson_fijo', 'gamma_poisson')
                                if m in grupos[0]}}
    return {'simulaciones': list(tamanos), 'resumen': resumen, 'historico': historico,
            'grupos_actuales': len(actuales), 'actuales': actuales, 'descartes': dict(descartes)}
