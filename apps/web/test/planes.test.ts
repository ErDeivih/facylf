/**
 * Presupuestos y planes: la parte que se comprueba en cada `pnpm test`, sin medir.
 *
 * La medición de verdad (`EXPLAIN (ANALYZE, BUFFERS)` sobre el canónico con volumen) la hace
 * `pnpm planes`, que además falla si el plan de una consulta cambia de forma. Aquí sólo se defiende lo
 * que no debe depender de tener PostgreSQL delante: que **toda** consulta declara presupuesto y tipo de
 * recorrido, que los planes guardados existen y que ninguno se coló sin `LIMIT`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSULTAS_COBERTURA } from '../src/consultas/cobertura';
import { CONSULTAS_CATALOGO } from '../src/consultas/catalogo';
import { CONSULTAS_PARTIDOS } from '../src/consultas/partidos';
import { CONSULTAS_ENTIDADES } from '../src/consultas/entidades';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const CARPETA_PLANES = join(RAIZ, 'pruebas', 'planes');

const consultas = [...CONSULTAS_COBERTURA, ...CONSULTAS_PARTIDOS, ...CONSULTAS_CATALOGO, ...CONSULTAS_ENTIDADES];

/** El nombre del fichero de plan: el mismo saneado que hace `scripts/planes.mjs`. */
const ficheroDe = (nombre: string) => `${nombre.replace(/[^\w-]/g, '-')}.json`;

describe('presupuestos de consulta', () => {
  it('toda consulta declara presupuesto, tipo de recorrido y columnas', () => {
    expect(consultas.length).toBeGreaterThanOrEqual(6);
    for (const c of consultas) {
      expect(c.presupuestoMs, `${c.nombre} sin presupuesto`).toBeGreaterThan(0);
      expect(['indexado', 'agregado'], `${c.nombre} sin tipo de recorrido`).toContain(c.plan);
      expect(c.columnas.length, `${c.nombre} sin columnas prometidas`).toBeGreaterThan(0);
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
    }
  });

  it('las consultas que se enseñan al visitante van por índice; los recuentos del catálogo agregan a propósito', () => {
    // Las que filtran por federación y grupo son las que ve el visitante en una ficha: no pueden
    // recorrer una tabla de hechos entera. Las `agregado` son las que cuentan o resumen tablas de
    // catálogo enteras porque es lo que piden: la cobertura del diagnóstico y, desde que la portada,
    // `/federaciones` y `/competiciones` leen el canónico, los recuentos y las facetas del catálogo.
    // Ninguna de ellas toca `core.match` ni las demás tablas de hechos: para eso está `resumen-canónico`,
    // que vive en el diagnóstico a propósito.
    for (const c of consultas) {
      const porGrupo = /de-grupo|goles-de-partidos|grupo-del-canónico/.test(c.nombre);
      if (porGrupo) expect(c.plan, `${c.nombre} debería ir por índice`).toBe('indexado');
    }
    expect(consultas.filter((c) => c.plan === 'agregado').map((c) => c.nombre).sort())
      .toEqual(['cobertura-por-federación', 'cobertura-por-grupo', 'facetas-del-catálogo',
        'federaciones-del-canónico', 'grupos-del-canónico', 'recuentos-del-canónico', 'resumen-canónico']);
  });

  it('cada consulta tiene su plan guardado, con presupuesto y forma', () => {
    expect(existsSync(CARPETA_PLANES), 'falta pruebas/planes/ (se genera con `pnpm planes --guardar`)').toBe(true);
    const ficheros = readdirSync(CARPETA_PLANES).filter((f) => f.endsWith('.json'));
    expect(ficheros.length).toBeGreaterThanOrEqual(consultas.length);
    // Que el fichero sea legible no basta: tiene que existir el de CADA consulta declarada. Sin esta
    // comprobación, una consulta nueva podía entrar sin que nadie hubiera mirado su plan.
    for (const c of consultas) {
      expect(existsSync(join(CARPETA_PLANES, ficheroDe(c.nombre))),
        `${c.nombre} sin plan guardado: ejecuta \`pnpm planes --guardar\``).toBe(true);
    }
    for (const fichero of ficheros) {
      const plan = JSON.parse(readFileSync(join(CARPETA_PLANES, fichero), 'utf8'));
      expect(plan.consulta, fichero).toBeTruthy();
      expect(plan.presupuestoMs, fichero).toBeGreaterThan(0);
      expect(['indexado', 'agregado'], fichero).toContain(plan.plan);
      expect(Array.isArray(plan.forma?.nodos), `${fichero}: sin forma de plan`).toBe(true);
      expect(plan.forma.nodos.length, `${fichero}: plan vacío`).toBeGreaterThan(0);
    }
  });

  it('ninguna consulta indexada guarda un Seq Scan sobre una tabla de hechos', () => {
    const hechos = ['match', 'appearance', 'match_event', 'match_staff', 'match_report', 'match_official', 'match_source'];
    for (const fichero of readdirSync(CARPETA_PLANES).filter((f) => f.endsWith('.json'))) {
      const plan = JSON.parse(readFileSync(join(CARPETA_PLANES, fichero), 'utf8'));
      if (plan.plan !== 'indexado') continue;
      const malos = (plan.forma.seqScans ?? []).filter((r: string) => hechos.includes(r));
      expect(malos, `${plan.consulta}: recorre entera ${malos.join(', ')}`).toEqual([]);
    }
  });
});
