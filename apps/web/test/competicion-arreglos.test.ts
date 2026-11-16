import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FilaPartidoCanonico } from '../src/consultas/partidos';
import { PartidosDeJornada } from '../src/componentes/competicion/PartidosDeJornada';
import { Jornada } from '../src/componentes/competicion/Jornada';
import { UltimoYProximo, ultimoYProximo } from '../src/componentes/competicion/UltimoYProximo';
import { TabsNav } from '../src/componentes/ui';
import type { JornadaResumen, PartidoDeJornada } from '../src/lib/jornadas';

/**
 * Arreglos de la auditoría Codex del 16/11/2026 (paso 7), pantalla de clasificación.
 *
 * Lo que se defiende:
 *  · la tarjeta de partido no reserva 320 px fijos dentro de una columna estrecha (a 1280 los nombres
 *    se partían letra a letra);
 *  · un aplazado viejo no se anuncia como «próximo partido»: es un partido pendiente;
 *  · las pestañas se envuelven en móvil en vez de esconderse en un scroll sin señal.
 */

const PARTIDO: PartidoDeJornada = {
  match_id: 1, jornada: 10, orden: 1, fecha: '2026-11-08', fecha_prevista: '2026-11-08',
  hora: null, local_id: 11, visitante_id: 12, local: 'C.D. Villamayor', visitante: 'C.D. Guijuelo',
  local_codigo: null, visitante_codigo: null, local_club_id: null, visitante_club_id: null,
  local_tiene_escudo: false, visitante_tiene_escudo: false, local_nombre_corto: null,
  visitante_nombre_corto: null, goles_local: 2, goles_visitante: 0, campo: null, arbitro: null,
  calidad_acta: null, estado: 'played',
};

const JORNADA: JornadaResumen = {
  numero: 10, desde: '2026-11-07', hasta: '2026-11-08', partidos: 1, jugados: 1,
};

const fila = (jornada: number, fecha: string, goles: number | null): FilaPartidoCanonico => ({
  match_id: jornada, jornada, orden: 1, fecha: goles === null ? null : fecha, fecha_prevista: fecha,
  hora: null, local_id: 1, visitante_id: 2, local: 'Local', visitante: 'Visitante',
  goles_local: goles, goles_visitante: goles === null ? null : 0, campo: null, arbitro: null,
  calidad_acta: null, estado: goles === null ? 'scheduled' : 'played',
});

describe('arreglos de la auditoría Codex', () => {
  it('la tarjeta de partido no usa 320 px fijos: usa una fracción que cabe en la columna', () => {
    const html = renderToStaticMarkup(createElement(PartidosDeJornada, {
      jornada: JORNADA, partidos: [PARTIDO], hrefActa: () => null,
    }));
    expect(html).not.toContain('320px');
    expect(html).toContain('45%');
  });

  it('la tarjeta de jornada de la clasificación tampoco usa 320 px fijos', () => {
    const html = renderToStaticMarkup(createElement(Jornada, {
      numero: 10, partidos: [PARTIDO as unknown as FilaPartidoCanonico],
      hrefAnterior: null, hrefSiguiente: null, hrefActa: () => null,
    }));
    expect(html).not.toContain('320px');
    expect(html).toContain('45%');
  });

  it('un aplazado de una jornada pasada es «Partido pendiente», no «Próximo partido»', () => {
    const partidos = [fila(5, '2026-10-04', null), fila(10, '2026-11-08', 2)];
    const { proximo, esFuturo } = ultimoYProximo(partidos);
    expect(proximo?.jornada).toBe(5);
    expect(esFuturo).toBe(false);
    const html = renderToStaticMarkup(createElement(UltimoYProximo, { partidos }));
    expect(html).toContain('Partido pendiente');
    expect(html).not.toContain('Próximo partido');
  });

  it('las pestañas se envuelven en móvil en vez de quedar fuera de la vista', () => {
    const html = renderToStaticMarkup(createElement(TabsNav, {
      pestanas: [
        { etiqueta: 'Clasificación', href: '/explorar/competicion/44', activa: true },
        { etiqueta: 'Jornadas', href: '/explorar/competicion/44/jornadas', activa: false },
      ],
    }));
    expect(html).toContain('flex-wrap');
  });
});
