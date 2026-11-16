"""Lecturas del canónico y artefactos locales de evaluación."""
import json
import os
import subprocess
import unicodedata
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile

import pandas as pd
import psycopg2

RAIZ = Path(__file__).resolve().parents[2]
SQL = Path(__file__).resolve().parent


def url(nombre='DATABASE_URL_LECTOR'):
    valor = os.getenv(nombre)
    env = RAIZ / '.env'
    if not valor and env.exists():
        for linea in env.read_text(encoding='utf-8-sig').splitlines():
            if linea.startswith(f'{nombre}='):
                return linea.split('=', 1)[1].strip().strip('"\'')
    if not valor:
        raise SystemExit(f'Falta {nombre}')
    return valor


@contextmanager
def conexion():
    c = psycopg2.connect(url(), connect_timeout=8, application_name='prediccion-experimentos',
                         options='-c statement_timeout=240000 -c max_parallel_workers_per_gather=0')
    try:
        c.set_session(readonly=True, isolation_level='REPEATABLE READ')
        with c:
            yield c
    finally:
        c.close()


def consulta(c, sql, parametros=None):
    with c.cursor() as cur:
        cur.execute(sql, parametros)
        return pd.DataFrame.from_records(cur.fetchall(), columns=[col.name for col in cur.description])


def existe(c, tabla):
    with c.cursor() as cur:
        cur.execute('select to_regclass(%s) is not null', (tabla,))
        return cur.fetchone()[0]


def guarda_json(ruta, datos):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile('w', dir=ruta.parent, encoding='utf-8', delete=False) as archivo:
        temporal = Path(archivo.name)
        try:
            json.dump(datos, archivo, ensure_ascii=False, indent=2, allow_nan=False)
            archivo.write('\n')
            archivo.close()
            temporal.replace(ruta)
        finally:
            temporal.unlink(missing_ok=True)


def consultas(nombre):
    contenido = (SQL / nombre).read_text(encoding='utf-8')
    for seccion in contenido.strip().split('-- consulta: ')[1:]:
        nombre, sql = seccion.split('\n', 1)
        yield nombre, sql


def auditoria(c):
    tiene_fotos = existe(c, 'core.person_asset')
    return {nombre: (consulta(c, sql).to_dict('records') if nombre != 'fotos' or tiene_fotos else None)
            for nombre, sql in consultas('auditoria.sql')}


def extrae(c, federacion):
    parametros = {'federacion': federacion, 'desde': 2017, 'hasta': 2026}
    muestra = {}
    for nombre, sql in consultas('muestra.sql'):
        if nombre == 'calendario' and not existe(c, 'core.calendario_previsto'):
            muestra[nombre] = None
            continue
        if nombre in ('eventos', 'plantillas', 'tecnicos'):
            partes = []
            ids = muestra['partidos'].loc[lambda d: d.fecha.notna() & d.estado.eq('played'), 'partido'].tolist()
            for inicio in range(0, len(ids), 8000):
                partes.append(consulta(c, sql, {'ids': ids[inicio:inicio + 8000]}))
            muestra[nombre] = pd.concat(partes, ignore_index=True) if partes else consulta(c, sql, {'ids': []})
        else:
            muestra[nombre] = consulta(c, sql, parametros)
        if nombre == 'partidos':
            if muestra[nombre].empty:
                raise SystemExit(f'No hay partidos para {federacion}')
            parametros['grupos'] = muestra[nombre]['grupo'].unique().tolist()
        print(f'{nombre}: {len(muestra[nombre]):,}', flush=True)
    return muestra


def carga_calendario_archivado(muestra, ahora):
    """Sólo para el presente. La fecha de archivo local no acredita publicación histórica."""
    carpeta = RAIZ / 'descargas-federacion' / 'recolector-local'
    if not carpeta.is_dir():
        return 0
    anio = ahora.year if ahora.month >= 7 else ahora.year - 1
    temporada = f'{anio}-{(anio + 1) % 100:02d}'
    cal = muestra['calendario']
    canonicos = set(cal.grupo) if cal is not None else set()
    grupos = {(r.competicion, r.codigo): r.grupo for r in muestra['grupos'].itertuples(index=False)
              if r.anio == anio and r.grupo not in canonicos}
    if not grupos:
        return 0
    def normaliza(nombre):
        return ' '.join(unicodedata.normalize('NFKC', nombre).casefold().split())

    equipos = muestra['equipos'].assign(etiqueta=lambda d: d.nombre_fuente.map(normaliza))
    por_codigo, por_nombre = {}, {}
    for columna, mapa in [('codigo', por_codigo), ('etiqueta', por_nombre)]:
        unicos = equipos.loc[~equipos.duplicated(['grupo', columna], keep=False) & equipos[columna].notna()
                             & ~equipos.retirado]
        mapa.update({(r.grupo, getattr(r, columna)): r.equipo for r in unicos.itertuples(index=False)})
    partidos = muestra['partidos']
    previos = {g: set(f[['jornada', 'local', 'visitante']].itertuples(index=False, name=None))
               for g, f in partidos.loc[partidos.anio.eq(anio) & partidos.estado.eq('played')
                                        & partidos.fecha.lt(ahora.date())].groupby('grupo')}
    archivos = json.loads(subprocess.check_output(['node', str(SQL / 'calendario-archivado.mjs'),
                                                    str(carpeta), temporada], encoding='utf-8', timeout=180))
    filas = []
    for a in archivos:
        grupo = grupos.get((a['competicion'], a['grupo']))
        if grupo is None or pd.Timestamp(a['observado']) > ahora:
            continue
        def inscripcion(lado):
            if lado['codigo'] is not None:
                return por_codigo.get((grupo, lado['codigo']))
            return por_nombre.get((grupo, normaliza(lado['nombre'])))

        cruzados = [(p['jornada'], inscripcion(p['local']), inscripcion(p['visitante']), p['fecha']) for p in a['cruces']]
        if any(h is None or v is None or h == v for _, h, v, _ in cruzados):
            continue
        llaves = {(j, h, v) for j, h, v, _ in cruzados}
        # Con nombres de equipo en el HTML, validar la identificación en el grupo contra cruces reales.
        anteriores = previos.get(grupo, set())
        if len(anteriores & llaves) < 3 or not anteriores <= llaves:
            continue
        filas.extend({'grupo': grupo, 'jornada': j, 'local': h, 'visitante': v, 'fecha': fecha,
                      'observado_en': ahora, 'origen': 'archivo_local'} for j, h, v, fecha in cruzados)
    if filas:
        archivo = pd.DataFrame(filas)
        archivo['fecha'] = pd.to_datetime(archivo.fecha, errors='coerce').dt.date
        muestra['calendario'] = pd.concat([cal, archivo], ignore_index=True) if cal is not None else archivo
    return len(filas)
