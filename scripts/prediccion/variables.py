"""Variables reconstruidas por día local. El lote de un día se lee entero antes de actualizarlo."""
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from itertools import combinations, groupby
from math import exp, nan

import numpy as np
import pandas as pd

TAUS = (21, 60, 180)
BASE = ['elo_local', 'elo_visitante', 'elo_diff', 'lambda_local', 'lambda_visitante',
        'jornada', 'nivel', 'categoria_id', 'modalidad_id', 'genero_id']
BLOQUES = {
    'forma_decaimiento': [f'forma_{tau}' for tau in TAUS],
    'tercio_alto': ['contra_arriba'],
    'tercio_bajo': ['contra_abajo'],
    'descanso': ['descanso'],
    'horario_habitual': ['hora_media', 'horas_conocidas'],
    'entrenador': ['tecnico_antiguedad', 'tecnico_cambios'],
    'remontadas': ['remontadas', 'pierde_ventaja'],
    'expulsiones': ['superior_gf', 'superior_ga', 'inferior_gf', 'inferior_ga'],
    'ausencias_disciplina': ['ausencia', 'roja_anterior'],
    'cohesion': ['cohesion'],
}
LADOS = ('local', 'visitante')
VARIABLES = {k: [f'{v}_{lado}' for lado in LADOS for v in valores] for k, valores in BLOQUES.items()}


@dataclass
class Equipo:
    n: int = 0
    gf: int = 0
    ga: int = 0
    ultimo: int | None = None
    forma: list = field(default_factory=lambda: [(0., 0.) for _ in TAUS])
    rivales: list = field(default_factory=lambda: [[0, 0.], [0, 0.]])
    tecnico: int | None = None
    tecnico_antiguedad: int = 0
    tecnico_cambios: int = 0
    horas: deque = field(default_factory=lambda: deque(maxlen=5))
    oportunidades: list = field(default_factory=lambda: [0, 0])
    reaccion: list = field(default_factory=lambda: [0, 0])
    inferioridad: np.ndarray = field(default_factory=lambda: np.zeros((2, 3)))
    plantillas: deque = field(default_factory=lambda: deque(maxlen=5))
    roja_anterior: float = nan


@dataclass
class Posicion:
    n: int = 0
    puntos: int = 0


def signo(gl, gv):
    return 0 if gl > gv else 1 if gl == gv else 2


def elegibles(partidos):
    p = partidos.loc[partidos.fecha.notna() & partidos.estado.eq('played')
                     & partidos.gl.notna() & partidos.gv.notna()
                     & partidos.gl.ge(0) & partidos.gv.ge(0) & partidos.local.ne(partidos.visitante)].copy()
    clave = ['grupo', 'jornada', 'local', 'visitante']
    # Retener un solo resultado cuando las copias coinciden. Si difieren en fecha o marcador, excluir el cruce.
    repetidos = p.duplicated(clave, keep=False)
    if repetidos.any():
        ambiguos = p.loc[repetidos].groupby(clave)[['fecha', 'gl', 'gv']].transform('nunique').gt(1).any(axis=1)
        p = p.drop(index=ambiguos[ambiguos].index).drop_duplicates(clave)
    p['dia'] = pd.to_datetime(p.fecha).map(pd.Timestamp.toordinal)
    return p.sort_values(['dia', 'partido']).reset_index(drop=True)


def actas(muestra):
    """Organiza sólo identificadores y hechos útiles. Sin nombres de personas ni binarios."""
    eventos = muestra['eventos']
    por_acta = {int(k): list(filas) for k, filas in groupby(eventos.itertuples(index=False, name=None),
                                                         key=lambda fila: fila[0])}
    # Las extracciones por lotes no garantizan orden global, pero cada acta vive en un solo lote.
    plantillas = {(r.partido, r.equipo): (set(r.convocados), set(r.titulares or []))
                  for r in muestra['plantillas'].itertuples(index=False)}
    tecnicos = {(r.partido, r.equipo): r.tecnico for r in muestra['tecnicos'].itertuples(index=False)}
    return por_acta, plantillas, tecnicos


