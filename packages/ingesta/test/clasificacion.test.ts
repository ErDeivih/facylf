import { describe, expect, it } from 'vitest';
import { parseaClasificacionHtml } from '../src/parsers/clasificacion.js';

describe('parseaClasificacionHtml', () => {
  it('extrae la tabla resumen oficial y su sancion', () => {
    const html = `<table>
      <tr><th>Equipos</th><th>Partidos</th><th>Ultimos</th><th>Sancion</th></tr>
      <tr><th>Ordenar por</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th></th><th>Puntos</th></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=15788">C.D. Ribert</a></td>
        <td>67</td><td>26</td><td>22</td><td>1</td><td>3</td><td>G G E P G</td><td>-2</td></tr>
    </table>`;
    expect(parseaClasificacionHtml(html)).toEqual([{
      posicion: 1, equipoCodigo: '15788', equipo: 'C.D. Ribert', puntos: 67,
      jugados: 26, ganados: 22, empatados: 1, perdidos: 3,
      ultimos: ['G', 'G', 'E', 'P', 'G'], sancion: -2,
    }]);
  });

  it('ignora tablas de resultados sin cabecera de clasificacion', () => {
    expect(parseaClasificacionHtml('<table><tr><td>Local 2 - 1 Visitante</td></tr></table>')).toEqual([]);
  });
});

/*
 * LAS VARIANTES DE LA MISMA TABLA, medidas el 25/09/2026 sobre las 11.762 clasificaciones archivadas.
 *
 * Todas son la maqueta PNFG con cambios que el lector de índices fijos no aguantaba: una palabra distinta en
 * la cabecera, una columna de más, el desglose casa/fuera en medio, o los valores pintados con JavaScript.
 * Los casos son los ficheros reales donde salieron.
 */
