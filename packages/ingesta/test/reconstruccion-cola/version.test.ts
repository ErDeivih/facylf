/**
 * Versionado: qué invalida un manifiesto y qué no.
 *
 * El defecto que se corrige: la versión se derivaba del hash de dos ficheros y **no** de la lógica
 * propia de `reconstruir-cola.mjs`, así que se podía cambiar cómo se construye una fila, dejar la
 * versión intacta y aplicar un lote calculado con una regla que ya no existía. Eso es exactamente lo
 * que pasó con el manifiesto `e01b3eec46ee4909`.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ARTEFACTOS_SEMANTICOS, ESQUEMA_MANIFIESTO, VERSION_CONTRATO, versionExtractor,
} from '../../src/reconstruccion-cola/version.js';
import { compruebaVigencia, type Manifiesto } from '../../src/reconstruccion-cola/manifiesto.js';

const RAIZ_REAL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const temporales: string[] = [];

/** Copia los artefactos declarados a una raíz temporal, para poder mutarlos sin tocar el repositorio. */
function raizFalsa(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-version-'));
  temporales.push(raiz);
  for (const relativa of ARTEFACTOS_SEMANTICOS) {
    const destino = join(raiz, relativa);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, `// contenido de ${relativa}\nexport const x = 1;\n`);
  }
  return raiz;
}

afterAll(() => {
  for (const raiz of temporales) rmSync(raiz, { recursive: true, force: true });
});

