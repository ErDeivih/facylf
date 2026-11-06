import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico, consulta } from '../src/consultas/adaptadores/postgres/conexion';
import type {
  EventoDeActa, FilaActaCanonica, JugadorDeActa, TecnicoDeActa,
} from '../src/consultas/partidos';
import { ACTA_DEL_PARTIDO } from '../src/consultas/partidos';
import { AlineacionesActa } from '../src/componentes/acta/AlineacionesActa';
import { CabeceraActa } from '../src/componentes/acta/CabeceraActa';
import { ContextoActa } from '../src/componentes/acta/ContextoActa';
import { CronologiaActa } from '../src/componentes/acta/CronologiaActa';
import { MigaActa } from '../src/componentes/acta/MigaActa';
import {
  alineacionesPorLado, construyeCronologia, etiquetaCalidad, etiquetaEstado, etiquetaOficial,
  fechaDeActa, marcasDeJugador, minutoTexto, notaCalidad, rutaDeActa, tieneActa, tituloDeActa,
  type LineaCronologia,
} from '../src/lib/acta';

/**
 * Contrato de la pantalla del acta (WALL objetivo 1).
 *
 * La referencia real es el partido 94040 del canónico: C.D. Internacional Vista Alegre 1-5 U.D. Sur,
 * jornada 1 del grupo 3769 (Liga Nacional Juvenil 2026-27), con acta completa. Las piezas se prueban
 * con datos de fixture y, si el canónico responde, contra ese partido de verdad.
 *
 * Lo que se defiende:
 *  · un acta sin desarrollo (``unavailable``) no se pinta: es un 404, no una página vacía;
 *  · los goles en propia puerta se colocan del lado que suma el gol, y los cambios se leen como
 *    «entra/sale», no como dos líneas sueltas;
 *  · los nombres de menores se publican; las fotos no (aquí no hay ninguna);
 *  · la calidad del acta se dice en palabras del glosario, sin textos internos.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** El partido de referencia. */
const MATCH_ID = 94040;

afterAll(async () => {
  await cierraCanonico();
});

/* ── Datos de fixture ─────────────────────────────────────────────────────────────────────────────── */

function evento(extra: Partial<EventoDeActa> & { evento_id: number; tipo: string }): EventoDeActa {
  return {
    subtipo: null, minuto: null, minuto_extra: null, lado: null, lado_beneficiado: null,
    sujeto_tipo: 'jugador', persona_id: null, persona: null, equipo_id: null, ...extra,
  };
}

function jugador(extra: Partial<JugadorDeActa> & { persona_id: number; persona: string }): JugadorDeActa {
  return {
    lado: 'local', condicion: 'starter', dorsal: null, portero: false, orden: 0,
    posicion: null, capitan: null, ...extra,
  };
}

const EVENTOS: EventoDeActa[] = [
  evento({ evento_id: 1, tipo: 'gol', subtipo: 'normal', minuto: 12, lado: 'visitante', lado_beneficiado: 'visitante', persona_id: 900, persona: 'PELÁEZ MELGAR, JORGE', equipo_id: 17610 }),
  evento({ evento_id: 2, tipo: 'tarjeta_amarilla', minuto: 27, lado: 'local', persona_id: 901, persona: 'ANTOLIN GOMEZ, MIGUEL', equipo_id: 17609 }),
  evento({ evento_id: 3, tipo: 'sale', minuto: 55, lado: 'local', persona_id: 902, persona: 'PEREZ ALEGRE, ALEJANDRO', equipo_id: 17609 }),
  evento({ evento_id: 4, tipo: 'entra', minuto: 55, lado: 'local', persona_id: 903, persona: 'ESPINOSA ARRIBAS, MARIO', equipo_id: 17609 }),
  evento({ evento_id: 5, tipo: 'gol', subtipo: 'propia_puerta', minuto: 63, lado: 'visitante', lado_beneficiado: 'local', persona_id: 904, persona: 'DEFENSA, PROPIA', equipo_id: 17610 }),
  evento({ evento_id: 6, tipo: 'gol', subtipo: 'penalti', minuto: 75, lado: 'local', lado_beneficiado: 'local', persona_id: 905, persona: 'LORENZO CANTERO, IKER', equipo_id: 17609 }),
  evento({ evento_id: 7, tipo: 'tarjeta_roja', subtipo: 'doble_amarilla', minuto: 80, lado: 'local', sujeto_tipo: 'tecnico', persona_id: 906, persona: 'ENTRENADOR, LOCAL', equipo_id: 17609 }),
  evento({ evento_id: 8, tipo: 'gol', subtipo: 'normal', minuto: 90, minuto_extra: 3, lado: 'visitante', lado_beneficiado: 'visitante', persona_id: 907, persona: 'PASCUAL ESPINILLA, EROS', equipo_id: 17610 }),
];

