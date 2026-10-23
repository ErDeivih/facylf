/**
 * EL ESTADO DE LA TABLA OFICIAL DE UN GRUPO: por qué no está, dicho con el lector de verdad.
 *
 * Esto nació de un hueco medido el 25/09/2026: baleares, galicia y euskadi archivan la clasificación —con la
 * tabla dentro— y el canónico tenía **cero** tablas oficiales suyas. Con el vocabulario anterior eso se
 * escribía como «sin_archivar», que es falso (el archivo está) o como «rechazada», que también (la federación
 * no la publica mal: es que no la sabemos leer). Las pruebas fijan los seis casos, uno por estado, con
 * ficheros de verdad en un directorio temporal y la maqueta de carpetas del recolector.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diagnosticaTablaOficial } from '../src/clasificacion-oficial.js';

const TEMPORADA = { codigo: '21', etiqueta: '2025-26' };
const COMPETICION = '22536409';
const GRUPO = '22536410';

const creados: string[] = [];
afterEach(() => {
  for (const ruta of creados.splice(0)) rmSync(ruta, { recursive: true, force: true });
});

/** El directorio de un grupo, tal y como lo escribe el recolector: `t21-2025-26/comp-X/grupo-Y`. */
function carpetaDelGrupo(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-clasificacion-'));
  creados.push(raiz);
  const carpeta = join(raiz, `t${TEMPORADA.codigo}-${TEMPORADA.etiqueta}`, `comp-${COMPETICION}`, `grupo-${GRUPO}`);
  mkdirSync(carpeta, { recursive: true });
  return raiz;
}

const diagnostico = (raizCola: string) => diagnosticaTablaOficial({
  raizCola, temporada: TEMPORADA, competicion: COMPETICION, grupo: GRUPO,
});

/*
 * Una tabla PNFG mínima: es la maqueta que `parseaClasificacionHtml` SÍ sabe leer. Las condiciones del
 * lector están puestas a propósito en el fixture (no es HTML decorativo):
 *   · la cabecera de las DOS primeras filas tiene que traer «Pts», «J» y «Sanción»;
 *   · la segunda fila tiene que tener EXACTAMENTE ocho celdas;
 *   · cada fila de datos, diez celdas: decorativa, posición, equipo, puntos, J, G, E, P, últimos, sanción.
 */
const HTML_PNFG = `<html><body><table>
  <tr><th>Pos</th><th>Equipo</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th>Últimos</th><th>SanCión</th></tr>
  <tr><td>&nbsp;</td><td>Pos</td><td>Equipo</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td></tr>
  <tr><td>&nbsp;</td><td>1</td><td><a href="NFG_VisEquipo?codequipo=101499">C.D. EJEMPLO</a></td><td>6</td><td>2</td><td>2</td><td>0</td><td>0</td><td>G G</td><td>0</td></tr>
  <tr><td>&nbsp;</td><td>2</td><td><a href="NFG_VisEquipo?codequipo=101500">U.D. RIVAL</a></td><td>0</td><td>2</td><td>0</td><td>0</td><td>2</td><td>P P</td><td>0</td></tr>
</table></body></html>`;

/** La maqueta «nova2» de baleares: trae tabla de verdad y el lector PNFG saca cero filas. */
const HTML_NOVA = `<html><head><title>Federació Futbol - Visualización de Clasificación</title></head><body>
  <table class="table table-bordered"><thead><tr><th colspan="4">Equipos</th><th colspan="4">Partidos Casa</th>
  <th colspan="4">Partidos Fuera</th><th colspan="2">Goles</th><th>Últimos</th><th>Descuento</th></tr></thead>
  <thead><tr><td>Ordenar por</td><td>Pts/PJ</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td><td></td><td>Puntos</td></tr></thead>
  <tbody><tr><td>&nbsp;</td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=101499"> R.C.D. MALLORCA SAD "B" </a></td>
  <td>2,5000</td><td>84</td><td>17</td><td>17</td><td>0</td><td>0</td></tr></tbody></table></body></html>`;

/** Una cáscara sin tabla: la federación todavía no publica la clasificación. */
const HTML_SIN_TABLA = '<html><body><div id="contenido">La clasificación no está disponible.</div></body></html>';

