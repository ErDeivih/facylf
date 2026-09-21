import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normaliza } from '@facylf/dominio';
import { parseaCalendario } from '../src/parsers/calendario.js';
import { validaCalendario } from '../src/validacion.js';

const FICHERO = new URL('../../../datos-ejemplo/Calendario.xls', import.meta.url);
const calendario = parseaCalendario(readFileSync(FICHERO));

describe('parser del calendario (fichero real de la federación)', () => {
  it('saca 14 equipos, 26 jornadas y 182 partidos', () => {
    expect(calendario.equipos).toHaveLength(14);
    expect(calendario.jornadas).toBe(26);
    expect(calendario.partidos).toHaveLength(182);
  });

  it('conserva los sufijos de filial tal cual los escribe la federación', () => {
    expect(calendario.equipos).toContain('C.D. Munibar Pizarrales "B"');
    expect(calendario.equipos).toContain('C.D. Navega "B"');
    expect(calendario.equipos).toContain('Unionistas de Salamanca C.F. "C"');
  });

  it('lee bien el latin-1: las tildes y la ñ están enteras', () => {
    expect(calendario.equipos).toContain('C.D.F. Helmántico');
    expect(calendario.equipos).toContain('C.D. Peñaranda de Bracamonte');
  });

  it('el primer y el último partido son los del fichero', () => {
    expect(calendario.partidos[0]).toEqual({
      jornada: 1, fecha: '2026-09-20',
      local: 'Cabrerizos C.F.', visitante: 'C.D. Cristo Rey Barrio Vidal',
      golesLocal: null, golesVisitante: null,
    });
    expect(calendario.partidos.at(-1)).toMatchObject({
      jornada: 26, fecha: '2027-05-09',
      local: 'C.D. Villamayor', visitante: 'Cabrerizos C.F.',
    });
  });

  it('todas las fechas de jornada son domingo', () => {
    // son la fecha *de la jornada*, no la del partido: los juveniles juegan el sábado
    for (const [j, f] of calendario.fechaDeJornada) {
      expect(f, `jornada ${j}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${f}T00:00:00Z`).getUTCDay(), `jornada ${j}`).toBe(0);
    }
  });

  it('las jornadas no son semanas consecutivas: hay parones', () => {
    const fechas = [...calendario.fechaDeJornada.values()].filter(Boolean).sort() as string[];
    const saltos = fechas.slice(1).filter((f, i) => {
      const dias = (Date.parse(f) - Date.parse(fechas[i]!)) / 86_400_000;
      return dias > 7;
    });
    expect(saltos.length).toBeGreaterThan(0);
  });

  it('pasa las cuatro validaciones obligatorias', () => {
    expect(validaCalendario(calendario.partidos)).toEqual([]);
  });

  it('un fichero vacío es un fallo, no un caso vacío', () => {
    expect(validaCalendario(parseaCalendario('<html></html>').partidos))
      .toEqual([{ regla: 'no-vacio', detalle: 'el parser no ha devuelto ni un partido', nivel: 'critico' }]);
  });
});

describe('contraste con la cuadrícula del PDF (segunda fuente independiente)', () => {
  const rejilla = JSON.parse(
    readFileSync(new URL('../../../datos-ejemplo/cuadricula-cruces.json', import.meta.url), 'utf8'),
  ) as { equipos: string[]; jornadas: (number | null)[][] };

  // el PDF escribe los filiales sin el sufijo ("C.D. Munibar Pizarrales"), así que
  // aquí se compara por nombre base. Sólo vale porque en este grupo no hay dos
  // equipos del mismo club: se comprueba antes de fiarse.
  it('en este grupo ningún nombre base se repite', () => {
    const bases = calendario.equipos.map(normaliza);
    expect(new Set(bases).size).toBe(bases.length);
  });

  it('los 182 emparejamientos coinciden uno a uno', () => {
    const delPdf = new Set<string>();
    rejilla.jornadas.forEach((fila, i) => fila.forEach((j, k) => {
      if (j !== null) delPdf.add(`${normaliza(rejilla.equipos[i]!)}|${normaliza(rejilla.equipos[k]!)}|${j}`);
    }));
    const delXls = new Set(
      calendario.partidos.map((p) => `${normaliza(p.local)}|${normaliza(p.visitante)}|${p.jornada}`),
    );
    expect(delXls.size).toBe(182);
    expect([...delXls].filter((x) => !delPdf.has(x))).toEqual([]);
    expect([...delPdf].filter((x) => !delXls.has(x))).toEqual([]);
  });
});