const ALINEACIONES: JugadorDeActa[] = [
  jugador({ persona_id: 901, persona: 'ANTOLIN GOMEZ, MIGUEL', dorsal: 6, orden: 0 }),
  jugador({ persona_id: 905, persona: 'LORENZO CANTERO, IKER', dorsal: 10, orden: 1 }),
  jugador({ persona_id: 902, persona: 'PEREZ ALEGRE, ALEJANDRO', dorsal: 4, orden: 0, condicion: 'substitute' }),
  jugador({ persona_id: 903, persona: 'ESPINOSA ARRIBAS, MARIO', dorsal: 16, orden: 1, condicion: 'substitute' }),
  // Convocado sin condición publicada: no se puede llamar titular ni suplente.
  jugador({ persona_id: 908, persona: 'SIN CONDICION, JUGADOR', dorsal: 30, condicion: 'called_up_unknown' }),
  jugador({ lado: 'visitante', persona_id: 900, persona: 'PELÁEZ MELGAR, JORGE', dorsal: 7, orden: 0 }),
  jugador({ lado: 'visitante', persona_id: 907, persona: 'PASCUAL ESPINILLA, EROS', dorsal: 14, orden: 0, condicion: 'substitute' }),
];

const CUERPO_TECNICO: TecnicoDeActa[] = [
  { lado: 'local', rol: 'Entrenador', persona: 'SANTAMARIA ECHAVE, SERGIO' },
  { lado: 'local', rol: '2ºEntrenador', persona: 'AYUDANTE, SEGUNDO' },
  { lado: 'visitante', rol: 'Entrenador', persona: 'GONZALEZ MUÑOZ, MIGUEL' },
];

const ACTA: FilaActaCanonica = {
  match_id: MATCH_ID,
  jornada: 1,
  federacion: 'castilla-leon',
  federacion_nombre: 'Castilla y León',
  temporada: '2026-27',
  edicion: 'Liga Nacional Juvenil',
  edicion_id: 30,
  categoria: 'juvenil',
  division: 'liga-nacional',
  modalidad: 'futbol11',
  ambito: 'nacional',
  grupo_id: 3769,
  grupo: 'Primera - III',
  grupo_codigo: '24218935',
  fecha: '2026-09-12',
  fecha_prevista: '2026-09-12',
  hora: '12:00',
  campo: 'C.M. José Manuel Sedano',
  municipio: 'Valladolid',
  local: 'C.D. Internacional Vista Alegre',
  visitante: 'U.D. Sur',
  local_id: 17609,
  visitante_id: 17610,
  local_club_id: 1495,
  visitante_club_id: 1523,
  local_tiene_escudo: true,
  visitante_tiene_escudo: false,
  goles_local: 1,
  goles_visitante: 5,
  penaltis_local: null,
  penaltis_visitante: null,
  estado: 'played',
  calidad_acta: 'correct',
  eventos: EVENTOS,
  alineaciones: ALINEACIONES,
  oficiales: [{ rol: 'principal', persona: 'ORTEGA PEÑA, MATEO' }],
  cuerpo_tecnico: CUERPO_TECNICO,
  enfrentamientos: [
    { match_id: 1, fecha: '2025-05-18', temporada: '2024-25', jornada: 20, local: 'U.D. Sur', visitante: 'C.D. Internacional Vista Alegre', goles_local: 1, goles_visitante: 1 },
    { match_id: 2, fecha: '2024-11-10', temporada: '2024-25', jornada: 5, local: 'C.D. Internacional Vista Alegre', visitante: 'U.D. Sur', goles_local: 2, goles_visitante: 1 },
  ],
};

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