def goles_y_disciplina(r, eventos, convocados, duracion):
    goles = [(minuto, añadido, beneficiado) for _, tipo, _, minuto, añadido, _, beneficiado, _, _ in eventos
             if tipo == 'gol']
    completo = (Counter(beneficiado for _, _, beneficiado in goles)
                == Counter({k: n for k, n in zip(LADOS, (r.gl, r.gv)) if n})
                and all(pd.notna(m) for m, _, _ in goles))
    remontadas = [None, None]
    if completo and goles:
        dif = 0
        ventaja, desventaja = [False, False], [False, False]
        # Empates en minuto se procesan juntos. El acta puede ordenar por equipo.
        for _, tanda in groupby(goles, key=lambda g: (g[0], 0 if pd.isna(g[1]) else g[1])):
            dif += sum(1 if g[2] == 'local' else -1 for g in tanda)
            ventaja[0] |= dif > 0
            ventaja[1] |= dif < 0
            desventaja[0] |= dif < 0
            desventaja[1] |= dif > 0
        for i, (gf, ga) in enumerate(((r.gl, r.gv), (r.gv, r.gl))):
            remontadas[i] = ((desventaja[i], gf >= ga), (ventaja[i], gf <= ga))

    rojas = [(minuto, lado, persona) for _, tipo, _, minuto, _, lado, _, persona, sujeto in eventos
             if tipo == 'tarjeta_roja' and sujeto == 'jugador' and lado in LADOS]
    tarjetas = [{p for _, lado, p in rojas if lado == k and pd.notna(p)} for k in LADOS]
    # La tarjeta sólo prueba superioridad si el acta acredita que el expulsado estaba dentro.
    # Validar el estado de cada expulsado con sus transiciones, descartando actas ambiguas.
    expulsiones = []
    seguras = (completo and r.calidad == 'correct' and len({p for _, _, p in rojas}) == len(rojas)
               and any(tipo in ('entra', 'sale') for _, tipo, *_ in eventos))
    cambios = defaultdict(list)
    for _, tipo, _, minuto, _, _, _, persona, _ in eventos:
        if tipo in ('entra', 'sale') and pd.notna(persona):
            cambios[persona].append((minuto, tipo))
    for minuto, lado, persona in rojas:
        lista = convocados[LADOS.index(lado)]
        if pd.isna(minuto) or pd.isna(persona) or lista is None or persona not in lista[0]:
            seguras = False
            break
        dentro = persona in lista[1]
        for m, tipo in cambios.get(persona, []):
            if pd.isna(m) or m == minuto:
                seguras = False
                break
            if m < minuto:
                dentro = tipo == 'entra'
        if dentro:
            expulsiones.append((int(minuto), LADOS.index(lado)))
    tramos = None
    if seguras and expulsiones and pd.notna(duracion) and r.tipo == 'liga':
        duracion = int(duracion)
        penalizados = [0, 0]
        tramos = np.zeros((2, 2, 3))
        expulsiones = [(m, i) for m, i in sorted(expulsiones) if m < duracion]
        for j, (minuto, lado) in enumerate(expulsiones):
            penalizados[lado] += 1
            hasta = expulsiones[j + 1][0] if j + 1 < len(expulsiones) else duracion
            if hasta == minuto or penalizados[0] == penalizados[1]:
                continue
            for i, nombre in enumerate(LADOS):
                tramo = int(penalizados[i] > penalizados[1 - i])
                a_favor = sum(minuto < m < hasta and k == nombre for m, _, k in goles)
                en_contra = sum(minuto < m < hasta and k == LADOS[1 - i] for m, _, k in goles)
                tramos[i, tramo] += [hasta - minuto, a_favor, en_contra]
    return remontadas, tarjetas, tramos


def lambdas(goles, estados):
    """Medias previas de la categoría y fuerza del equipo con contracción de ocho partidos."""
    n, gl, gv = goles
    if not n:
        return nan, nan
    ml, mv = max(gl / n, .05), max(gv / n, .05)
    media = (ml + mv) / 2
    a, d = [], []
    for e in estados:
        a.append((e.gf / media + 8) / (e.n + 8))
        d.append((e.ga / media + 8) / (e.n + 8))
    return min(15., max(.05, ml * a[0] * d[1])), min(15., max(.05, mv * a[1] * d[0]))


