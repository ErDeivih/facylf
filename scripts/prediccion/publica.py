"""Publicación semanal de la evaluación elegida para Castilla y León."""
import argparse
import json

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import Json, execute_values
from threadpoolctl import threadpool_limits

from clasificacion import prepara_ligas, pronosticos
from datos import RAIZ, carga_calendario_archivado, conexion, consultas, extrae, guarda_json, url
from mejora import version
from marcadores import rejilla
from modelos import CONFIGS, entrena, poisson, predice
from registro import proximos
from variables import construye, elegibles

PLAN = RAIZ / 'pruebas' / 'prediccion' / 'evaluacion-castilla-leon-2026-11-16.json'
TEMPORADA = 2026


def entrenamiento(p, x, plan, anio):
    inicio = pd.Timestamp(year=anio, month=7, day=1).toordinal()
    train = p.anio.lt(anio) & p.dia.lt(inicio)
    columnas = plan['columnas']
    y = np.select([p.gl.gt(p.gv), p.gl.eq(p.gv)], [0, 1], default=2)
    with threadpool_limits(limits=4):
        return tuple(entrena(x.loc[train], y[train], CONFIGS[n], columnas) for n in (plan['ganador'], 'hgb'))


def porcentajes(p):
    exactos = np.asarray(p) * 10000
    enteros = np.floor(exactos).astype(int)
    enteros[np.argsort(-(exactos - enteros))[:10000 - enteros.sum()]] += 1
    return [int(n) / 100 for n in enteros]


def emite(futuros, xf, modelos, version_modelo, corte, ahora):
    if futuros.empty:
        return []
    with threadpool_limits(limits=4):
        principal, referencia = (predice(m, xf) for m in modelos)
    simple = poisson(xf, principal)
    alternativas = np.stack((principal, referencia, simple))
    filas = []
    for i, r in enumerate(futuros.itertuples(index=False)):
        # Al pasar de día se vuelve a calcular: protege el margen de un día en fechas de jornada.
        if r.fecha <= ahora.date() or (r.tipo_fecha == 'jornada' and (r.fecha - ahora.date()).days < 2):
            continue
        p = porcentajes(principal[i])
        banda = [v for j, z in enumerate(p) for v in (
            min(z, round(100 * alternativas[:, i, j].min(), 2)),
            max(z, round(100 * alternativas[:, i, j].max(), 2)),
        )]
        lh, lv = xf.iloc[i][['lambda_local', 'lambda_visitante']]
        marcador, prob_marcador = None, None
        if np.isfinite([lh, lv]).all():
            m = rejilla(lh, lv, principal[i])
            gl, gv = np.unravel_index(m.argmax(), m.shape)
            marcador, prob_marcador = f'{gl}-{gv}', round(100 * float(m[gl, gv]), 2)
        filas.append((int(r.grupo), int(r.jornada), int(r.local), int(r.visitante), r.fecha, ahora.to_pydatetime(),
                      version_modelo, *p, marcador, prob_marcador, corte, Json([float(v) for v in banda])))
    return filas


def guarda_calendario(cur, archivo):
    if archivo is None or archivo.empty:
        return 0
    grupos = sorted(set(map(int, archivo.grupo)))
    cur.execute('''select phase_group_id, origen, sha256 from core.calendario_previsto
                   where phase_group_id = any(%s) group by 1,2,3''', (grupos,))
    existentes = {}
    for g, origen, sha in cur.fetchall():
        existentes.setdefault(g, set()).add((origen, sha))
    filas = []
    for g, f in archivo.groupby('grupo'):
        viejos = existentes.get(g, set())
        if any(origen != 'archivo_local' for origen, _ in viejos) or viejos == {('archivo_local', f.sha256.iloc[0])}:
            continue
        filas.extend((int(g), int(r.jornada), int(r.orden), int(r.local), int(r.visitante),
                      r.fecha if pd.notna(r.fecha) else None, r.sha256, r.observado_en.to_pydatetime(), r.origen)
                     for r in f.itertuples(index=False))
    if not filas:
        return 0
    cur.execute("delete from core.calendario_previsto where origen = 'archivo_local' and phase_group_id = any(%s)",
                (list({r[0] for r in filas}),))
    execute_values(cur, '''insert into core.calendario_previsto
        (phase_group_id,jornada,orden,home_team_entry_id,away_team_entry_id,fecha_prevista,sha256,observado_en,origen)
        values %s on conflict do nothing''', filas, page_size=1000)
    return len(filas)


def guarda_emisiones(cur, filas):
    if not filas:
        return 0
    nuevas = execute_values(cur, '''insert into analytics.prediccion_emitida_cruce
        (phase_group_id,jornada,home_team_entry_id,away_team_entry_id,fecha_prevista,emitida_en,modelo,
         prob_local,prob_empate,prob_visitante,marcador_probable,prob_marcador,corte_datos,bandas)
        values %s on conflict do nothing returning 1''', filas, page_size=500, fetch=True)
    return len(nuevas)


