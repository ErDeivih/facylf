/**
 * Nombres cortos de equipo y fecha de la última jornada jugada.
 *
 * Lo que se defiende:
 *  1. Las reglas del encargo, con sus cinco ejemplos y los casos raros (filial «B», una sola palabra,
 *     siglas, patrocinador detrás de « - » y nombre que sólo era forma legal).
 *  2. Que las decisiones manuales no envejezcan: cada clave sigue existiendo en el canónico de CyL.
 *  3. Que el poblado cubre TODOS los equipos de CyL y que el script es idempotente: dos pasadas seguidas
 *     y la segunda no cambia ninguna fila.
 *  4. Que las consultas traen el nombre corto en la misma fila (sin N+1) y que `fecha_ultima_jugada` es
 *     la del último partido CON RESULTADO, no la última fecha del calendario.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { CLASIFICACION_DE_LA_PANTALLA, GRUPO_POR_ID } from '../src/consultas/competiciones';
import { PARTIDOS_DEL_EQUIPO } from '../src/consultas/entidades';
import { PARTIDOS_DE_PERSONA } from '../src/consultas/fichas';
import { PARTIDOS_DE_GRUPO } from '../src/consultas/partidos';
import { DECISIONES_MANUALES, derivaNombreCorto, nombreCortoParaEquipo } from '../../../scripts/lib/nombres-cortos.mjs';

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;
const RAIZ = join(import.meta.dirname, '..', '..', '..');

afterAll(async () => {
  await cierraCanonico();
});

const normaliza = (texto: string) => texto
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();

describe('las reglas del nombre corto', () => {
  it('los cinco ejemplos del encargo salen como se pidió', () => {
    expect(nombreCortoParaEquipo('Club Deportivo Isoba').nombreCorto).toBe('Isoba');
    expect(nombreCortoParaEquipo('Real Valladolid Club de Fútbol').nombreCorto).toBe('R. Valladolid');
    expect(nombreCortoParaEquipo('Unión Deportiva Santa Marta').nombreCorto).toBe('Santa Marta');
    expect(nombreCortoParaEquipo('SD Ponferradina').nombreCorto).toBe('Ponferradina');
    expect(nombreCortoParaEquipo('Salamanca Club de Fútbol UDS').nombreCorto).toBe('Salamanca CF');
  });

  it('un filial conserva su letra y una forma legal con puntos se quita igual', () => {
    expect(nombreCortoParaEquipo('C. y D. Leonesa S.A.D. "B"').nombreCorto).toBe('Leonesa B');
    expect(nombreCortoParaEquipo('A.D. Mojados B').nombreCorto).toBe('Mojados B');
    expect(nombreCortoParaEquipo('Arandina C.F. "B"').nombreCorto).toBe('Arandina CF B');
    expect(nombreCortoParaEquipo('Burgos C.F. S.A.D. Femenino').nombreCorto).toBe('Burgos CF Femenino');
  });

  it('un nombre de una sola palabra y una sigla pegada al nombre no se rompen', () => {
    expect(nombreCortoParaEquipo('Quintanar-Palacio,CD').nombreCorto).toBe('Quintanar-Palacio');
    expect(nombreCortoParaEquipo('Ciudad Rodrigo C.F.').nombreCorto).toBe('Ciudad Rodrigo');
    expect(nombreCortoParaEquipo('C.D. Alfoz de Quintanadueñas "B"').nombreCorto).toBe('Alfoz de Quintanadueñas B');
  });

  it('el artículo en mayúscula forma parte del nombre del pueblo; en minúscula, no', () => {
    expect(nombreCortoParaEquipo('C.F.S. La Bañeza Finura de Ibérico').nombreCorto).toBe('La Bañeza');
    expect(nombreCortoParaEquipo('C.D.I. de la Amistad').nombreCorto).toBe('C.D.I. Amistad');
  });

  it('un patrocinador detrás de un guion o de la modalidad no acaba en el nombre corto', () => {
    expect(nombreCortoParaEquipo('Trepalio León Sala - Universidad de León').nombreCorto).toBe('Trepalio León');
    expect(nombreCortoParaEquipo('Atlético Benavente F.S. Caja Rural "B"').nombreCorto).toBe('Atlético Benavente B');
    expect(nombreCortoParaEquipo('C.D.I. Villaquilambre Futsal - CAJA RURAL').metodo).toBe('manual');
  });

  it('si el nombre sólo era forma legal, no se inventa nada: se deja el completo con confianza baja', () => {
    const resultado = derivaNombreCorto('C.D. F.S.');
    expect(resultado.nombreCorto).toBe('C.D. F.S.');
    expect(resultado.confianza).toBeLessThan(0.5);
    expect(nombreCortoParaEquipo('').nombreCorto).toBe('');
  });

  it('la derivación es determinista: el mismo nombre da siempre el mismo corto y la misma confianza', () => {
    for (const nombre of ['Real Valladolid Club de Fútbol', 'C.D. Juventud del Círculo Católico', 'Burgos International Football']) {
      expect(nombreCortoParaEquipo(nombre)).toEqual(nombreCortoParaEquipo(nombre));
    }
  });
});

describe.skipIf(!hayCanonico)('las decisiones manuales no envejecen', () => {
  it('cada clave de `DECISIONES_MANUALES` sigue existiendo en los equipos de Castilla y León', async () => {
    const filas = await consulta<{ nombre: string }>(
      `select distinct te.nombre_en_fuente as nombre
         from core.team_entry te
         join core.phase_group g on g.id = te.phase_group_id
         join core.competition_edition e on e.id = g.competition_edition_id
         join core.federation f on f.id = e.federation_id
        where f.codigo = 'castilla-leon'`);
    const nombres = filas.map((f) => normaliza(f.nombre.replace(/femenino/i, '')));
    const sinCoincidencia = Object.keys(DECISIONES_MANUALES).filter((clave) => {
      const buscada = normaliza(clave);
      return !nombres.some((nombre) => nombre === buscada || nombre.startsWith(`${buscada} `) || nombre.startsWith(`${buscada}-`));
    });
    expect(sinCoincidencia).toEqual([]);
  });
});

describe.skipIf(!hayCanonico)('cobertura y contrato contra el canónico', () => {
  it('todos los equipos de CyL tienen nombre corto guardado y no se repite ninguna inscripción', async () => {
    const [fila] = await consulta<{ equipos: number; con_nombre: number; manuales: number; revision: number }>(
      `with cyl as (
         select te.id
           from core.team_entry te
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = 'castilla-leon'
       )
       select count(*)::int as equipos,
              count(n.team_entry_id)::int as con_nombre,
              count(*) filter (where n.metodo = 'manual')::int as manuales,
              count(*) filter (where n.confianza < 0.7)::int as revision
         from cyl left join analytics.nombre_corto_equipo n on n.team_entry_id = cyl.id`);
    expect(fila!.equipos).toBeGreaterThan(30_000);
    expect(fila!.con_nombre).toBe(fila!.equipos);
    // Hay decisiones manuales (patrocinios, siglas propias) y muy pocas pendientes de revisar.
    expect(fila!.manuales).toBeGreaterThan(0);
    expect(fila!.revision / fila!.equipos).toBeLessThan(0.01);

    const [duplicadas] = await consulta<{ n: number }>(
      `select (count(*) - count(distinct team_entry_id))::int as n from analytics.nombre_corto_equipo`);
    expect(duplicadas!.n).toBe(0);
  });

  it('el poblado es idempotente: dos pasadas seguidas y la segunda no cambia ninguna fila', () => {
    const ejecuta = () => execFileSync('node', ['scripts/nombres-cortos-equipos.mjs', '--federacion', 'castilla-leon'], {
      cwd: RAIZ, encoding: 'utf8', timeout: 120_000,
    });
    const primera = ejecuta();
    const segunda = ejecuta();
    expect(primera).toMatch(/Guardadas:/);
    expect(segunda).toMatch(/Guardadas: 0 nuevas · 0 actualizadas/);
  }, 180_000);

  it('los partidos y la clasificación de 3769 traen el nombre corto en la misma fila', async () => {
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('local_nombre_corto');
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('visitante_nombre_corto');
    expect(CLASIFICACION_DE_LA_PANTALLA.columnas).toContain('equipo_corto');
    expect(PARTIDOS_DEL_EQUIPO.columnas).toContain('rival_corto');
    expect(PARTIDOS_DE_PERSONA.columnas).toContain('equipo_corto');
    expect(PARTIDOS_DE_PERSONA.columnas).toContain('rival_corto');

    const partidos = await consulta<Record<string, unknown>>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 400]);
    expect(partidos).toHaveLength(32);
    for (const partido of partidos) {
      expect(String(partido.local_nombre_corto ?? '').length).toBeGreaterThan(0);
      expect(String(partido.visitante_nombre_corto ?? '').length).toBeGreaterThan(0);
    }
    const clasificacion = await consulta<Record<string, unknown>>(CLASIFICACION_DE_LA_PANTALLA.sql, [3769]);
    expect(clasificacion).toHaveLength(16);
    for (const fila of clasificacion) {
      expect(String(fila.equipo_corto ?? '').length).toBeGreaterThan(0);
      // El corto no es más largo que el completo: si lo fuera, no serviría para lo que existe.
      expect(String(fila.equipo_corto).length).toBeLessThanOrEqual(String(fila.equipo).length);
    }
  });

  it('fecha_ultima_jugada es la del último partido con resultado, no la última del calendario', async () => {
    // Grupo 3769: ya jugado hasta la J4; el calendario sigue programado hasta 2027.
    const [grupo] = await consulta<{ fecha_fin: string | null; fecha_ultima_jugada: string | null }>(
      GRUPO_POR_ID.sql, [3769]);
    expect(grupo!.fecha_ultima_jugada).not.toBeNull();
    expect(String(grupo!.fecha_ultima_jugada)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [directo] = await consulta<{ fecha: string | null }>(
      `select to_char(max(coalesce(m.played_at, m.fecha_prevista::timestamptz)), 'YYYY-MM-DD') as fecha
         from core.match m
        where m.phase_group_id = 3769 and m.goles_local is not null and m.goles_visitante is not null`);
    expect(grupo!.fecha_ultima_jugada).toBe(directo!.fecha);

    // Grupos con calendario y sin resultados (75250 y 75252): la fecha del calendario existe, la jugada
    // NO. Es la diferencia entre «está programado» y «se ha jugado», y no se rellena con la programada.
    for (const id of [75250, 75252]) {
      const [sinJugar] = await consulta<{ fecha_fin: string | null; fecha_ultima_jugada: string | null }>(
        GRUPO_POR_ID.sql, [id]);
      expect(sinJugar!.fecha_fin, `grupo ${id}`).toBe('2026-10-17');
      expect(sinJugar!.fecha_ultima_jugada, `grupo ${id}`).toBeNull();
    }
  });

  it('los partidos de un equipo y de una persona reales traen el rival corto', async () => {
    const delEquipo = await consulta<Record<string, unknown>>(PARTIDOS_DEL_EQUIPO.sql, [2526, 80, 0]);
    expect(delEquipo.length).toBeGreaterThan(0);
    for (const partido of delEquipo) {
      expect(String(partido.rival_corto ?? '').length).toBeGreaterThan(0);
    }
    const dePersona = await consulta<Record<string, unknown>>(PARTIDOS_DE_PERSONA.sql, [19057, 12]);
    expect(dePersona.length).toBeGreaterThan(0);
    for (const partido of dePersona) {
      expect(String(partido.equipo_corto ?? '').length).toBeGreaterThan(0);
      expect(String(partido.rival_corto ?? '').length).toBeGreaterThan(0);
    }
  });
});