describe('el acta: cuándo hay acta y cómo se nombra', () => {
  it('una acta no disponible no es una acta: la página no la inventa', () => {
    expect(tieneActa('correct')).toBe(true);
    expect(tieneActa('review')).toBe(true);
    expect(tieneActa('partial')).toBe(true);
    expect(tieneActa('administrative')).toBe(true);
    expect(tieneActa('unavailable')).toBe(false);
    expect(tieneActa(null)).toBe(false);
    expect(tieneActa(undefined)).toBe(false);
  });

  it('la ruta del acta es la que enlaza la jornada', () => {
    expect(rutaDeActa(94040)).toBe('/explorar/acta/94040');
  });

  it('la calidad y el estado se dicen en palabras del glosario, nunca con el código', () => {
    expect(etiquetaCalidad('correct')).toBe('Correcta');
    expect(etiquetaCalidad('administrative')).toBe('Administrativa');
    expect(etiquetaCalidad('review')).toBe('A revisar');
    expect(etiquetaCalidad('partial')).toBe('Parcial');
    expect(etiquetaCalidad('unavailable')).toBe('No disponible');
    expect(notaCalidad('review')).toMatch(/no cuadran/i);
    expect(notaCalidad('partial')).toMatch(/sólo publica una parte/i);
    expect(notaCalidad('administrative')).toMatch(/comité/i);
    expect(notaCalidad('correct')).toBeNull();

    expect(etiquetaEstado('played')).toBe('Final');
    expect(etiquetaEstado('scheduled')).toBe('Programado');
    expect(etiquetaEstado('postponed')).toBe('Aplazado');
    expect(etiquetaEstado('cancelled')).toBe('Anulado');
    expect(etiquetaEstado('administrative')).toBe('Administrativo');
    // Un estado que no se entiende no se disfraza: el hueco se queda vacío.
    expect(etiquetaEstado('unknown')).toBeNull();
  });

  it('los árbitros se nombran por su función, no por la clave del esquema', () => {
    expect(etiquetaOficial('principal')).toBe('Árbitro principal');
    expect(etiquetaOficial('asistente1')).toBe('Árbitro asistente 1');
    expect(etiquetaOficial('cuarto')).toBe('Cuarto árbitro');
    expect(etiquetaOficial('otro')).toBe('Árbitro');
  });

  it('la fecha del acta se escribe en castellano y sin inventar el año', () => {
    expect(fechaDeActa('2026-09-12')).toBe('sáb 12 sept 2026');
    expect(fechaDeActa(null)).toBeNull();
    expect(fechaDeActa('no-es-fecha')).toBeNull();
  });

  it('el título de la pestaña dice el partido y la jornada', () => {
    expect(tituloDeActa({ local: 'C.D. Internacional Vista Alegre', visitante: 'U.D. Sur', jornada: 1 }))
      .toBe('C.D. Internacional Vista Alegre - U.D. Sur · Jornada 1 — Fondo Popular');
  });

  it('los minutos se leen como un acta: 17′, 90+3′, y sin minuto no hay hueco', () => {
    expect(minutoTexto(17, null)).toBe('17′');
    expect(minutoTexto(90, 3)).toBe('90+3′');
    expect(minutoTexto(null, null)).toBeNull();
    expect(minutoTexto(45, 0)).toBe('45′');
  });
});