def publica_partidos(cur, plan):
    medida = plan['desglose']['total']
    cur.execute('''
      insert into analytics.prediccion_ml
        (match_id,prob_local,prob_empate,prob_visitante,prob_local_low,prob_local_high,
         prob_empate_low,prob_empate_high,prob_visitante_low,prob_visitante_high,
         marcador_probable,prob_marcador,modelo,log_loss,brier,baseline_log_loss,corte_datos,calculado_en)
      select m.id,x.prob_local,x.prob_empate,x.prob_visitante,
             (x.bandas->>0)::numeric,(x.bandas->>1)::numeric,(x.bandas->>2)::numeric,
             (x.bandas->>3)::numeric,(x.bandas->>4)::numeric,(x.bandas->>5)::numeric,
             x.marcador_probable,x.prob_marcador,x.modelo,%s,%s,%s,x.corte_datos,x.emitida_en
        from analytics.prediccion_emitida_cruce x
        join core.matchday d on d.phase_group_id=x.phase_group_id and d.numero=x.jornada
        join core.match m on m.matchday_id=d.id and m.phase_group_id=d.phase_group_id
                         and m.home_team_entry_id=x.home_team_entry_id and m.away_team_entry_id=x.away_team_entry_id
       where x.corte_datos is not null and x.bandas is not null
         and m.official_status in ('scheduled','played')
         and not exists (select 1 from core.match duplicado where duplicado.matchday_id=m.matchday_id
                           and duplicado.home_team_entry_id=m.home_team_entry_id
                           and duplicado.away_team_entry_id=m.away_team_entry_id and duplicado.id<>m.id)
         and coalesce((m.played_at at time zone 'Europe/Madrid')::date,m.fecha_prevista)
             > (x.emitida_en at time zone 'Europe/Madrid')::date
      on conflict (match_id) do update set
        prob_local=excluded.prob_local,prob_empate=excluded.prob_empate,prob_visitante=excluded.prob_visitante,
        prob_local_low=excluded.prob_local_low,prob_local_high=excluded.prob_local_high,
        prob_empate_low=excluded.prob_empate_low,prob_empate_high=excluded.prob_empate_high,
        prob_visitante_low=excluded.prob_visitante_low,prob_visitante_high=excluded.prob_visitante_high,
        marcador_probable=excluded.marcador_probable,prob_marcador=excluded.prob_marcador,modelo=excluded.modelo,
        log_loss=excluded.log_loss,brier=excluded.brier,baseline_log_loss=excluded.baseline_log_loss,
        corte_datos=excluded.corte_datos,calculado_en=excluded.calculado_en
      where analytics.prediccion_ml.corte_datos is null
    ''', (medida['log_loss'], medida['brier'], plan['prueba']['hgb_base_causal']['log_loss']))
    return cur.rowcount


def partidos_de_liga(ligas):
    filas = []
    for meta, plantel, _, corte, _, cruces, _, _, jornadas in ligas:
        eq = {r.equipo: r for r in plantel.itertuples(index=False)}
        comunes = {k: meta[k] for k in ('grupo', 'anio', 'categoria', 'modalidad', 'genero', 'nivel')}
        comunes['dia_corte'] = corte.toordinal()

        def lado(h, v, original, neutral):
            return {**comunes, 'local': h, 'visitante': v, 'par': original, 'neutral': neutral,
                    'jornada': jornadas.get((h, v), np.nan),
                    'equipo_local': eq[h].equipo_temporada, 'equipo_visitante': eq[v].equipo_temporada,
                    'club_local': eq[h].club, 'club_visitante': eq[v].club,
                    'nombre_local': eq[h].nombre, 'nombre_visitante': eq[v].nombre}

        for h, v, neutral in cruces:
            filas.append(lado(h, v, (h, v), neutral))
            if neutral:
                filas.append(lado(v, h, (h, v), neutral))
    return pd.DataFrame(filas)


def pronostico_ligas(p, x, fixtures, xf, plan, modelo_actual):
    salida = {}
    if fixtures.empty:
        return salida
    for anio, f in fixtures.groupby('anio'):
        modelo = modelo_actual if anio == TEMPORADA else entrenamiento(p, x, plan, int(anio))[0]
        with threadpool_limits(limits=4):
            proba = predice(modelo, xf.loc[f.index])
        goles = xf.loc[f.index, ['lambda_local', 'lambda_visitante']].to_numpy()
        for r, z, (lh, lv) in zip(f.itertuples(index=False), proba, goles, strict=True):
            if not np.isfinite([lh, lv]).all():
                raise ValueError(f'Falta histórico de goles para el grupo {r.grupo}')
            cruces = salida.setdefault(r.grupo, {})
            if r.par == (r.local, r.visitante):
                cruces[r.par] = np.r_[z, lh, lv]
            else:
                cruces[r.par] = (cruces[r.par] + np.r_[z[::-1], lv, lh]) / 2
    return salida