describe('versionExtractor', () => {
  it('es estable: la misma raíz da la misma versión', () => {
    const raiz = raizFalsa();
    expect(versionExtractor({ raiz }).version).toBe(versionExtractor({ raiz }).version);
  });

  it('declara la huella de CADA artefacto, para poder decir cuál cambió', () => {
    const raiz = raizFalsa();
    const v = versionExtractor({ raiz });
    expect(Object.keys(v.artefactos).sort()).toEqual([...ARTEFACTOS_SEMANTICOS].sort());
    expect(v.contrato).toBe(VERSION_CONTRATO);
    expect(v.esquema).toBe(ESQUEMA_MANIFIESTO);
  });

  it('cubre la construcción de filas, la normalización, los adaptadores y las reglas de selección', () => {
    // Si alguno de estos desapareciera de la lista, el defecto original volvería sin que nada fallara.
    for (const esperado of [
      'packages/ingesta/src/reconstruccion-cola/adaptadores.ts',
      'packages/ingesta/src/reconstruccion-cola/catalogo.ts',
      'packages/ingesta/src/reconstruccion-cola/filas.ts',
      'packages/ingesta/src/reconstruccion-cola/manifiesto.ts',
      'packages/ingesta/src/parsers/nova-equipos.ts',
      'scripts/reconstruir-cola.mjs',
      'scripts/lib/recolector-local.mjs',
    ]) {
      expect(ARTEFACTOS_SEMANTICOS).toContain(esperado);
    }
  });

  it('un CAMBIO SEMÁNTICO en cualquier artefacto da otra versión', () => {
    for (const relativa of ARTEFACTOS_SEMANTICOS) {
      const raiz = raizFalsa();
      const antes = versionExtractor({ raiz }).version;
      const ruta = join(raiz, relativa);
      const contenido = `// contenido de ${relativa}\nexport const x = 1;\n`;
      writeFileSync(ruta, contenido.replace('x = 1', 'x = 2'));
      const despues = versionExtractor({ raiz });
      expect(despues.version, `${relativa} debe invalidar`).not.toBe(antes);
      // Y se puede señalar CUÁL cambió, no sólo que algo cambió.
      expect(despues.artefactos[relativa]).toBeDefined();
    }
  });

  it('un cambio FUERA DEL CONTRATO —comentarios y formato— NO cambia la versión, y es deliberado', () => {
    const raiz = raizFalsa();
    const antes = versionExtractor({ raiz }).version;
    for (const relativa of ARTEFACTOS_SEMANTICOS) {
      const ruta = join(raiz, relativa);
      const contenido = `// contenido de ${relativa}\nexport const x = 1;\n`;
      writeFileSync(ruta, `/** ahora con JSDoc */\n${contenido}\n// y un comentario al final\n`);
    }
    expect(versionExtractor({ raiz }).version).toBe(antes);
  });

  it('subir la versión del contrato a mano cambia la versión aunque no cambie ningún fichero', () => {
    const raiz = raizFalsa();
    const antes = versionExtractor({ raiz }).version;
    expect(versionExtractor({ raiz, versionContrato: VERSION_CONTRATO + 1 }).version).not.toBe(antes);
  });

  it('sobre el repositorio real calcula una versión de 16 hex', () => {
    const v = versionExtractor({ raiz: RAIZ_REAL });
    expect(v.version).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('compruebaVigencia', () => {
  const version = { version: 'aaaaaaaaaaaaaaaa', contrato: VERSION_CONTRATO, esquema: ESQUEMA_MANIFIESTO, artefactos: { 'a.ts': '1111' } };
  const base = (extra: Partial<Manifiesto> = {}): Manifiesto => ({
    federacion: 'euskadi', maqueta: 'nova',
    version_extractor: version.version, version_contrato: version.contrato, esquema_manifiesto: version.esquema,
    artefactos: { 'a.ts': '1111' }, generado_en: '2026-09-15T00:00:00.000Z',
    resumen: {
      jornadas: 0, jornadas_saltadas: 0, filas: 0, identicas: 0, cambios: 0, ambiguos: 0, jornadas_con_cambios: 0,
      ambiguos_por_motivo: {
        'el-acta-no-sostiene-la-pareja': 0, 'el-acta-no-permite-comprobar-la-pareja': 0,
        'el-html-no-trae-una-fila-en-esa-posicion': 0,
      },
      filas_fantasma: 0, filas_fantasma_sin_acta: 0, partidos_recuperados: 0, filas_duplicadas: 0, filas_retirables: 0,
      jornadas_con_filas_fantasma: 0, jornadas_con_evidencia_desfasada: 0, filas_no_comparables: 0,
      filas_fantasma_con_acta: 0, filas_fantasma_con_acta_de_descanso: 0, filas_fantasma_con_acta_de_partido: 0,
      filas_desplazadas: 0, filas_recuperables: 0, filas_recuperadas_por_acta: 0,
    },
    jornadas: [], id: 'x', ...extra,
  });

  it('un manifiesto vigente no da problemas', () => {
    expect(compruebaVigencia(base(), version)).toEqual([]);
  });

  it('un MANIFIESTO CON VERSIÓN ANTERIOR se rechaza', () => {
    const fallos = compruebaVigencia(base({ version_extractor: 'bbbbbbbbbbbbbbbb' }), version);
    expect(fallos.join(' ')).toMatch(/versión de la reconstrucción/);
  });

  it('un manifiesto de otro ESQUEMA se rechaza aunque su versión cuadre', () => {
    const fallos = compruebaVigencia(base({ esquema_manifiesto: ESQUEMA_MANIFIESTO - 1 }), version);
    expect(fallos.join(' ')).toMatch(/esquema del manifiesto/);
  });

  it('un manifiesto de otro CONTRATO se rechaza', () => {
    expect(compruebaVigencia(base({ version_contrato: VERSION_CONTRATO - 1 }), version).join(' ')).toMatch(/contrato/);
  });

  it('un manifiesto marcado OBSOLETO se rechaza y se dice por qué', () => {
    const fallos = compruebaVigencia(base({ obsoleto: true, motivo_obsolescencia: 'generado antes de corregir la construcción de filas' }), version);
    expect(fallos.join(' ')).toMatch(/OBSOLETO/);
    expect(fallos.join(' ')).toMatch(/generado antes de corregir/);
  });

  it('si cambia un artefacto se dice CUÁL', () => {
    const fallos = compruebaVigencia(base(), { ...version, artefactos: { 'a.ts': '2222' } });
    expect(fallos.join(' ')).toMatch(/el artefacto a\.ts cambió/);
  });

  it('si un artefacto desaparece de la lista declarada se dice', () => {
    const fallos = compruebaVigencia(base(), { ...version, artefactos: {} });
    expect(fallos.join(' ')).toMatch(/ya no está declarado/);
  });
});