describe('la cronología', () => {
  it('coloca cada evento en su lado y los goles en propia puerta en el lado que suma', () => {
    const lineas = construyeCronologia(EVENTOS);
    const local = lineas.filter((l) => l.lado === 'local');
    const visitante = lineas.filter((l) => l.lado === 'visitante');

    expect(local.map((l) => l.detalle)).toContain('En propia puerta');
    expect(local.find((l) => l.detalle === 'En propia puerta')?.quien).toBe('DEFENSA, PROPIA');
    expect(visitante.map((l) => l.quien)).toContain('PELÁEZ MELGAR, JORGE');
    expect(visitante.find((l) => l.quien === 'PELÁEZ MELGAR, JORGE')?.detalle).toBe('Gol');
    // El penalti se distingue del gol normal y del de propia.
    expect(local.map((l) => l.detalle)).toContain('Penalti');
    // La doble amarilla a un técnico lo dice: no todo lo que se apunta es un jugador.
    expect(local.some((l) => l.detalle.includes('cuerpo técnico'))).toBe(true);
  });

  it('un cambio son dos eventos del acta y una sola línea «entra/sale»', () => {
    const lineas = construyeCronologia(EVENTOS);
    const cambios = lineas.filter((l) => l.tipo === 'cambio');
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({
      lado: 'local',
      minuto: '55′',
      quien: 'Entra ESPINOSA ARRIBAS, MARIO',
      detalle: 'Sale PEREZ ALEGRE, ALEJANDRO',
    });
  });

  it('un cambio a medias se enseña por la mitad que sí se publicó, sin inventar la otra', () => {
    const lineas = construyeCronologia([
      evento({ evento_id: 20, tipo: 'entra', minuto: 70, lado: 'visitante', persona_id: 1, persona: 'ENTRA, SOLO' }),
      evento({ evento_id: 21, tipo: 'sale', minuto: 72, lado: 'visitante', persona_id: 2, persona: 'SALE, SOLO' }),
    ]);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]!.quien).toBe('Entra ENTRA, SOLO');
    expect(lineas[1]!.quien).toBe('Sale SALE, SOLO');
  });

  it('lo que no es gol, tarjeta ni cambio no se mete en la cronología', () => {
    const lineas = construyeCronologia([evento({ evento_id: 30, tipo: 'otro', minuto: 10, lado: 'local' })]);
    expect(lineas).toEqual([]);
  });

  it('un minuto con descuento se lee 90+3′', () => {
    const lineas = construyeCronologia([EVENTOS[7]!]);
    expect(lineas[0]!.minuto).toBe('90+3′');
  });
});

describe('las marcas de un jugador', () => {
  it('salen de los eventos y no se inventan cuando no hay', () => {
    expect(marcasDeJugador(905, EVENTOS).map((m) => `${m.tipo} ${m.minuto}`)).toEqual(['penalti 75′']);
    expect(marcasDeJugador(901, EVENTOS).map((m) => m.tipo)).toEqual(['amarilla']);
    expect(marcasDeJugador(902, EVENTOS).map((m) => m.tipo)).toEqual(['sale']);
    expect(marcasDeJugador(903, EVENTOS).map((m) => m.tipo)).toEqual(['entra']);
    expect(marcasDeJugador(999, EVENTOS)).toEqual([]);
  });

  it('un gol en propia puerta se marca como propia, no como gol del equipo', () => {
    expect(marcasDeJugador(904, EVENTOS).map((m) => m.tipo)).toEqual(['propia']);
  });
});

