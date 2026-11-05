import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '../src/consultas/catalogo-selector';
import type { FilaAcceso } from '../src/consultas/usuario';
import { InicioContenido } from '../src/componentes/inicio/InicioContenido';
import {
  competicionesDePortada, etiquetaDeAcceso, FEDERACION_DE_LA_PORTADA, rutaDeCompeticion,
  textoDeCobertura, textoSiguiente, urlDelSelector,
} from '../src/lib/inicio';

/**
 * Contrato de la portada (Inicio / Main del prototipo).
 *
 * La portada enseña competiciones reales de Castilla y León y, si hay sesión, los favoritos de la
 * cuenta. Lo que se defiende aquí:
 *  · sin sesión no se inventa ningún equipo; se invita a entrar;
 *  · con sesión y sin favoritos se dice, no se rellena;
 *  · la cobertura sin medir no se convierte en 0;
 *  · la búsqueda usa la misma consulta canónica que `/buscar` (la página, no una caja que finja);
 *  · la interfaz no explica cómo está hecha (§8).
 */

const TEXTO_PROHIBIDO: readonly RegExp[] = [
  /canónico/i, /según la base/i, /prototipo/i, /se calcula/i, /calculad[oa]/i, /cálculo/i, /SQL/i,
  /backend/i, /endpoint/i, /consulta sql/i, /<code/i,
];

function sinTextoProhibido(html: string) {
  for (const prohibido of TEXTO_PROHIBIDO) {
    expect(html, `la interfaz no debe contener «${prohibido}»`).not.toMatch(prohibido);
  }
}

afterAll(async () => {
  await cierraCanonico();
});

/* ── Fixtures ────────────────────────────────────────────────────────────────────────────────────── */

function grupo(extra: Partial<FilaGrupoSelector> & { grupo_id: number; edicion_codigo: string }): FilaGrupoSelector {
  return {
    federacion: 'castilla-leon',
    federacion_nombre: 'Federación de Castilla y León',
    federacion_corta: 'Castilla y León',
    temporada: '2026-27',
    edicion: 'Liga Nacional Juvenil',
    ambito: 'nacional',
    modalidad: 'futbol11',
    genero: 'masculina',
    categoria: 'juvenil',
    provincia: 'Valladolid',
    nivel: 3,
    grupo: 'Primera - III',
    grupo_codigo: '24218935',
    grupo_tipo: 'liga',
    jornadas_previstas: 30,
    partidos_conocidos: 32,
    partidos_con_resultado: 32,
    actas_disponibles: 32,
    actas_parseadas: 32,
    complete_through_matchday: 4,
    visibility_state: 'parcial_privada',
    calculado_en: '2026-11-01T10:00:00Z',
    total: 1,
    ...extra,
  };
}

const COMPETICIONES = [
  grupo({ grupo_id: 3769, edicion_codigo: '24218935' }),
  grupo({ grupo_id: 3768, edicion_codigo: '24218935', grupo: 'Primera - IV' }), // mismo grupo, no se repite
  grupo({ grupo_id: 3000, edicion_codigo: 'OTRA', edicion: 'Primera Provincial', grupo: 'Primera - Ávila', provincia: 'Ávila', partidos_conocidos: 0, partidos_con_resultado: 0 }),
];

function acceso(extra: Partial<FilaAcceso> & { id: number }): FilaAcceso {
  return {
    tipo: 'equipo',
    etiqueta: 'C.D. Isoba',
    url: '/explorar/equipo/17620',
    orden: 0,
    avisar: true,
    ultimo: 'C.D. Isoba 2-1 Burgos CF',
    ultimo_url: null,
    proximo: 'Sábado 12:00 · C.D. Isoba - U.D. Sur',
    proximo_url: null,
    ...extra,
  };
}

/* ── Reglas puras ───────────────────────────────────────────────────────────────────────────────── */

describe('la selección de competiciones de la portada', () => {
  it('mapea ids numéricos, no repite la misma competición y respeta el máximo', () => {
    const competiciones = competicionesDePortada(COMPETICIONES);
    expect(competiciones.map((c) => c.grupoId)).toEqual([3769, 3000]);
    expect(competiciones[0]).toMatchObject({
      edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III', temporada: '2026-27',
      partidosConResultado: 32, partidosConocidos: 32,
    });
    expect(competicionesDePortada(COMPETICIONES, 1)).toHaveLength(1);
    // Un id inválido no se convierte en una ficha.
    expect(competicionesDePortada([grupo({ grupo_id: 0, edicion_codigo: 'X' })])).toEqual([]);
  });

  it('la cobertura sin medir se dice; el cero medido es un cero real', () => {
    const [conDatos, sinMedir, sinPartidos] = [
      { partidosConResultado: 3, partidosConocidos: 8 },
      { partidosConResultado: null, partidosConocidos: null },
      { partidosConResultado: 0, partidosConocidos: 0 },
    ].map((datos) => ({
      grupoId: 1, edicion: 'Liga', grupo: 'Grupo', temporada: '2026-27',
      federacion: 'castilla-leon', federacionNombre: 'Castilla y León', ...datos,
    }));
    expect(textoDeCobertura(conDatos)).toBe('3 de 8 partidos con resultado');
    expect(textoDeCobertura(sinMedir)).toBe('Cobertura sin medir');
    expect(textoDeCobertura(sinPartidos)).toBe('Sin partidos publicados');
  });

  it('el selector conserva federación y temporada en la URL', () => {
    expect(urlDelSelector('castilla-leon', '2026-27')).toBe('/explorar/competiciones?fed=castilla-leon&temp=2026-27');
    expect(urlDelSelector('', null)).toBe('/explorar/competiciones');
    expect(rutaDeCompeticion(3769)).toBe('/explorar/competicion/3769');
  });

  it('los favoritos saben su tipo y lo que viene después', () => {
    expect(etiquetaDeAcceso(acceso({ id: 1 }))).toBe('Equipo');
    expect(etiquetaDeAcceso(acceso({ id: 2, tipo: 'club' }))).toBe('Club');
    expect(textoSiguiente(acceso({ id: 3 }), 'proximo')).toBe('Sábado 12:00 · C.D. Isoba - U.D. Sur');
    expect(textoSiguiente(acceso({ id: 4, ultimo: '' }), 'ultimo')).toBeNull();
  });
});

