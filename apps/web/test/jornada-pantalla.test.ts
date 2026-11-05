import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FilaPortadaGrupo } from '../src/consultas/competiciones';
import type { FilaPartidoCanonico } from '../src/consultas/partidos';
import { CabeceraJornada } from '../src/componentes/competicion/CabeceraJornada';
import { ListadoJornadas } from '../src/componentes/competicion/ListadoJornadas';
import { MigaCompeticion } from '../src/componentes/competicion/MigaCompeticion';
import { PartidosDeJornada } from '../src/componentes/competicion/PartidosDeJornada';
import {
  agrupaJornadas, agrupaJornadasConPartidos, detalleDeJornada, estadoDeJornada, fechaDePartido,
  fechaUltimaJugadaDePartidos, fechaUltimaJugadaDePortada, numeroDeJornada, rangoDeFechas,
  rutaDeJornada, rutaDeJornadas, tituloDeJornada, tituloDeJornadas,
  type PartidoDeJornada,
} from '../src/lib/jornadas';
import { nombreCorto, nombreCortoDe } from '../src/lib/nombres-equipo';

/**
 * Contrato de la pantalla de jornadas (pestaña «Jornadas» del prototipo de competición).
 *
 * La referencia real es el grupo 3769 del canónico: «Liga Nacional Juvenil» 2026-27, 16 equipos, 30
 * jornadas previstas y 4 publicadas con sus 8 partidos cada una. Aquí se prueban las piezas con datos
 * de fixture: la lista, el detalle y las reglas puras que deciden qué se enseña.
 *
 * Lo que se defiende:
 *  · un partido sin marcador se pinta «—», nunca 0-0, y sin hora no se inventa una;
 *  · una jornada sin partidos no se inventa por numeración;
 *  · las flechas anterior/siguiente no llevan a páginas que no existen;
 *  · la interfaz no explica cómo está hecha (§8 de la doctrina) ni enseña datos técnicos;
 *  · no hay enlace a un acta que todavía no tiene pantalla.
 */

/* ── Datos de fixture, con la forma real de `grupo-por-id` y `partidos-de-grupo` ─────────────────── */

const GRUPO: FilaPortadaGrupo = {
  grupo_id: 3769,
  federacion: 'castilla-leon',
  federacion_nombre: 'Federación de Castilla y León',
  federacion_corta: 'Castilla y León',
  temporada: '2026-27',
  edicion: 'Liga Nacional Juvenil',
  edicion_id: 30,
  grupo: 'Primera - III',
  grupo_codigo: '24218935',
  categoria: 'juvenil',
  division: 'liga-nacional',
  modalidad: 'futbol11',
  genero: 'masculina',
  ambito: 'nacional',
  jornadas_previstas: 30,
  equipos: 16,
  partidos_conocidos: 32,
  partidos_con_resultado: 32,
  complete_through_matchday: 4,
  visibility_state: 'parcial_privada',
  jornada_actual: 4,
  origen_clasificacion: 'oficial',
  calculado_en: '2026-11-01T10:00:00Z',
  fecha_inicio: '2026-09-12',
  fecha_fin: '2027-05-23',
};

function partido(extra: Partial<FilaPartidoCanonico> & {
  match_id: number;
  jornada: number;
  local_nombre_corto?: string | null;
  visitante_nombre_corto?: string | null;
}): PartidoDeJornada {
  return {
    orden: extra.match_id, fecha: null, hora: null, local_id: 17607, visitante_id: 17608,
    local: 'Burgos C.F. S.A.D.', visitante: 'C.D. Parquesol',
    goles_local: null, goles_visitante: null, campo: null, arbitro: null, calidad_acta: null,
    estado: null, ...extra,
  };
}