describe('parseaClasificacionHtml · variantes medidas', () => {
  /** La cabecera agrupada y la fila de etiquetas, que es lo que se repite en las cuatro maquetas. */
  const cabecera = (grupos: string, etiquetas: string): string =>
    `<tr>${grupos}</tr><tr>${etiquetas}</tr>`;

  it('lee la tabla de baleares, que llama «Descuento» a la sanción', () => {
    // baleares 2025-26, comp 22536409, grupo 22536410: R.C.D. MALLORCA SAD "B", 84 puntos en 34 partidos.
    const html = `<table>${cabecera(
      '<td>Equipos</td><td>Partidos</td><td>Últimos</td><td>Descuento</td>',
      '<td>Ordenar por</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td><td></td><td>Puntos</td>',
    )}<tr><td></td><td>1</td>
      <td><a href="NFG_VisCompeticiones_Grupo?codequipo=101499">R.C.D. MALLORCA SAD "B"</a></td>
      <td>84</td><td>34</td><td>26</td><td>6</td><td>2</td><td>E G G G E</td><td>0</td></tr>
      <tr><td></td><td>2</td>
      <td><a href="NFG_VisCompeticiones_Grupo?codequipo=101500">MANACOR</a></td>
      <td>77</td><td>34</td><td>24</td><td>5</td><td>5</td><td>G P G P E</td><td>0</td></tr></table>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ equipo: 'R.C.D. MALLORCA SAD "B"', puntos: 84, jugados: 34, ganados: 26, sancion: 0 });
  });

  it('lee la tabla de euskadi, que la publica en euskera', () => {
    // euskadi 2025-26, comp 22619982, grupo 22619983: REAL UNION CLUB, 69 puntos en 34 partidos.
    const html = `<table>${cabecera(
      '<td>Taldeak</td><td>Partidak</td><td>Azken emaitzak</td><td>Zigorra</td>',
      '<td>Sailkapena</td><td>Ptak</td><td>J</td><td>I</td><td>B</td><td>I</td><td></td><td>Puntuak</td>',
    )}<tr><td></td><td>1</td>
      <td><a href="NFG_VisCompeticiones_Grupo?codequipo=47">REAL UNION CLUB</a></td>
      <td>69</td><td>34</td><td>20</td><td>9</td><td>5</td><td>G P E P G</td><td>0</td></tr></table>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ equipo: 'REAL UNION CLUB', puntos: 69, jugados: 34, empatados: 9 });
  });

  it('lee la tabla con la columna de más («Pts/PJ») sin confundir 4,25 con 425 puntos', () => {
    // murcia 2025-26, comp 24023651: el lector por índices leía «4,25» como 425 puntos.
    const html = `<table>${cabecera(
      '<td>Equipos</td><td>Partidos</td><td>Últimos</td><td>Descuento</td>',
      '<td>Ordenar por</td><td>Pts/PJ</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td><td></td><td>Puntos</td>',
    )}<tr><td></td><td>1</td>
      <td><a href="NFG_VisCompeticiones_Grupo?codequipo=73">CLUB CORDILLERA</a></td>
      <td>4,2500</td><td>4</td><td>2</td><td>1</td><td>1</td><td>0</td><td>G G</td><td>0</td></tr></table>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(1);
    // El decimal de «Pts/PJ» se descarta: ni se lee como entero ni desplaza las columnas.
    expect(filas[0]).toMatchObject({ equipo: 'CLUB CORDILLERA', puntos: 4, jugados: 2, ganados: 1, empatados: 1, perdidos: 0 });
  });

  it('acepta un resumen que no cuadra consigo mismo si el desglose casa/fuera lo confirma', () => {
    // asturias 2019-20, comp 7526, grupo 24469: 21+6+2 = 29 en la columna de 28 jugados, pero el desglose
    // casa/fuera da exactamente 15+13 jugados, 13+8 ganados, 1+5 empatados y 1+1 perdidos.
    const html = `<table>
      <tr><td>Equipos</td><td>Partidos Casa</td><td>Partidos Fuera</td><td>Goles</td><td>Últimos</td><td>SanCión</td></tr>
      <tr><td>Ordenar por</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td><td>J</td><td>G</td><td>E</td><td>P</td><td>F</td><td>C</td><td></td><td>Puntos</td></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=3700">Real Titanico "A"</a></td>
        <td>69</td><td>15</td><td>13</td><td>1</td><td>1</td><td>13</td><td>8</td><td>5</td><td>1</td><td>55</td><td>20</td><td>G E</td><td>0</td></tr>
    </table>
    <table>
      <tr><td>Equipos</td><td>Partidos</td><td>Últimos</td><td>SanCión</td></tr>
      <tr><td>Ordenar por</td><td>Pts</td><td>J</td><td>G</td><td>E</td><td>P</td><td></td><td>Puntos</td></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=3700">Real Titanico "A"</a></td>
        <td>69</td><td>28</td><td>21</td><td>6</td><td>2</td><td>G E</td><td>0</td></tr>
    </table>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(1);
    // Se devuelven los números PUBLICADOS (28 jugados), no los que saldrían de sumar: no se corrige nada.
    expect(filas[0]).toMatchObject({ equipo: 'Real Titanico "A"', puntos: 69, jugados: 28, ganados: 21, empatados: 6, perdidos: 2 });
  });

  it('no lee la maqueta que pinta los valores con JavaScript, en vez de inventárselos', () => {    // galicia 2025-26, comp 24123227, grupo 24123228: las celdas de puntos y ganados llevan un script
    // `ntype(...)` y un `:after{content:...}` con OTRO número escondido al lado. Los que quedan sueltos no
    // cuadran entre sí, así que la tabla no se da por leída.
    const html = `<table>${cabecera(
      '<td>Equipos</td><td>Partidos</td><td>Goles</td><td>Últimos</td><td>SanCión</td>',
      '<td>Ordenar por</td><td>Pts</td><td>J</td><td>G</td><td>E.</td><td>P</td><td>F</td><td>C</td><td></td><td>Puntos</td>',
    )}<tr><td></td><td>1</td><td></td>
      <td><a href="NFG_VisCompeticiones_Grupo?codequipo=5028">C.D. LALIN</a></td>
      <td>7<script>ntype("idh",1,0,"fa-42");</script><span style="display:none;">42</span></td>
      <td>34</td>
      <td><script>ntype("idh2",0,0,"fa-22");</script>3<span style="display:none;">22</span></td>
      <td>6</td><td>5</td><td>60</td><td>29</td><td>G P E G P</td><td>0</td></tr></table>`;
    expect(parseaClasificacionHtml(html)).toEqual([]);
  });

  /*
   * ── GALICIA Y LA RIOJA: LA PÁGINA SÓLO PUBLICA EL DESGLOSE CASA/FUERA ─────────────────────────────────
   *
   * Medido el 26/09/2026 sobre los ficheros reales (galicia t18 c15035102 g15578307, rioja t14 c1246125
   * g1246174): su tabla de clasificación agrupa las columnas en «Partidos Casa» y «Partidos Fuera», así que el
   * lector la descarta como resumen —no lo es— y después no encuentra ningún resumen que leer. Eran 1.267
   * clasificaciones de Galicia y 596 de La Rioja devolviendo cero filas. Pero el resumen está ahí, sumando las
   * dos mitades, y los puntos son los que PUBLICa la federación.
   */
  it('lee el desglose casa/fuera de Galicia como clasificación, sumando las dos mitades', () => {
    const html = `<table>
      <tr><td>Equipos</td><td>Partidos Casa</td><td>Goles casa</td><td>Partidos Fuera</td><td>Goles fuera</td><td>Últimos</td><td>SanCión</td></tr>
      <tr><td>Ordenar por</td><td>Pts/PJ</td><td>Pts</td><td>J</td><td>G</td><td>E.</td><td>P</td><td>F</td><td>C</td><td>J</td><td>G</td><td>E.</td><td>P</td><td>F</td><td>C</td><td></td><td>Puntos</td></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=2&amp;codgrupo=15578307">R.C. DEPORTIVO S.A.D.</a></td>
        <td>2,8158</td><td>107</td><td>19</td><td>18</td><td>0</td><td>1</td><td>84</td><td>13</td><td>19</td><td>17</td><td>2</td><td>0</td><td>88</td><td>11</td><td>G E G G G</td><td>0</td></tr>
    </table>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(1);
    // Casa (19 = 18+0+1) y fuera (19 = 17+2+0) suman los 38 jugados, y los puntos son los publicados (107),
    // que es exactamente el cociente que publica la propia página en «Pts/PJ» (107/38 = 2,8158).
    expect(filas[0]).toMatchObject({
      posicion: 1, equipoCodigo: '2', equipo: 'R.C. DEPORTIVO S.A.D.', puntos: 107,
      jugados: 38, ganados: 35, empatados: 2, perdidos: 1,
    });
  });

  it('descifra las celdas pintadas y no confunde el cociente «Pts/PJ» con un entero', () => {
    // La misma fila con los números ofuscados como los publica la fuente: el cociente en un pseudo-elemento
    // CSS, los jugados partidos en dos cifras (el 1 en el CSS y el 9 en el texto) y los ganados con
    // `ntype(...)`, que necesita la tabla del `eval` de la página para resolverse.
    const html = `<html><head><script>var d=[2,5,9,4,1,0,8,6,3,7,1,3,5,7,9]</script></head><body><table>
      <tr><td>Equipos</td><td>Partidos Casa</td><td>Goles casa</td><td>Partidos Fuera</td><td>Goles fuera</td><td>Últimos</td><td>SanCión</td></tr>
      <tr><td>Ordenar por</td><td>Pts/PJ</td><td>Pts</td><td>J</td><td>G</td><td>E.</td><td>P</td><td>F</td><td>C</td><td>J</td><td>G</td><td>E.</td><td>P</td><td>F</td><td>C</td><td></td><td>Puntos</td></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=2">R.C. DEPORTIVO</a></td>
        <td><style>#a:before{content:"2,8158"}</style><span id="a"></span></td>
        <td>107</td>
        <td><style>#b:before{content:"1"}</style><span id="b"></span>9</td>
        <td><i id="c" class="fa-1"><script>ntype("c",4,0,"fa-9");</script>8</i></td>
        <td>0</td><td>1</td><td>84</td><td>13</td>
        <td>19</td><td>17</td><td>2</td><td>0</td><td>88</td><td>11</td><td>G E G G G</td><td>0</td></tr>
    </table></body></html>`;
    const filas = parseaClasificacionHtml(html);
    expect(filas).toHaveLength(1);
    // El cociente (2,8158) NO puede entrar como 28158: si entrara, los puntos se leerían como jugados y todas
    // las columnas siguientes se desplazarían una posición.
    expect(filas[0]).toMatchObject({ puntos: 107, jugados: 38, ganados: 35, empatados: 2, perdidos: 1 });
  });
});