def publica_ligas(cur, informe, modelo, n):
    cur.execute('''delete from analytics.simulacion_final a using core.phase_group g,
                    core.competition_edition e, core.season s, core.federation f
                    where a.phase_group_id=g.id and g.competition_edition_id=e.id
                      and e.season_id=s.id and e.federation_id=f.id
                      and s.anio_inicio=%s and f.codigo='castilla-leon' ''', (TEMPORADA,))
    filas = [(g['grupo'], t['equipo'], t['puesto_esperado'], t['puntos_esperados'],
              Json(porcentajes(t['probabilidad_por_puesto'])), g['equipos'], n,
              g['cruces'] - g['deducidos'], g['deducidos'], modelo)
             for g in informe['actuales'] for t in g['pronosticos']]
    if filas:
        execute_values(cur, '''insert into analytics.simulacion_final
          (phase_group_id,team_entry_id,posicion_esperada,puntos_medios,prob_posiciones,equipos,
           simulaciones,partidos_pendientes,partidos_deducidos,modelo) values %s''', filas, page_size=500)
    return len(filas)


def registro_publicado(cur):
    informe = {}
    for nombre, sql in consultas('registro-publicado.sql'):
        cur.execute(sql)
        if nombre == 'informe':
            informe[nombre] = [dict(zip((c.name for c in cur.description), fila)) for fila in cur.fetchall()]
        else:
            informe[nombre] = cur.rowcount
    return informe


def transaccion():
    return psycopg2.connect(url('DATABASE_URL_PUBLICADOR'), application_name='facylf-publica-cyl')


def candado(cur):
    cur.execute("select pg_try_advisory_xact_lock(hashtext('facylf:prediccion-cyl'))")
    if not cur.fetchone()[0]:
        raise SystemExit('Ya se está publicando una pasada de Castilla y León')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--temporada', default='2026-27', choices=['2026-27'])
    ap.add_argument('--simulaciones', type=int, default=3000)
    ap.add_argument('--seco', action='store_true')
    ap.add_argument('--backtest', action='store_true')
    ap.add_argument('--solo-registro', action='store_true')
    ap.add_argument('--salida', default=RAIZ / 'estado' / 'prediccion-cyl', type=type(RAIZ))
    args = ap.parse_args()
    if args.simulaciones < 500:
        ap.error('--simulaciones debe ser al menos 500')
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    if args.solo_registro:
        if not args.seco:
            with transaccion() as c, c.cursor() as cur:
                candado(cur)
                informe = {'partidos_publicados': publica_partidos(cur, plan), **registro_publicado(cur)}
            guarda_json(args.salida / 'registro.json', informe)
            print(json.dumps(informe, ensure_ascii=False), flush=True)
        return
    ahora = pd.Timestamp.now(tz='Europe/Madrid')
    corte = ahora.normalize()
    with conexion() as c:
        muestra = extrae(c, 'castilla-leon')
    archivos = carga_calendario_archivado(muestra, ahora, actualizar=True)
    print(f'{archivos:,} cruces de archivo verificados', flush=True)
    futuros = proximos(muestra, ahora)
    elegibles_hasta = elegibles(muestra['partidos']).loc[lambda d: d.dia.lt(corte.toordinal())]
    ligas = prepara_ligas(muestra, elegibles_hasta, ahora, historico=args.backtest)
    fixtures = partidos_de_liga(ligas[0])
    requeridos = pd.concat([futuros.assign(dia_corte=corte.toordinal()), fixtures], ignore_index=True)
    p, x, xf = construye(muestra, requeridos, corte)
    modelo = version(plan, p, x, ahora)
    modelos = entrenamiento(p, x, plan, TEMPORADA)
    proyeccion = pronostico_ligas(p, x, requeridos.iloc[len(futuros):], xf, plan, modelos[0])
    clasificacion = pronosticos(muestra, p, ahora, ligas, proyeccion, args.simulaciones)
    filas = emite(futuros, xf.iloc[:len(futuros)], modelos, modelo, corte.date(), pd.Timestamp.now(tz='Europe/Madrid'))
    informe = {'modelo': modelo, 'corte': corte.date().isoformat(), 'cruces_calculados': len(filas),
               'grupos_proyectados': clasificacion['grupos_actuales']}
    if not args.seco:
        with transaccion() as c, c.cursor() as cur:
            candado(cur)
            informe['calendario_publicado'] = guarda_calendario(cur, muestra.get('calendario_archivado'))
            informe['congeladas'] = guarda_emisiones(cur, filas)
            informe['partidos_publicados'] = publica_partidos(cur, plan)
            informe['equipos_proyectados'] = publica_ligas(cur, clasificacion, modelo, args.simulaciones)
            registro = registro_publicado(cur)
        guarda_json(args.salida / 'registro.json', registro)
    guarda_json(args.salida / 'clasificacion.json', clasificacion)
    guarda_json(args.salida / 'publicacion.json', informe)
    print(json.dumps(informe, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
