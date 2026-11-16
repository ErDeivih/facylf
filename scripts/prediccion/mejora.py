#!/usr/bin/env python3
"""Auditoría, evaluación temporal, proyección y registro local de Castilla y León."""
import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

from clasificacion import pronosticos
from datos import RAIZ, auditoria, carga_calendario_archivado, conexion, extrae, guarda_json
from historico import reproduce
from modelos import evalua, pronostica
from registro import CLAVE, actualiza, proximos
from variables import construye


def version(plan, partidos, variables, ahora):
    huella = hashlib.sha256(json.dumps(plan['especificacion'], sort_keys=True).encode())
    for fichero in ('muestra.sql', 'variables.py', 'modelos.py'):
        huella.update(Path(__file__).with_name(fichero).read_bytes())
    temporada = ahora.year if ahora.month >= 7 else ahora.year - 1
    inicio = pd.Timestamp(year=temporada, month=7, day=1).toordinal()
    train = partidos.anio.lt(temporada) & partidos.dia.lt(inicio)
    entrada = pd.concat([partidos.loc[train, ['partido', 'gl', 'gv']], variables.loc[train, plan['columnas']]], axis=1)
    huella.update(pd.util.hash_pandas_object(entrada, index=False).to_numpy().tobytes())
    return f"{plan['ganador']}-{huella.hexdigest()[:12]}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--salida', type=Path, default=RAIZ / 'tmp' / 'prediccion')
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument('--solo-historico', action='store_true')
    modo.add_argument('--semanal', action='store_true', help='usa el modelo seleccionado por la evaluación completa')
    parser.add_argument('--umbral-deriva', type=float, default=.05)
    parser.add_argument('--calendario-archivado', action='store_true',
                        help='complementa el canónico con los calendarios PNFG ya archivados en disco')
    args = parser.parse_args()
    if not 0 < args.umbral_deriva <= 1:
        parser.error('--umbral-deriva debe estar entre 0 y 1')
    salida = args.salida.resolve()
    if args.solo_historico:
        reproduce(salida / 'historico')
        return
    archivo_plan = salida / 'modelos.json'
    plan = None
    if args.semanal:
        if not archivo_plan.is_file():
            parser.error('ejecuta primero la evaluación completa en el mismo directorio de salida')
        plan = json.loads(archivo_plan.read_text(encoding='utf-8'))

    ahora = pd.Timestamp.now(tz='Europe/Madrid')
    with conexion() as c:
        if not args.semanal:
            guarda_json(salida / 'auditoria.json', auditoria(c))
        muestra = extrae(c, 'castilla-leon')
    if args.calendario_archivado:
        n = carga_calendario_archivado(muestra, ahora)
        print(f'Cruces incorporados desde calendarios archivados: {n:,}', flush=True)
    futuros = proximos(muestra, ahora)
    partidos, variables, previstas = construye(muestra, futuros, ahora.normalize())
    print(f'Partidos con fecha y resultado elegibles: {len(partidos):,}', flush=True)
    if plan is None:
        plan = evalua(partidos, variables)
        plan['especificacion'] = {k: plan[k] for k in ('ganador', 'ganador_simple', 'arbol', 'columnas')}
        plan['especificacion']['decaimiento'] = plan['decaimiento_entre_temporadas']['elegido']
        guarda_json(archivo_plan, plan)
    modelo = version(plan, partidos, variables, ahora)
    probabilidades = pronostica(partidos, variables, futuros, previstas, plan)
    emitida = pd.Timestamp.now(tz='Europe/Madrid')
    nombres = muestra['equipos'].set_index('equipo').get('nombre_fuente', pd.Series(dtype=str)).to_dict()
    guarda_json(salida / 'partidos.json', {'modelo': modelo, 'datos_anteriores_a': ahora.date().isoformat(),
                                          'emitida': emitida.isoformat(), 'partidos': [
        {**{k: int(fila[k]) for k in CLAVE}, 'fecha': fila['fecha'].isoformat(), 'tipo_fecha': fila['tipo_fecha'],
         'competicion': fila['competicion'], 'equipo_local': nombres.get(fila['local'], fila['nombre_local']),
         'equipo_visitante': nombres.get(fila['visitante'], fila['nombre_visitante']),
         'p1': float(p[0]), 'px': float(p[1]), 'p2': float(p[2])}
        for fila, p in zip(futuros.to_dict('records'), probabilidades, strict=True)]})
    if not args.semanal:
        reproduce(salida / 'historico')
    simulacion = pronosticos(muestra, partidos, ahora)
    guarda_json(salida / 'clasificacion.json', simulacion)
    registro = actualiza(salida / 'registro.sqlite', futuros, probabilidades, partidos,
                         modelo, emitida, args.umbral_deriva)
    guarda_json(salida / 'registro.json', registro)
    print(f'{len(futuros)} partidos pronosticados, {simulacion["grupos_actuales"]} grupos proyectados. Salida {salida}', flush=True)


if __name__ == '__main__':
    main()