/** Jornada 1 jugada, jornada 2 programada (sin marcador) y jornada 4 jugada: la 3 no está publicada. */
const PARTIDOS: PartidoDeJornada[] = [
  partido({
    match_id: 1, jornada: 1, orden: 1, fecha: '2026-09-12', hora: '16:00', local: 'Burgos C.F. S.A.D.',
    visitante: 'C.D. Parquesol', goles_local: 2, goles_visitante: 1, campo: 'Campo Municipal de Burgos',
    calidad_acta: 'completa', arbitro: 'MARTÍN EZQUERRA, PABLO',
    local_club_id: 77, local_tiene_escudo: true, visitante_club_id: 78, visitante_tiene_escudo: false,
    local_nombre_corto: 'Burgos', visitante_nombre_corto: 'Parquesol',
  }),
  partido({
    match_id: 2, jornada: 1, orden: 2, fecha: '2026-09-13', hora: null, local_id: 17609, visitante_id: 17610,
    local: 'C.D. Numancia', visitante: 'Real Valladolid', goles_local: 0, goles_visitante: 0,
  }),
  partido({
    match_id: 3, jornada: 2, orden: 1, fecha: '2026-09-19', hora: '18:30', campo: 'Anexo de Puentes',
    local: 'C.D. Parquesol', visitante: 'C.D. Numancia',
  }),
  // Programado del todo: sin fecha, sin hora, sin campo y sin marcador. No se rellena nada.
  partido({ match_id: 4, jornada: 2, orden: 2, local_id: 17611, visitante_id: 17612, local: 'C.F. Palencia', visitante: 'S.D. Ponferradina' }),
  partido({
    match_id: 5, jornada: 4, orden: 1, fecha: '2026-10-03', hora: '12:00', local: 'Burgos C.F. S.A.D.',
    visitante: 'C.F. Palencia', goles_local: 1, goles_visitante: 1, campo: 'Campo Municipal de Burgos',
  }),
];

/** Lo que la interfaz no puede decir: cómo está hecha o de dónde sale el cálculo (§8 de la doctrina). */
const TEXTO_PROHIBIDO: readonly RegExp[] = [
  /según el canónico/i,
  /según la base/i,
  /según el prototipo/i,
  /canónico/i,
  /prototipo/i,
  /reconstruid/i,
  /se calcula/i,
  /calculad[oa]/i,
  /cálculo/i,
  /SQL/i,
  /backend/i,
  /endpoint/i,
  /consulta (de la base|sql)/i,
  /<code/i,
];

function sinTextoProhibido(html: string) {
  for (const prohibido of TEXTO_PROHIBIDO) {
    expect(html, `la interfaz no debe contener «${prohibido}»`).not.toMatch(prohibido);
  }
}

/* ── Reglas puras ────────────────────────────────────────────────────────────────────────────────── */