describe('las alineaciones', () => {
  const equipos = {
    local: { nombre: 'C.D. Internacional Vista Alegre', equipoId: 17609, clubId: 1495, tieneEscudo: true },
    visitante: { nombre: 'U.D. Sur', equipoId: 17610, clubId: 1523, tieneEscudo: false },
  };

  it('reparte titulares, suplentes y convocados sin condición, y saca al entrenador', () => {
    const [local, visitante] = alineacionesPorLado(ALINEACIONES, CUERPO_TECNICO);
    expect(local!.titulares.map((j) => j.persona)).toEqual(['ANTOLIN GOMEZ, MIGUEL', 'LORENZO CANTERO, IKER']);
    expect(local!.suplentes.map((j) => j.persona)).toEqual(['PEREZ ALEGRE, ALEJANDRO', 'ESPINOSA ARRIBAS, MARIO']);
    expect(local!.convocados.map((j) => j.persona)).toEqual(['SIN CONDICION, JUGADOR']);
    expect(local!.entrenador).toBe('SANTAMARIA ECHAVE, SERGIO');
    expect(visitante!.entrenador).toBe('GONZALEZ MUÑOZ, MIGUEL');
    expect(visitante!.convocados).toEqual([]);
  });

  it('sin entrenador principal publicado no se pone el segundo como si lo fuera', () => {
    const [local] = alineacionesPorLado(ALINEACIONES, [{ lado: 'local', rol: '2ºEntrenador', persona: 'AYUDANTE, SEGUNDO' }]);
    expect(local!.entrenador).toBeNull();
  });

  it('la tarjeta renderizada pone dorsal, nombre, marcas y entrenador', () => {
    const html = renderToStaticMarkup(createElement(AlineacionesActa, {
      alineaciones: alineacionesPorLado(ALINEACIONES, CUERPO_TECNICO), equipos, eventos: EVENTOS,
    }));
    expect(html).toContain('Titulares');
    expect(html).toContain('Suplentes');
    expect(html).toContain('Convocados');
    expect(html).toContain('ANTOLIN GOMEZ, MIGUEL');
    expect(html).toContain('Gol (p) 75′');
    expect(html).toContain('↓ 55′');
    expect(html).toContain('↑ 55′');
    expect(html).toContain('SANTAMARIA ECHAVE, SERGIO');
    expect(html).not.toContain('Árbitro'); // la ficha de árbitro vive en el contexto, no en las alineaciones
    expect(html).not.toContain('ORTEGA PEÑA, MATEO');
    expect(html).not.toContain('<table');
    sinTextoProhibido(html);
  });

  it('sin alineaciones lo dice, no pinta columnas vacías', () => {
    const html = renderToStaticMarkup(createElement(AlineacionesActa, {
      alineaciones: alineacionesPorLado([], CUERPO_TECNICO), equipos, eventos: [],
    }));
    expect(html).toContain('El acta de este partido no recoge alineaciones.');
    expect(html).not.toContain('<li');
  });
});

/* ── Render ─────────────────────────────────────────────────────────────────────────────────────── */

describe('la cabecera del acta', () => {
  const html = renderToStaticMarkup(createElement(CabeceraActa, { acta: ACTA }));

  it('enseña equipos, marcador, fecha, hora y campo', () => {
    expect(html).toContain('C.D. Internacional Vista Alegre');
    expect(html).toContain('U.D. Sur');
    expect(html).toContain('1 - 5');
    expect(html).toContain('sáb 12 sept 2026');
    expect(html).toContain('12:00');
    expect(html).toContain('C.M. José Manuel Sedano');
    expect(html).toContain('Final');
    expect(html).toContain('<h1');
    sinTextoProhibido(html);
  });

  it('pinta el escudo real del club que lo tiene y el marcador de siempre en el que no', () => {
    expect(html).toContain('/api/escudo/club/1495');
    expect(html).toContain('data-escudo="real"');
    expect(html).toContain('data-escudo="determinista"');
  });

  it('sin marcador no inventa un 0-0', () => {
    const sinResultado = renderToStaticMarkup(createElement(CabeceraActa, {
      acta: { ...ACTA, goles_local: null, goles_visitante: null, estado: 'scheduled', hora: null },
    }));
    expect(sinResultado).toContain('—');
    expect(sinResultado).not.toContain('0 - 0');
    expect(sinResultado).not.toContain('00:00');
    expect(sinResultado).toContain('Programado');
  });

  it('un desempate a penaltis se dice aparte del marcador', () => {
    const conPenaltis = renderToStaticMarkup(createElement(CabeceraActa, {
      acta: { ...ACTA, goles_local: 1, goles_visitante: 1, penaltis_local: 4, penaltis_visitante: 2 },
    }));
    expect(conPenaltis).toContain('Penaltis 4-2');
  });
});

