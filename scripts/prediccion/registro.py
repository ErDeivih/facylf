"""Registro local de probabilidades selladas y evaluación de jornadas cerradas."""
from contextlib import closing
import sqlite3

import numpy as np
import pandas as pd

from modelos import metricas
from variables import signo

CLAVE = ['grupo', 'jornada', 'local', 'visitante']


def proximos(muestra, emitida):
    p = muestra['partidos']
    temporada = emitida.year if emitida.month >= 7 else emitida.year - 1
    inicio, fin = (emitida + pd.Timedelta(days=d) for d in (2, 8))
    p = p[p.anio.eq(temporada)]
    filas = []
    for r in p[p.estado.eq('scheduled') & p.gl.isna() & p.gv.isna()].to_dict('records'):
        if pd.notna(r['fecha']) and emitida.date() < r['fecha'] <= fin.date():
            filas.append({**r, 'tipo_fecha': 'partido'})
    cal = muestra['calendario']
    if cal is not None and not p.empty:
        plantilla = muestra['equipos'].set_index('equipo')
        grupos = p.drop_duplicates('grupo').set_index('grupo').to_dict('index')
        conocidos = set(p[CLAVE].itertuples(index=False, name=None))
        en_fecha = cal.fecha.notna() & cal.fecha.ge(inicio.date()) & cal.fecha.le(fin.date())
        visto = pd.to_datetime(cal.observado_en, utc=True).le(emitida)
        for r in cal[en_fecha & visto].itertuples(index=False):
            if r.grupo not in grupos or (r.grupo, r.jornada, r.local, r.visitante) in conocidos:
                continue
            if r.local not in plantilla.index or r.visitante not in plantilla.index:
                continue
            h, v = plantilla.loc[r.local], plantilla.loc[r.visitante]
            if h.retirado or v.retirado or h.grupo != r.grupo or v.grupo != r.grupo:
                continue
            fila = {**grupos[r.grupo], 'grupo': r.grupo, 'jornada': r.jornada, 'local': r.local,
                    'visitante': r.visitante, 'fecha': r.fecha, 'partido': None, 'tipo_fecha': 'jornada',
                    'equipo_local': h.equipo_temporada, 'equipo_visitante': v.equipo_temporada,
                    'club_local': h.club, 'club_visitante': v.club, 'nombre_local': h.nombre, 'nombre_visitante': v.nombre}
            filas.append(fila)
    if not filas:
        return p.iloc[:0].copy()
    f = pd.DataFrame(filas).drop_duplicates([*CLAVE, 'fecha'])
    return f[~f.duplicated(CLAVE, keep=False)].sort_values(['fecha', *CLAVE]).reset_index(drop=True)


def evalua_filas(filas):
    y = filas.signo.to_numpy(dtype=int)
    proba = filas[['p1', 'px', 'p2']].to_numpy(dtype=float)
    return metricas(y, proba)


def deriva(periodos, umbral):
    if len(periodos) < 10:
        return {'estado': 'sin cinco jornadas recientes y cinco anteriores', 'alerta': None}
    anteriores, ultimos = periodos[:-5], periodos[-5:]
    media = lambda p: float(np.average([v['log_loss'] for v in p], weights=[v['n'] for v in p]))
    antes, ahora = media(anteriores), media(ultimos)
    return {'estado': 'medida', 'alerta': ahora > antes + umbral, 'log_loss_referencia': antes,
            'log_loss_ultimas_cinco': ahora, 'umbral': umbral}


def actualiza(ruta, futuros, probabilidades, resultados, modelo, emitida, umbral=.05):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(ruta, timeout=30)) as db:
        db.execute('''create table if not exists registro (
            grupo integer not null, jornada integer not null, local integer not null, visitante integer not null,
            temporada integer not null, competicion text not null, prevista text not null, emitida text not null,
            modelo text not null, p1 real not null, px real not null, p2 real not null,
            fecha_resultado text, signo integer,
            primary key (grupo, jornada, local, visitante))''')
        with db:
            db.execute('begin immediate')
            antes = db.total_changes
            db.executemany('''insert into registro (grupo, jornada, local, visitante, temporada, competicion,
                              prevista, emitida, modelo, p1, px, p2) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                              on conflict (grupo, jornada, local, visitante) do nothing''',
                           [(int(r.grupo), int(r.jornada), int(r.local), int(r.visitante), int(r.anio), r.competicion,
                             r.fecha.isoformat(), emitida.isoformat(), modelo, *map(float, p))
                            for r, p in zip(futuros.itertuples(index=False), probabilidades, strict=True)
                            if r.fecha > emitida.date()])
            congeladas = db.total_changes - antes
            claves = set(db.execute('select grupo, jornada, local, visitante from registro'))
            antes = db.total_changes
            db.executemany('''update registro set fecha_resultado = ?, signo = ?
                              where grupo = ? and jornada = ? and local = ? and visitante = ?
                                and substr(emitida, 1, 10) < ? and (fecha_resultado is not ? or signo is not ?)''',
                           [(r.fecha.isoformat(), signo(r.gl, r.gv), int(r.grupo), int(r.jornada), int(r.local),
                             int(r.visitante), r.fecha.isoformat(), r.fecha.isoformat(), signo(r.gl, r.gv))
                            for r in resultados.itertuples(index=False)
                            if (r.grupo, r.jornada, r.local, r.visitante) in claves])
            actualizadas = db.total_changes - antes
            datos = pd.read_sql_query('select * from registro order by temporada, grupo, jornada, local, visitante', db)

    temporadas = []
    cerradas = (set(resultados.loc[resultados.cerrada, ['grupo', 'jornada']].itertuples(index=False, name=None))
                if 'cerrada' in resultados else set())
    cerrados = datos[datos.signo.notna()]
    for (temporada, version), filas in cerrados.groupby(['temporada', 'modelo']):
        semanas = pd.to_datetime(filas.fecha_resultado).dt.to_period('W-SUN').astype(str)
        periodos = [{'semana': semana, **evalua_filas(f)} for semana, f in filas.groupby(semanas)]
        jornadas = [{'grupo': int(grupo), 'jornada': int(jornada), 'competicion': f.competicion.iloc[0],
                     'cerrada': (grupo, jornada) in cerradas,
                     **evalua_filas(f)} for (grupo, jornada), f in filas.groupby(['grupo', 'jornada'])]
        por_grupo = {int(g): [] for g in filas.grupo.unique()}
        for jornada in jornadas:
            if jornada['cerrada']:
                por_grupo[jornada['grupo']].append(jornada)
        temporadas.append({'temporada': int(temporada), 'modelo': version, 'acumulado': evalua_filas(filas),
                           'jornadas': jornadas, 'semanas': periodos, 'deriva_semanal': deriva(periodos, umbral),
                           'deriva_por_grupo': {g: deriva(historia, umbral) for g, historia in por_grupo.items()}})
    return {'congeladas_en_esta_pasada': congeladas, 'resultados_actualizados': actualizadas,
            'congeladas_total': len(datos), 'evaluadas_total': len(cerrados), 'temporadas': temporadas}