describe('jornadas: agrupación y fechas', () => {
  it('agrupa por jornada, de la primera a la última, sin inventar las que no tienen partidos', () => {
    const jornadas = agrupaJornadas(PARTIDOS);
    expect(jornadas.map((j) => j.numero)).toEqual([1, 2, 4]);
    expect(jornadas[0]).toMatchObject({ partidos: 2, jugados: 2, desde: '2026-09-12', hasta: '2026-09-13' });
    expect(jornadas[1]).toMatchObject({ partidos: 2, jugados: 0, desde: '2026-09-19', hasta: '2026-09-19' });
    expect(jornadas[2]).toMatchObject({ partidos: 1, jugados: 1, desde: '2026-10-03', hasta: '2026-10-03' });
  });

  it('un partido sin marcador no cuenta como jugado', () => {
    const [j1, j2] = agrupaJornadas(PARTIDOS);
    expect(j1!.jugados).toBe(2);
    expect(j2!.jugados).toBe(0);
  });

  it('la fecha de un partido prefiere la jugada y cae a la prevista publicada', () => {
    expect(fechaDePartido(partido({ match_id: 9, jornada: 1, fecha: '2026-09-12' }))).toBe('2026-09-12');
    expect(fechaDePartido({ ...partido({ match_id: 9, jornada: 1 }), fecha_prevista: '2026-09-20' })).toBe('2026-09-20');
    expect(fechaDePartido(partido({ match_id: 9, jornada: 1 }))).toBeNull();
  });

  it('el rango se escribe en castellano y sólo con las fechas que hay', () => {
    expect(rangoDeFechas('2026-09-12', '2026-09-13')).toBe('12–13 sept');
    expect(rangoDeFechas('2026-10-03', '2026-10-03')).toBe('3 oct');
    expect(rangoDeFechas('2026-09-27', '2026-10-04')).toBe('27 sept – 4 oct');
    expect(rangoDeFechas('2026-09-27', null)).toBe('27 sept');
    expect(rangoDeFechas(null, '2026-10-04')).toBe('4 oct');
    expect(rangoDeFechas(null, null)).toBeNull();
  });

  it('las vecinas son jornadas que existen en el grupo, no «número ± 1»', () => {
    const detalle = detalleDeJornada(PARTIDOS, 4);
    expect(detalle?.anterior).toBe(2);
    expect(detalle?.siguiente).toBeNull();
    const segunda = detalleDeJornada(PARTIDOS, 2);
    expect(segunda?.anterior).toBe(1);
    expect(segunda?.siguiente).toBe(4);
    // La jornada 3 no tiene partidos publicados: no hay página que enseñar.
    expect(detalleDeJornada(PARTIDOS, 3)).toBeNull();
  });

  it('un número de jornada de la URL sólo vale si es un entero positivo', () => {
    expect(numeroDeJornada('4')).toBe(4);
    expect(numeroDeJornada('04')).toBe(4);
    for (const crudo of ['0', '-1', '4.5', 'abc', '', undefined]) {
      expect(numeroDeJornada(crudo), `«${String(crudo)}» no es una jornada`).toBeNull();
    }
  });

  it('las rutas de la pantalla son las que la cabecera de competición va a enlazar', () => {
    expect(rutaDeJornadas(3769)).toBe('/explorar/competicion/3769/jornadas');
    expect(rutaDeJornada(3769, 4)).toBe('/explorar/competicion/3769/jornada/4');
  });

  it('la pestaña del navegador dice la competición y, en el detalle, la jornada', () => {
    expect(tituloDeJornadas({ edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III' }))
      .toBe('Jornadas · Liga Nacional Juvenil · Primera - III — Balompié');
    expect(tituloDeJornada({ numero: 4, edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III' }))
      .toBe('Jornada 4 · Liga Nacional Juvenil · Primera - III — Balompié');
  });
});

describe('jornadas: tablas, estado y fecha de la última jugada', () => {
  it('cada jornada lleva sus partidos en orden y no inventa las que no existen', () => {
    const jornadas = agrupaJornadasConPartidos(PARTIDOS);
    expect(jornadas.map((j) => j.numero)).toEqual([1, 2, 4]);
    expect(jornadas[0]!.lista.map((p) => p.match_id)).toEqual([1, 2]);
    expect(jornadas[1]!.lista.map((p) => p.match_id)).toEqual([3, 4]);
    expect(jornadas.every((j) => j.lista.length === j.partidos)).toBe(true);
  });

  it('el estado distingue jugada, parcial, programada y sin fecha', () => {
    expect(estadoDeJornada({ numero: 1, partidos: 2, jugados: 2, desde: '2026-09-12', hasta: '2026-09-13' }))
      .toEqual({ clave: 'jugada', etiqueta: 'Jugada' });
    expect(estadoDeJornada({ numero: 2, partidos: 2, jugados: 1, desde: '2026-09-12', hasta: '2026-09-13' }))
      .toEqual({ clave: 'parcial', etiqueta: 'Parcial' });
    expect(estadoDeJornada({ numero: 3, partidos: 2, jugados: 0, desde: '2026-09-19', hasta: null }))
      .toEqual({ clave: 'programada', etiqueta: 'Programada' });
    expect(estadoDeJornada({ numero: 4, partidos: 1, jugados: 0, desde: null, hasta: null }))
      .toEqual({ clave: 'sin-fecha', etiqueta: 'Sin fecha' });
  });

  it('la última jornada jugada es la última con resultado, no la última programada', () => {
    expect(fechaUltimaJugadaDePartidos(PARTIDOS)).toBe('2026-10-03');
    // Añadir un partido programado más tarde no mueve la fecha.
    const programado = partido({
      match_id: 6, jornada: 5, fecha: null, fecha_prevista: '2027-05-23', goles_local: null, goles_visitante: null,
    });
    expect(fechaUltimaJugadaDePartidos([...PARTIDOS, programado])).toBe('2026-10-03');
    // Sin ningún resultado no hay fecha de jornada jugada.
    expect(fechaUltimaJugadaDePartidos([programado])).toBeNull();
  });

  it('la fecha de la portada manda cuando GRUPO_POR_ID la trae', () => {
    expect(fechaUltimaJugadaDePortada({ ...GRUPO, fecha_ultima_jugada: '2026-10-03' })).toBe('2026-10-03');
    expect(fechaUltimaJugadaDePortada(GRUPO)).toBeNull();
  });

  it('los nombres de la tabla son cortos, con el completo disponible', () => {
    expect(nombreCorto('Burgos C.F. S.A.D.')).toBe('Burgos');
    expect(nombreCortoDe('Parquesol', 'C.D. Parquesol')).toBe('Parquesol');
    expect(nombreCortoDe(null, 'S.D. Ponferradina S.A.D.')).toBe('Ponferradina');
  });
});

/* ── Tablas de jornadas (feedback de capturas) ─────────────────────────────────────────────────── */

describe('las tablas de jornadas', () => {
  const render = (
    jornadas = agrupaJornadasConPartidos(PARTIDOS),
    hrefActa?: (p: PartidoDeJornada) => string | null,
  ) => renderToStaticMarkup(createElement(ListadoJornadas, {
    jornadas,
    hrefJornada: (numero: number) => rutaDeJornada(3769, numero),
    hrefActa,
  }));

  it('una tabla por jornada, con cabecera, fechas y estado; cuatro por fila en pantallas anchas', () => {
    const html = render();
    expect((html.match(/<table/g) ?? []).length).toBe(3);
    expect(html).toContain('Jornada 1');
    expect(html).toContain('Jornada 2');
    expect(html).toContain('Jornada 4');
    expect(html).toContain('12–13 sept');
    expect(html).toContain('19 sept');
    expect(html).toContain('3 oct');
    expect(html).toMatch(/>Jugada</);
    expect(html).toMatch(/>Programada</);
    // La rejilla: 1 columna en móvil, 2 en tablet y 4 en escritorio.
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('xl:grid-cols-4');
    expect((html.match(/data-jornada=/g) ?? []).length).toBe(3);
    expect(html).toContain('Resultados de la jornada 1');
    expect(html).toContain('href="/explorar/competicion/3769/jornada/4"');
    // La jornada 3 no existe: no se pinta una tabla vacía.
    expect(html).not.toContain('Jornada 3');
    sinTextoProhibido(html);
  });

  it('las filas enlazan a los equipos y llevan escudo y nombre corto, con el completo en el title', () => {
    const html = render();
    expect(html).toContain('href="/explorar/equipo/17607"');
    expect(html).toContain('href="/explorar/equipo/17608"');
    expect(html).toContain('data-escudo="real"');
    expect(html).toContain('/api/escudo/club/77');
    expect(html).toContain('data-escudo="determinista"');
    expect(html).toContain('title="Burgos C.F. S.A.D."');
    expect(html).toContain('title="C.D. Parquesol"');
    expect(html).toMatch(/>Burgos</);
    expect(html).toMatch(/>Parquesol</);
  });

  it('el árbitro se ve cuando está publicado y no deja hueco cuando no', () => {
    const html = render();
    expect(html).toContain('MARTÍN EZQUERRA, PABLO');
    // Un único partido tiene árbitro: no se repite el label ni se pinta una línea vacía en el resto.
    expect((html.match(/title="Árbitro: /g) ?? []).length).toBe(1);
    expect((html.match(/sr-only">Árbitro: /g) ?? []).length).toBe(1);
  });

  it('el acta sólo enlaza los partidos con acta publicada', () => {
    const html = render(undefined, (p) => (p.calidad_acta !== null ? `/acta/${p.match_id}` : null));
    expect(html).toContain('href="/acta/1"');
    expect(html).not.toContain('href="/acta/3"');
    const sinActa = render();
    expect(sinActa).not.toMatch(/href="[^"]*acta/i);
  });

  it('sin marcador se pinta «—», nunca 0-0, y la programada conserva su fecha', () => {
    const html = render();
    expect(html).toContain('Sin resultado publicado');
    expect(html).toMatch(/>Programada</);
    // Un partido sin resultado no se convierte en un 0-0.
    const soloSinResultado = render(agrupaJornadasConPartidos([
      partido({ match_id: 9, jornada: 3, fecha_prevista: '2026-10-11' }),
    ]));
    expect(soloSinResultado).toContain('—');
    expect(soloSinResultado).not.toContain('0 - 0');
    // La maqueta móvil apila los equipos y deja el marcador a la derecha.
    expect(html).toContain('max-sm:absolute');
    expect(html).toContain('max-sm:pr-14');
    expect(html).toContain('max-sm:block');
  });

  it('sin jornadas lo dice en una línea y no pinta tablas vacías', () => {
    const html = render([]);
    expect(html).toContain('Sin jornadas publicadas.');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<a');
    sinTextoProhibido(html);
  });
});

/* ── Cabecera del detalle ──────────────────────────────────────────────────────────────────────── */

describe('la cabecera del detalle de jornada', () => {
  const render = (extra: { anterior?: number | null; siguiente?: number | null } = {}) => {
    const anterior = extra.anterior ?? null;
    const siguiente = extra.siguiente ?? null;
    const jornada = detalleDeJornada(PARTIDOS, 4)!;
    return renderToStaticMarkup(createElement(CabeceraJornada, {
      grupo: GRUPO,
      numero: 4,
      rango: rangoDeFechas(jornada.jornada.desde, jornada.jornada.hasta),
      hrefAnterior: anterior === null ? null : rutaDeJornada(3769, anterior),
      hrefSiguiente: siguiente === null ? null : rutaDeJornada(3769, siguiente),
      hrefClasificacion: '/explorar/competicion/3769',
    }));
  };

  it('da el contexto de la competición y la temporada, con la jornada como encabezado', () => {
    const html = render();
    expect(html).toContain('<h1');
    expect(html).toContain('Jornada 4');
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('Primera - III');
    expect(html).toContain('2026-27');
    expect(html).toContain('3 oct');
    sinTextoProhibido(html);
  });

  it('la flecha anterior lleva a la jornada anterior publicada y la siguiente se apaga', () => {
    const html = render({ anterior: 2, siguiente: null });
    expect(html).toContain('aria-label="Jornada anterior"');
    expect(html).toContain('href="/explorar/competicion/3769/jornada/2"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('No hay jornada siguiente');
    // Sin siguiente no hay enlace a una jornada que no existe.
    expect(html).not.toContain('href="/explorar/competicion/3769/jornada/5"');
  });

  it('deja volver a la clasificación con un enlace discreto', () => {
    const html = render();
    expect(html).toContain('Clasificación');
    expect(html).toContain('href="/explorar/competicion/3769"');
  });
});

/* ── Partidos de la jornada ───────────────────────────────────────────────────────────────────── */

describe('los partidos de una jornada', () => {
  const detalle = detalleDeJornada(PARTIDOS, 1)!;
  const render = (partidos = detalle.partidos) => renderToStaticMarkup(createElement(PartidosDeJornada, {
    jornada: detalle.jornada,
    partidos,
  }));

  it('enseña escudos, nombres cortos con el completo en el title, y marcador; lista, no tabla gigante', () => {
    const html = render();
    expect(html).toContain('data-escudo="determinista"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/>Burgos</);
    expect(html).toMatch(/>Parquesol</);
    expect(html).toContain('title="Burgos C.F. S.A.D."');
    expect(html).toContain('title="C.D. Parquesol"');
    expect(html).toContain('2 - 1');
    expect(html).toContain('tabular-nums');
    expect(html).not.toContain('<table');
    expect(html).toContain('<h2');
    sinTextoProhibido(html);
  });

  it('enseña el árbitro publicado y apila equipos con el marcador a la derecha en móvil', () => {
    const html = render();
    expect(html).toContain('Árbitro: ');
    expect(html).toContain('MARTÍN EZQUERRA, PABLO');
    expect(html).toContain('max-sm:grid-cols-[minmax(0,1fr)_auto]');
    expect(html).toContain('max-sm:row-start-2');
    expect(html).toContain('max-sm:col-start-2');
  });

  it('enseña la hora publicada y el campo cuando existen', () => {
    const html = render();
    expect(html).toContain('16:00');
    expect(html).toContain('12 sept');
    expect(html).toContain('Campo Municipal de Burgos');
  });

  it('usa el escudo real cuando la fila trae club y escudo vigente, y el marcador si no', () => {
    const conEscudo = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: detalle.jornada,
      partidos: [{
        ...PARTIDOS[0]!,
        local_club_id: 77, local_tiene_escudo: true,
        visitante_club_id: 78, visitante_tiene_escudo: false,
      }],
    }));
    expect(conEscudo).toContain('data-escudo="real"');
    expect(conEscudo).toContain('/api/escudo/club/77');
    // El club sin escudo vigente no genera una petición que ya se sabe que falla.
    expect(conEscudo).not.toContain('/api/escudo/club/78');
    expect(conEscudo).toContain('data-escudo="determinista"');
  });

  it('un partido sin marcador se pinta «—» y nunca 0-0; sin hora no se inventa una', () => {
    const jornada2 = detalleDeJornada(PARTIDOS, 2)!;
    const html = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: jornada2.jornada, partidos: jornada2.partidos,
    }));
    expect(html).toContain('—');
    expect(html).toContain('Sin resultado publicado');
    expect(html).not.toContain('0 - 0');
    expect(html).not.toContain('00:00');
    // La hora publicada de la jornada (18:30) sí se enseña; el programado del todo no enseña nada.
    expect(html).toContain('18:30');
    const soloProgramado = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: { numero: 2, partidos: 1, jugados: 0, desde: null, hasta: null },
      partidos: [PARTIDOS[3]!],
    }));
    expect(soloProgramado).toContain('—');
    expect(soloProgramado).not.toContain('18:30');
    expect(soloProgramado).not.toContain('·');
    expect(soloProgramado).not.toContain('sept');
  });

  it('sin partidos lo dice, sin tabla vacía', () => {
    const html = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: { numero: 7, partidos: 0, jugados: 0, desde: null, hasta: null }, partidos: [],
    }));
    expect(html).toContain('Sin partidos publicados.');
    expect(html).not.toContain('<li');
    sinTextoProhibido(html);
  });

  it('no hay enlace de acta mientras la pantalla de acta no exista', () => {
    const html = render();
    expect(html).not.toMatch(/href="[^"]*acta/i);
    expect(html).not.toContain('>Acta<');
  });

  it('cuando el acta tenga pantalla, el enlace sólo sale en los partidos con acta disponible', () => {
    const html = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: detalle.jornada,
      partidos: detalle.partidos,
      hrefActa: (p) => `/acta/${p.match_id}`,
    }));
    // Partido 1 tiene acta; el 2 no.
    expect(html).toContain('href="/acta/1"');
    expect(html).not.toContain('href="/acta/2"');
  });
});

/* ── Miga de pan ──────────────────────────────────────────────────────────────────────────────── */

describe('la miga de la competición', () => {
  it('enlaza federación, grupo y jornadas, y marca la jornada como página actual', () => {
    const html = renderToStaticMarkup(createElement(MigaCompeticion, {
      grupo: GRUPO,
      tramos: [
        { texto: 'Jornadas', href: rutaDeJornadas(3769) },
        { texto: 'Jornada 4' },
      ],
    }));
    expect(html).toContain('href="/federaciones?federacion=castilla-leon"');
    expect(html).toContain('href="/explorar/competicion/3769"');
    expect(html).toContain('href="/explorar/competicion/3769/jornadas"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Jornada 4');
    sinTextoProhibido(html);
  });
});