describe('la cronología renderizada', () => {
  const lineas: LineaCronologia[] = construyeCronologia(EVENTOS);

  it('pone a cada lado lo suyo y una leyenda que no depende del color', () => {
    const html = renderToStaticMarkup(createElement(CronologiaActa, { lineas, cierre: 'Final' }));
    expect(html).toContain('Cronología');
    expect(html).toContain('Local a la izquierda');
    expect(html).toContain('Entra ESPINOSA ARRIBAS, MARIO');
    expect(html).toContain('Sale PEREZ ALEGRE, ALEJANDRO');
    expect(html).toContain('En propia puerta');
    expect(html).toContain('Final');
    // La leyenda nombra cada símbolo: nunca sólo el icono o el color.
    for (const texto of ['Gol', 'Penalti', 'En propia', 'Amarilla', 'Doble amarilla', 'Roja', 'Cambio']) {
      expect(html).toContain(texto);
    }
    expect(html).not.toContain('<table');
    expect(html).toContain('aria-hidden="true"');
    sinTextoProhibido(html);
  });

  it('sin eventos lo dice en una línea', () => {
    const html = renderToStaticMarkup(createElement(CronologiaActa, { lineas: [], cierre: 'Final' }));
    expect(html).toContain('El acta de este partido no recoge eventos.');
    expect(html).not.toContain('<li');
  });
});

describe('el contexto del acta', () => {
  it('enseña el árbitro con su función', () => {
    const html = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: ACTA.oficiales, enfrentamientos: ACTA.enfrentamientos, calidad: ACTA.calidad_acta,
    }));
    expect(html).toContain('Árbitro principal');
    expect(html).toContain('ORTEGA PEÑA, MATEO');
    sinTextoProhibido(html);
  });

  it('el cara a cara enseña los enfrentamientos anteriores con su temporada y resultado', () => {
    const html = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: ACTA.oficiales, enfrentamientos: ACTA.enfrentamientos, calidad: ACTA.calidad_acta,
    }));
    expect(html).toContain('Cara a cara');
    expect(html).toContain('2024-25 · J20');
    expect(html).toContain('1 - 1');
    expect(html).toContain('2 - 1');
  });

  it('sin enfrentamientos no pinta la tarjeta vacía', () => {
    const html = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: [], enfrentamientos: [], calidad: 'correct',
    }));
    expect(html).not.toContain('Cara a cara');
    expect(html).toContain('Árbitro no publicado.');
  });

  it('dice cómo está el acta: correcta, a revisar o parcial, con la explicación del glosario', () => {
    const revisar = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: [], enfrentamientos: [], calidad: 'review',
    }));
    expect(revisar).toContain('A revisar');
    expect(revisar).toMatch(/no cuadran/i);

    const parcial = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: [], enfrentamientos: [], calidad: 'partial',
    }));
    expect(parcial).toContain('Parcial');
    expect(parcial).toMatch(/sólo publica una parte/i);

    const correcta = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: [], enfrentamientos: [], calidad: 'correct',
    }));
    expect(correcta).toContain('Acta completa');
  });

  it('no enlaza a actas de otros partidos si no consta que existan', () => {
    const html = renderToStaticMarkup(createElement(ContextoActa, {
      oficiales: ACTA.oficiales, enfrentamientos: ACTA.enfrentamientos, calidad: ACTA.calidad_acta,
    }));
    expect(html).not.toMatch(/href="[^"]*\/acta\//);
  });
});

describe('la miga del acta', () => {
  it('enlaza federación, competición y jornada, y marca el acta como página actual', () => {
    const html = renderToStaticMarkup(createElement(MigaActa, { acta: ACTA }));
    expect(html).toContain('href="/federaciones?federacion=castilla-leon"');
    expect(html).toContain('href="/explorar/competicion/3769"');
    expect(html).toContain('href="/explorar/competicion/3769/jornada/1"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Acta');
    sinTextoProhibido(html);
  });
});

/* ── Contrato contra el canónico real ──────────────────────────────────────────────────────────── */