/* ── Render ────────────────────────────────────────────────────────────────────────────────────── */

describe('la portada', () => {
  const render = (props: Partial<Parameters<typeof InicioContenido>[0]> = {}) => renderToStaticMarkup(
    createElement(InicioContenido, {
      competiciones: competicionesDePortada(COMPETICIONES),
      sesion: null,
      accesos: [],
      errorAccesos: false,
      ...props,
    }),
  );

  it('sin sesión enseña búsqueda, competiciones y una invitación honesta, sin equipos inventados', () => {
    const html = render();
    expect(html).toContain('¿A quién buscas?');
    expect(html).toContain('action="/buscar"');
    expect(html).toContain('Explorar una competición');
    expect(html).toContain('href="/explorar/competiciones?fed=castilla-leon');
    expect(html).toContain('href="/explorar/competicion/3769"');
    expect(html).toContain('href="/explorar/competicion/3000"');
    expect(html).toContain('Entra en tu cuenta para ver sus horarios y resultados.');
    expect(html).toContain('href="/entrar?volver=/"');
    expect(html).toContain('href="/crear-cuenta"');
    // No se pinta ningún equipo que la persona no haya guardado.
    expect(html).not.toContain('C.D. Isoba');
    expect(html).not.toContain('Último:');
    expect(html).not.toContain('Próximo:');
    sinTextoProhibido(html);
  });

  it('con sesión y favoritos enseña hasta tres y enlaza cada uno a su ficha', () => {
    const html = render({
      sesion: { nombre: 'Ana' },
      accesos: [
        acceso({ id: 1 }),
        acceso({ id: 2, tipo: 'club', etiqueta: 'C.D. Ezquerra', url: '/explorar/club/7' }),
        acceso({ id: 3, tipo: 'jugador', etiqueta: 'Martín Ezquerra', url: '' }),
        acceso({ id: 4, etiqueta: 'Cuarto equipo', url: '/explorar/equipo/9' }),
      ],
    });
    expect(html).toContain('C.D. Isoba');
    expect(html).toContain('href="/explorar/equipo/17620"');
    expect(html).toContain('C.D. Ezquerra');
    expect(html).toContain('Martín Ezquerra');
    expect(html).toContain('Último:');
    expect(html).toContain('Próximo:');
    expect(html).toContain('href="/mi-cuenta"');
    expect(html).toContain('href="/mi-panel"');
    expect(html).toContain('Ver todos los equipos que sigues');
    expect(html).not.toContain('Cuarto equipo');
    // El jugador sin enlace no se convierte en un enlace roto.
    expect(html).not.toContain('href="/explorar/jugador/null"');
    sinTextoProhibido(html);
  });

  it('con sesión y sin equipos lo dice y ofrece explorar competiciones', () => {
    const html = render({ sesion: { nombre: null }, accesos: [] });
    expect(html).toContain('Todavía no sigues a ningún equipo.');
    expect(html).toContain('Explorar competiciones');
    sinTextoProhibido(html);
  });

  it('si los favoritos fallan, la portada sigue y lo dice', () => {
    const html = render({ sesion: { nombre: 'Ana' }, errorAccesos: true });
    expect(html).toContain('No se han podido cargar tus equipos.');
    expect(html).toContain('href="/mi-panel"');
    expect(html).toContain('Explorar una competición');
  });

  it('sin competiciones lo dice en lugar de pintar una rejilla vacía', () => {
    const html = render({ competiciones: [] });
    expect(html).toContain('Todavía no hay competiciones publicadas de Castilla y León.');
    expect(html).not.toContain('href="/explorar/competicion/');
  });
});

/* ── Contrato real ─────────────────────────────────────────────────────────────────────────────── */

describe('las competiciones de la portada contra el canónico', () => {
  it('son grupos reales de Castilla y León, con id y enlace de ficha', async () => {
    const filas = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
      FEDERACION_DE_LA_PORTADA, null, null, null, null, null, null, [], 60, 0,
    ]);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((fila) => fila.federacion === FEDERACION_DE_LA_PORTADA)).toBe(true);
    const competiciones = competicionesDePortada(filas);
    expect(competiciones.length).toBeGreaterThan(0);
    expect(competiciones.length).toBeLessThanOrEqual(6);
    expect(new Set(competiciones.map((c) => c.grupoId)).size).toBe(competiciones.length);
    for (const competicion of competiciones) {
      expect(competicion.grupoId).toBeGreaterThan(0);
      expect(competicion.edicion.length).toBeGreaterThan(0);
      expect(competicion.grupo.length).toBeGreaterThan(0);
      expect(rutaDeCompeticion(competicion.grupoId)).toMatch(/^\/explorar\/competicion\/\d+$/);
    }
  });
});
