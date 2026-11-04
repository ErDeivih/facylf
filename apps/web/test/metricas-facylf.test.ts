import { describe, expect, it } from 'vitest';
import {
  construyeMetricas, porcentajeQueFalta, fraseResumen, formatoMedido, parseaSondeoServidor, porMinuto,
  TAMANO_VENTANA_MINUTOS,
} from '../../../scripts/lib/metricas-facylf.mjs';

/**
 * Contrato de `metricas-facylf.json`: lo lee el panel de proyectos y **no calcula nada**, así que la
 * forma y la semántica tienen que quedar fijadas aquí. Estas pruebas son puras: no tocan la base, ni
 * las colas, ni el servidor; sólo la aritmética y la forma del documento.
 *
 * Definiciones que se fijan (y que el script aplica):
 *  · una «competición» es una **edición de competición** (liga/división de una temporada);
 *  · está «completa» cuando **todos sus grupos** tienen cobertura `completa` en el canónico;
 *  · el total es la **unión** de las competiciones que conocen las colas del PC y del servidor y las
 *    que ya están en el canónico, sin contar dos veces el mismo código;
 *  · `porcentaje` es lo que FALTA, redondeado a entero (100 − completas/total).
 */
describe('métricas de CyL para el panel', () => {
  const catalogoPc = {
    temporadas: [{ codigo: '22', etiqueta: '2026-27' }, { codigo: '21', etiqueta: '2025-26' }],
    competiciones: [
      { temporada: '22', codigo: '100' },
      { temporada: '22', codigo: '101' },
      { temporada: '21', codigo: '200' },
    ],
  };
  const catalogoServidor = {
    temporadas: [{ codigo: '22', etiqueta: '2026-27' }, { codigo: '20', etiqueta: '2024-25' }],
    // El 100 ya lo conoce el PC: no puede contar dos veces. El 300 sólo lo conoce el servidor.
    competiciones: [
      { temporada: '22', codigo: '100' },
      { temporada: '20', codigo: '300' },
    ],
  };
  const edicionesCanonico = [
    { etiqueta: '2026-27', codigo: '100', completa: true },
    { etiqueta: '2026-27', codigo: '101', completa: false },
    // Una edición que el canónico tiene pero las colas no listan: entra en el total.
    { etiqueta: '2024-25', codigo: '301', completa: false },
    // Temporada que sólo está en el canónico (histórica ya importada).
    { etiqueta: '2012-13', codigo: '400', completa: true },
  ];

  it('el documento tiene la forma EXACTA que lee el panel (sin claves de más ni de menos)', () => {
    const m = construyeMetricas({
      catalogoPc, catalogoServidor, edicionesCanonico,
      ritmo: { pcPorMin: 3, servidorPorMin: 20 }, medido: '2026-11-04T19:30',
    });
    expect(Object.keys(m)).toEqual(['cyl', 'temporadas', 'ritmo']);
    expect(Object.keys(m.cyl)).toEqual(['competiciones_total', 'completas', 'porcentaje']);
    expect(Object.keys(m.ritmo)).toEqual(['pc_por_min', 'servidor_por_min', 'medido']);
    for (const t of m.temporadas) expect(Object.keys(t)).toEqual(['temporada', 'hecho', 'total']);
    expect(m.ritmo).toEqual({ pc_por_min: 3, servidor_por_min: 20, medido: '2026-11-04T19:30' });
  });

  it('el total es la unión sin duplicar: PC + servidor + canónico, una vez por código', () => {
    const m = construyeMetricas({
      catalogoPc, catalogoServidor, edicionesCanonico,
      ritmo: { pcPorMin: 0, servidorPorMin: 0 }, medido: '2026-11-04T19:30',
    });
    // 2026-27: 100,101,100(dup), = 2 · 2025-26: 200 · 2024-25: 300,301 · 2012-13: 400
    expect(m.cyl.competiciones_total).toBe(6);
    expect(m.cyl.completas).toBe(2); // 100 y 400
    expect(m.temporadas).toEqual([
      { temporada: '2026-27', hecho: 1, total: 2 },
      { temporada: '2025-26', hecho: 0, total: 1 },
      { temporada: '2024-25', hecho: 0, total: 2 },
      { temporada: '2012-13', hecho: 1, total: 1 },
    ]);
  });

  it('el porcentaje es lo que FALTA, entero y redondeado; sin competiciones no se inventa un 100', () => {
    expect(porcentajeQueFalta(6, 2)).toBe(67); // falta 4 de 6 = 66,6 → 67
    expect(porcentajeQueFalta(807, 133)).toBe(84); // 83,5 → 84
    expect(porcentajeQueFalta(10, 10)).toBe(0);
    expect(porcentajeQueFalta(0, 0)).toBe(0);
    const m = construyeMetricas({
      catalogoPc: { temporadas: [], competiciones: [] },
      catalogoServidor: { temporadas: [], competiciones: [] },
      edicionesCanonico: [],
      ritmo: { pcPorMin: 0, servidorPorMin: 0 }, medido: '2026-11-04T19:30',
    });
    expect(m.cyl).toEqual({ competiciones_total: 0, completas: 0, porcentaje: 0 });
    expect(m.temporadas).toEqual([]);
  });

  it('si una competición está en las dos colas se cuenta una vez, aunque cambie la temporada de etiqueta', () => {
    const m = construyeMetricas({
      catalogoPc: { temporadas: [{ codigo: '22', etiqueta: '2026-27' }], competiciones: [{ temporada: '22', codigo: '24218934' }] },
      catalogoServidor: { temporadas: [{ codigo: '22', etiqueta: '2026-27' }], competiciones: [{ temporada: '22', codigo: '24218934' }] },
      edicionesCanonico: [{ etiqueta: '2026-27', codigo: '24218934', completa: false }],
      ritmo: { pcPorMin: 12, servidorPorMin: 8 }, medido: '2026-11-04T19:30',
    });
    expect(m.cyl.competiciones_total).toBe(1);
    expect(m.temporadas).toEqual([{ temporada: '2026-27', hecho: 0, total: 1 }]);
  });

  it('el ritmo es por minuto y no una media histórica: se calcula sobre los últimos 5 minutos', () => {
    const m = construyeMetricas({
      catalogoPc, catalogoServidor, edicionesCanonico,
      ritmo: { pcPorMin: 3.6, servidorPorMin: 18 }, medido: '2026-11-04T19:30',
    });
    expect(m.ritmo.pc_por_min).toBe(3.6);
    expect(m.ritmo.servidor_por_min).toBe(18);
    expect(TAMANO_VENTANA_MINUTOS).toBe(5);
    // 90 peticiones en 5 minutos son 18/min, no 90 ni 6.
    expect(porMinuto(90)).toBe(18);
    expect(porMinuto(1)).toBe(0.2);
    expect(porMinuto(0)).toBe(0);
  });

  it('`medido` es una marca local AAAA-MM-DDTHH:MM, sin segundos ni zona', () => {
    expect(formatoMedido(new Date('2026-11-04T19:30:45Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(formatoMedido(new Date('2026-11-04T19:30:45Z'))).toHaveLength(16);
  });

  it('la frase en llano dice lo mismo que los números', () => {
    const m = construyeMetricas({
      catalogoPc, catalogoServidor, edicionesCanonico,
      ritmo: { pcPorMin: 3, servidorPorMin: 20 }, medido: '2026-11-04T19:30',
    });
    const f = fraseResumen(m);
    expect(f).toContain('2 de 6');
    expect(f).toContain('67');
    expect(f).toContain('3');
    expect(f).toContain('20');
  });

  it('la respuesta del servidor se parsea aunque traiga avisos delante del JSON', () => {
    const salida = [
      '(node:123) ExperimentalWarning: SQLite is an experimental feature',
      JSON.stringify({ total: 20, cyl: { competiciones: [{ temporada: '22', codigo: '1' }], temporadas: [{ codigo: '22', etiqueta: '2026-27' }] } }),
      '',
    ].join('\n');
    const r = parseaSondeoServidor(salida);
    expect(r.total).toBe(20);
    expect(r.cyl.competiciones).toHaveLength(1);
  });

  it('si el servidor no devuelve un JSON válido, falla con un motivo claro (no se publican ceros)', () => {
    expect(() => parseaSondeoServidor('ssh: connect to host servidor port 22: Connection timed out\n')).toThrow(/servidor/i);
  });
});