def tercio(tabla, rival):
    if len(tabla) < 6 or rival not in tabla or tabla[rival].n < 3:
        return None
    ppg = tabla[rival].puntos / tabla[rival].n
    conocidos = [e.puntos / e.n for e in tabla.values() if e.n >= 3]
    if len(conocidos) < 6:
        return None
    if sum(v >= ppg for v in conocidos) <= len(conocidos) / 3:
        return 0
    if sum(v <= ppg for v in conocidos) <= len(conocidos) / 3:
        return 1
    return None


def pares(titulares):
    return combinations(sorted(titulares), 2)


def variables_equipo(e, dia, anio, juntos):
    descanso = dia - e.ultimo if e.ultimo is not None else nan
    forma = []
    for tau, (n, valor) in zip(TAUS, e.forma):
        peso = exp(-descanso / tau) if e.ultimo is not None else 0
        forma.append(valor / n if n * peso >= 1.5 else nan)
    contra = [valor / (n + 4) if n >= 3 else nan for n, valor in e.rivales]
    horario = [sum(e.horas) / len(e.horas), len(e.horas)] if e.horas else [nan, nan]
    reaccion = [real / (n + 5) if n else nan for real, n in zip(e.reaccion, e.oportunidades)]
    expulsiones = [g * 90 / (minutos + 90) if minutos else nan
                   for minutos, gf, ga in e.inferioridad for g in (gf, ga)]
    cohesion, ausencias = nan, nan
    if e.plantillas:
        ultimos = e.plantillas[-1][1]
        anteriores = (1 << (anio - 2017)) - 1
        combinaciones = list(pares(ultimos))
        if combinaciones and juntos.get(None, 0) & anteriores:
            cohesion = sum((juntos.get(par, 0) & anteriores).bit_count() for par in combinaciones) / len(combinaciones)
        if len(e.plantillas) >= 5:
            plantilla = Counter(p for _, titulares in list(e.plantillas)[:-2] for p in titulares)
            disponibles = e.plantillas[-1][0] | e.plantillas[-2][0]
            if plantilla:
                ausencias = sum(n / 3 for p, n in plantilla.items() if n >= 2 and p not in disponibles)
    return [*forma, *contra, min(descanso, 45), *horario, e.tecnico_antiguedad if e.tecnico else nan,
            e.tecnico_cambios if e.tecnico else nan, *reaccion, *expulsiones, ausencias, e.roja_anterior, cohesion]


def actualiza_equipo(e, dia, gf, ga, residual, rival, hora, tecnico, reaccion, lista, rojas, tramos):
    delta = dia - e.ultimo if e.ultimo is not None else 0
    e.forma = [(1 + n * exp(-delta / tau), residual + valor * exp(-delta / tau))
               for tau, (n, valor) in zip(TAUS, e.forma)]
    e.ultimo = dia
    e.n += 1
    e.gf += gf
    e.ga += ga
    if rival is not None:
        e.rivales[rival][0] += 1
        e.rivales[rival][1] += residual
    if pd.notna(hora):
        e.horas.append(hora)
    if tecnico is not None:
        if e.tecnico is not None and tecnico != e.tecnico:
            e.tecnico_cambios += 1
        e.tecnico_antiguedad = e.tecnico_antiguedad + 1 if tecnico == e.tecnico else 1
        e.tecnico = tecnico
    if reaccion is not None:
        for i, (oportunidad, exito) in enumerate(reaccion):
            e.oportunidades[i] += int(oportunidad)
            e.reaccion[i] += int(oportunidad and exito)
    if lista is None or not lista[1]:
        e.plantillas.clear()
    else:
        e.plantillas.append(lista)
    e.roja_anterior = float(len(rojas & lista[0])) if lista and lista[1] else nan
    if tramos is not None:
        e.inferioridad += tramos