const JSON_VALIDO = JSON.stringify([
  { posicion: 1, equipo: 'C.D. EJEMPLO', puntos: 6, jugados: 2, ganados: 2, empatados: 0, perdidos: 0 },
  { posicion: 2, equipo: 'U.D. RIVAL', puntos: 0, jugados: 2, ganados: 0, empatados: 0, perdidos: 2 },
]);

describe('diagnosticaTablaOficial', () => {
  it('sin archivo ninguno dice sin_archivar', () => {
    expect(diagnostico(carpetaDelGrupo()).estado).toBe('sin_archivar');
  });

  it('con un HTML de la maqueta conocida dice legible, y cuenta las filas', () => {
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.html'), HTML_PNFG);
    const d = diagnostico(raiz);
    expect(d.estado).toBe('legible');
    expect(d.filasHtml).toBe(2);
  });

  it('con un JSON válido dice legible aunque no haya HTML', () => {
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.json'), JSON_VALIDO);
    const d = diagnostico(raiz);
    expect(d.estado).toBe('legible');
    expect(d.filasJson).toBe(2);
  });

  it('con la maqueta nova2 —trae tabla y el lector no la entiende— dice ilegible, no sin_archivar', () => {
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.html'), HTML_NOVA);
    const d = diagnostico(raiz);
    expect(d.estado).toBe('ilegible');
    expect(d.filasHtml).toBe(0);
    // El motivo tiene que decir que el problema es del lector, no de la federación.
    expect(d.motivo).toContain('trae tabla');
  });

  it('con un HTML sin tabla dice sin_filas: la federación aún no la publica', () => {
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.html'), HTML_SIN_TABLA);
    expect(diagnostico(raiz).estado).toBe('sin_filas');
  });

  it('con un archivo que sólo trae la tabla de RESULTADOS también dice sin_filas, no ilegible', () => {
    /*
     * Euskadi 2014-15, comp 2837, grupo 513242: el archivo guarda la página con los partidos y sus
     * marcadores, y ninguna clasificación. Contarlo como «el lector no la sabe leer» era falso: no hay nada
     * que leer. Antes se decidía con «¿tiene alguna <table>?», y la de resultados también lo es.
     */
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.html'),
      `<html><body><table>
        <tr><td><a href="NFG_VisEquipos?Codigo_Equipo=1">LEIOA, S.D.</a></td><td>-</td><td><a href="NFG_VisEquipos?Codigo_Equipo=2">SESTAO RIVER CLUB</a></td></tr>
        <tr><td><a href="NFG_VisEquipos?Codigo_Equipo=3">BARAKALDO</a></td><td>-</td><td><a href="NFG_VisEquipos?Codigo_Equipo=4">TRIVAL VALDERAS</a></td></tr>
      </table></body></html>`);
    expect(diagnostico(raiz).estado).toBe('sin_filas');
  });

  it('con un JSON que no pasa el validador dice rechazada, con el motivo', () => {
    const raiz = carpetaDelGrupo();
    // Posiciones con hueco (1 y 5): es el motivo R1 que tumba las tablas de Cataluña.
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.json'), JSON.stringify([
      { posicion: 1, equipo: 'C.D. EJEMPLO', puntos: 6, jugados: 2, ganados: 2, empatados: 0, perdidos: 0 },
      { posicion: 5, equipo: 'U.D. RIVAL', puntos: 0, jugados: 2, ganados: 0, empatados: 0, perdidos: 2 },
    ]));
    const d = diagnostico(raiz);
    expect(d.estado).toBe('rechazada');
    expect(d.motivo.length).toBeGreaterThan(0);
  });

  it('un JSON vacío y sin HTML no es «ilegible»: no hay tabla que leer', () => {
    const raiz = carpetaDelGrupo();
    writeFileSync(join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`, 'clasificacion.json'), '[]');
    expect(diagnostico(raiz).estado).toBe('sin_filas');
  });

  it('si el JSON es válido manda sobre un HTML ilegible: hay filas y se pueden usar', () => {
    const raiz = carpetaDelGrupo();
    const carpeta = join(raiz, 't21-2025-26', `comp-${COMPETICION}`, `grupo-${GRUPO}`);
    writeFileSync(join(carpeta, 'clasificacion.html'), HTML_NOVA);
    writeFileSync(join(carpeta, 'clasificacion.json'), JSON_VALIDO);
    const d = diagnostico(raiz);
    expect(d.estado).toBe('legible');
    expect(d.filasJson).toBe(2);
  });
});
