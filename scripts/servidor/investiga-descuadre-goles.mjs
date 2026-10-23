/*
 * investiga-descuadre-goles.mjs — por qué leemos MENOS goles de los que dice el marcador
 *
 * ── EL CASO, QUE NO ES EL MISMO QUE EL DEL FÚTBOL BASE ──────────────────────────────────────────────────
 *
 * En Valencia el aviso era `descuadre_goles:2/0`: el marcador dice 2 y NO hay ningún goleador publicado. Eso es
 * la fuente, y ya está comprobado acta a acta.
 *
 * Pero en euskadi (15,3 % de las actas de adultos) y murcia (11,9 %) el aviso es **`descuadre_goles:2/1`**: el
 * marcador dice 2 y hemos leído **1**. La fuente SÍ trae una lista de goleadores, y leemos menos de los que hay.
 * Eso apunta a un fallo nuestro —goles en propia puerta o de penalti que no contamos— y es el dato de jugadores
 * que más importa, así que hay que verlo.
 *
 * Este guion coge actas concretas con ese patrón y enseña, una al lado de otra:
 *   · el marcador y los goles que hemos guardado nosotros (de la columna `datos`);
 *   · la ficha original archivada, buscando las marcas de gol y las palabras que delatan un penalti o una
 *     propia puerta.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/investiga-descuadre-goles.mjs <raíz> <federación> [cuántas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , raiz, federacion, cuantasArg] = process.argv;
if (!raiz || !federacion) {
  console.error('uso: investiga-descuadre-goles.mjs <raíz> <federación> [cuántas]');
  process.exit(2);
}
const cuantas = Number(cuantasArg ?? 3);
const carpeta = join(raiz, `descargas-${federacion}`, 'recolector-local');
const db = new DatabaseSync(join(carpeta, 'cola-v2.sqlite'), { readOnly: true, timeout: 60_000 });

const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all()
  .map((t) => [String(t.codigo), t.etiqueta]));

// Primero las claves (consulta ligera) y sólo después el `datos` de esas pocas.
const claves = db.prepare(`select temporada, competicion, grupo, jornada, codigo, incidencias
  from actas where estado='hecha' and menores = 0 and incidencias like '%descuadre_goles%'
    and incidencias not like '%descuadre_goles:0%'
  order by random() limit ?`).all(cuantas);

console.log(`federación: ${federacion} · actas con «la fuente trae goles y leemos menos»: ${claves.length}\n`);

for (const c of claves) {
  const datos = db.prepare(`select datos from actas where temporada=? and competicion=? and grupo=?
    and jornada=? and codigo=?`).get(c.temporada, c.competicion, c.grupo, c.jornada, c.codigo)?.datos;

  let nuestros = '(sin datos)';
  try {
    const d = typeof datos === 'string' ? JSON.parse(datos) : datos;
    const g = d?.goles ?? d?.golesDetalle ?? null;
    nuestros = `marcador ${d?.golesLocal ?? '?'}-${d?.golesVisitante ?? '?'}, goles guardados: ${
      Array.isArray(g) ? g.length : typeof g === 'number' ? g : 'no hay campo'}`;
  } catch { nuestros = '(datos ilegibles)'; }

  // La ficha original: en las federaciones PNFG se archiva el HTML de la ficha.
  const etiqueta = etiquetas.get(String(c.temporada)) ?? null;
  let html = null;
  if (etiqueta) {
    const base = join(carpeta, `t${c.temporada}-${etiqueta}`, `comp-${c.competicion}`, `grupo-${c.grupo}`);
    for (const tipo of ['actas-adultos', 'actas-menores']) {
      for (const nombre of [`acta-${c.codigo}.html`, `acta-${c.codigo}.json.gz`]) {
        const p = join(base, tipo, nombre);
        if (existsSync(p) && p.endsWith('.html')) html = readFileSync(p, 'utf8');
      }
    }
    if (!html && existsSync(base)) {
      // Algunas federaciones archivan con otro nombre: se busca por el código dentro de la carpeta.
      const encontrados = [];
      const recorre = (dir, fondo) => {
        if (fondo > 3) return;
        let entradas = [];
        try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
          if (e.isDirectory()) recorre(join(dir, e.name), fondo + 1);
          else if (e.name.includes(String(c.codigo)) && e.name.endsWith('.html')) encontrados.push(join(dir, e.name));
        }
      };
      recorre(base, 0);
      if (encontrados[0]) html = readFileSync(encontrados[0], 'utf8');
    }
  }

  console.log(`acta ${c.codigo}  t${c.temporada} c${c.competicion} g${c.grupo} j${c.jornada}`);
  console.log(`   aviso nuestro:  ${c.incidencias}`);
  console.log(`   nosotros:       ${nuestros}`);
  if (!html) { console.log('   ficha original: NO ENCONTRADA\n'); continue; }

  // Marcas delatoras en la ficha original.
  const cuenta = (re) => (html.match(re) ?? []).length;
  const lineasGol = html.split(/\r?\n/).filter((l) => /gol|penalt|propia|\bpp\b/i.test(l)).slice(0, 6);
  console.log(`   ficha original: ${html.length} bytes · «GOL» x${cuenta(/\bGOL\b/gi)}`
    + ` · «penalti» x${cuenta(/penalt/gi)} · «propia» x${cuenta(/propia/gi)}`);
  for (const l of lineasGol) console.log(`      | ${l.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)}`);
  console.log('');
}
db.close();