def construye(muestra, futuros=None, corte=None):
    p = elegibles(muestra['partidos'])
    if corte is not None:
        p = p.loc[p.dia.lt(corte.toordinal())].reset_index(drop=True)
    eventos, plantillas, tecnicos = actas(muestra)
    duraciones = muestra['duraciones'].set_index('grupo').duracion.to_dict()
    elo = defaultdict(lambda: 1500.)
    equipos = defaultdict(Equipo)
    tablas = defaultdict(dict)
    goles = defaultdict(lambda: [0, 0, 0])
    ultimos_anios = defaultdict(dict)
    codigos = {k: {v: i for i, v in enumerate(sorted(p[k].unique()))} for k in ('categoria', 'modalidad', 'genero')}
    columnas = BASE + [f'{v}_{lado}' for lado in LADOS for valores in BLOQUES.values() for v in valores]
    datos = np.full((len(p), len(columnas)), np.nan, dtype=np.float32)

    def lee(r, dia):
        contexto = r.categoria, r.modalidad, r.genero
        identidades = [(club, nombre, contexto) for club, nombre in
                       ((r.club_local, r.nombre_local), (r.club_visitante, r.nombre_visitante))]
        estados = [equipos[r.equipo_local], equipos[r.equipo_visitante]]
        eh, ev = [elo[k] for k in identidades]
        lh, lv = lambdas(goles[contexto], estados)
        nivel = r.nivel if pd.notna(r.nivel) else nan
        fila = [eh, ev, eh - ev, lh, lv, r.jornada, nivel,
                *[codigos[k].get(v, nan) for k, v in zip(codigos, contexto)]]
        for e, ident in zip(estados, identidades):
            fila.extend(variables_equipo(e, dia, r.anio, ultimos_anios[ident]))
        return fila, contexto, identidades, estados

    i = 0
    for dia, lote in groupby(p.itertuples(index=False), key=lambda r: r.dia):
        cambios = []
        for r in lote:
            fila, contexto, identidades, estados = lee(r, dia)
            liga = tablas[r.grupo]
            eh, ev = fila[:2]
            datos[i] = fila
            i += 1
            esperado = 1 / (1 + 10 ** (-(eh + 60 - ev) / 400))
            real = (1., .5, 0.)[signo(r.gl, r.gv)]
            diferencia = real - esperado
            rivales = (tercio(liga, r.visitante), tercio(liga, r.local))
            cambios.append((r, contexto, identidades, estados, diferencia, rivales))
        for r, contexto, identidades, estados, diferencia, rivales in cambios:
            margen = 1 + min(4, max(0, abs(r.gl - r.gv) - 1)) / 4
            elo[identidades[0]] += 20 * margen * diferencia
            elo[identidades[1]] -= 20 * margen * diferencia
            suma = goles[contexto]
            suma[0] += 1
            suma[1] += r.gl
            suma[2] += r.gv
            inscripciones = (r.local, r.visitante)
            listas = [plantillas.get((r.partido, eq)) if r.calidad == 'correct' else None for eq in inscripciones]
            reaccion, rojas, minutos = goles_y_disciplina(r, eventos.get(r.partido, ()), listas, duraciones.get(r.grupo))
            for j, eq in enumerate(inscripciones):
                e = estados[j]
                gf, ga = (r.gl, r.gv) if j == 0 else (r.gv, r.gl)
                actualiza_equipo(e, dia, gf, ga, diferencia if j == 0 else -diferencia, rivales[j], r.hora,
                                 tecnicos.get((r.partido, eq)), reaccion[j], listas[j], rojas[j],
                                 minutos[j] if minutos is not None else None)
                # La tabla del grupo nunca mezcla liga y copa aunque compartan equipo-temporada.
                tabla = tablas[r.grupo].setdefault(eq, Posicion())
                tabla.n += 1
                tabla.puntos += 3 if gf > ga else 1 if gf == ga else 0
                if listas[j]:
                    juntos = ultimos_anios[identidades[j]]
                    juntos[None] = juntos.get(None, 0) | (1 << (r.anio - 2017))
                    for par in pares(listas[j][1]):
                        juntos[par] = juntos.get(par, 0) | (1 << (r.anio - 2017))
    historicas = pd.DataFrame(datos, columns=columnas)
    if futuros is None:
        return p, historicas
    previstas = [lee(r, corte.toordinal())[0] for r in futuros.itertuples(index=False)]
    return p, historicas, pd.DataFrame(previstas, columns=columnas, dtype=np.float32)