describe('contrato estático de la consulta del acta', () => {
  it('lleva LIMIT, va por índice y no interpola valores', () => {
    expect(ACTA_DEL_PARTIDO.sql.toLowerCase()).toContain('limit');
    expect(ACTA_DEL_PARTIDO.plan).toBe('indexado');
    expect(ACTA_DEL_PARTIDO.sql).not.toContain('${');
    expect(ACTA_DEL_PARTIDO.columnas).toContain('eventos');
    expect(ACTA_DEL_PARTIDO.columnas).toContain('alineaciones');
    expect(ACTA_DEL_PARTIDO.columnas).toContain('calidad_acta');
  });
});

describe.skipIf(!hayCanonico)('el acta contra el canónico real (partido 94040)', () => {
  it('el partido de referencia tiene acta completa y su contexto es el del grupo 3769', async () => {
    const filas = await consulta<FilaActaCanonica>(ACTA_DEL_PARTIDO.sql, [MATCH_ID]);
    expect(filas).toHaveLength(1);
    const a = filas[0]!;
    expect(a.match_id).toBe(MATCH_ID);
    expect(a.federacion).toBe('castilla-leon');
    expect(a.grupo_id).toBe(3769);
    expect(a.temporada).toBe('2026-27');
    expect(a.calidad_acta).toBe('correct');
    expect(a.goles_local).toBe(1);
    expect(a.goles_visitante).toBe(5);
    expect(a.local).toBe('C.D. Internacional Vista Alegre');
    expect(a.visitante).toBe('U.D. Sur');
    expect(a.fecha).toBe('2026-09-12');
    expect(a.hora).toBe('12:00');
    expect(a.campo).toBe('C.M. José Manuel Sedano');
    expect(tieneActa(a.calidad_acta)).toBe(true);
  });

  it('el acta trae eventos, alineaciones, árbitro y cuerpo técnico, y ningún nombre inventado', async () => {
    const [a] = await consulta<FilaActaCanonica>(ACTA_DEL_PARTIDO.sql, [MATCH_ID]);
    expect(a!.eventos.length).toBeGreaterThan(0);
    for (const e of a!.eventos) {
      expect(['gol', 'tarjeta_amarilla', 'tarjeta_roja', 'entra', 'sale', 'otro']).toContain(e.tipo);
      if (e.persona !== null) expect(e.persona.length).toBeGreaterThan(1);
    }
    // Seis goles: 5 del visitante y 1 del local (el marcador del acta).
    const goles = a!.eventos.filter((e) => e.tipo === 'gol');
    expect(goles).toHaveLength(6);
    expect(goles.filter((g) => (g.lado_beneficiado ?? g.lado) === 'local')).toHaveLength(1);
    expect(goles.filter((g) => (g.lado_beneficiado ?? g.lado) === 'visitante')).toHaveLength(5);

    // Once titulares por equipo y el resto convocados.
    expect(a!.alineaciones.filter((j) => j.lado === 'local' && j.condicion === 'starter')).toHaveLength(11);
    expect(a!.alineaciones.filter((j) => j.lado === 'visitante' && j.condicion === 'starter')).toHaveLength(11);
    expect(a!.alineaciones.length).toBeGreaterThanOrEqual(30);

    expect(a!.oficiales.map((o) => o.rol)).toContain('principal');
    expect(a!.oficiales[0]!.persona.length).toBeGreaterThan(3);
    expect(a!.cuerpo_tecnico.some((t) => /entrenador/i.test(t.rol))).toBe(true);
  });

  it('un partido sin acta no devuelve fila: la página será un 404', async () => {
    const [sinActa] = await consulta<{ id: number }>(
      `select m.id from core.match m left join core.match_report r on r.match_id = m.id where r.match_id is null limit 1`);
    expect(sinActa?.id, 'hace falta un partido sin acta en el canónico para probar el 404').toBeDefined();
    const filas = await consulta(ACTA_DEL_PARTIDO.sql, [sinActa!.id]);
    expect(filas).toHaveLength(0);
  });

  it('un id que no es un partido tampoco devuelve fila', async () => {
    const filas = await consulta(ACTA_DEL_PARTIDO.sql, [999999999]);
    expect(filas).toHaveLength(0);
  });
});
