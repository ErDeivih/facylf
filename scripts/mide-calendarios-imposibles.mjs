#!/usr/bin/env node
/*
 * ¿CUÁNTOS GRUPOS DE LA COLA CATALANA TIENEN UN CALENDARIO IMPOSIBLE?
 *
 * El importador importa fielmente lo que dice la cola, y la cola de Cataluña trae calendarios inventados por
 * el defecto del recolector (§3.11). Medido en el canónico el 24/09/2026: 242 grupos y 95.876 apariciones
 * infladas. La pregunta que contesta esto es **cuánto queda por entrar así**, para saber a qué se renuncia si
 * el importador se niega a importarlos.
 *
 * Dos reglas, las dos imposibles en cualquier liga y las dos comprobadas contra datos reales:
 *   · todas las jornadas con las mismas parejas **y el mismo lado** (parejas × jornadas = partidos);
 *   · más de cuatro partidos por pareja (ni a cuatro vueltas).
 *
 * ── EL LADO NO ES UN DETALLE (corregido el 24/09/2026 tras medir mal una vez) ─────────────────────────────
 *
 * La primera versión ordenaba los dos nombres, para que diera igual quién jugara en casa. Eso marcaba como
 * imposibles **434 grupos de fuera de Cataluña que eran perfectamente normales**: en una liga a doble vuelta
 * la jornada de vuelta empareja a los mismos equipos con los lados cambiados, así que las dos jornadas daban
 * la misma firma. Guardando el lado, la vuelta se distingue de la ida y el defecto de copia se sigue viendo
 * igual —la jornada repetida repite también el lado—.
 *
 * SÓLO LEE. Uso: node scripts/mide-calendarios-imposibles.mjs [federacion]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'calendarios-imposibles.json');

const filtro = process.argv[2] ?? null;

/*
 * ── LAS FILAS DE DESCANSO NO SON PARTIDOS, Y HAY QUE DESCONTARLAS ────────────────────────────────────────
 *
 * El importador las descarta con `esFilaDeDescanso` (§3.8 de la guía y el trabajo de reparación de descansos),
 * así que contarlas aquí inventa calendarios imposibles que no existen: el grupo 795406 de La Rioja salía
 * marcado con 42 «partidos» que eran en su mayoría `Descansa vs Descansa`. El vocabulario es el mismo que usa
 * el importador (`packages/ingesta/src/parsers/filas-informativas.ts`): `descansa`, `descans` y `atsedena`,
 * como palabra entera, después de quitar el marcador de estado (`Descansa (Ganador)`) y los acentos.
 */
const PALABRAS_DESCANSO = ['descansa', 'descans', 'atsedena'];
function esFilaDeDescanso(local, visitante) {
  const limpia = (texto) => String(texto ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return PALABRAS_DESCANSO.includes(limpia(local)) || PALABRAS_DESCANSO.includes(limpia(visitante));
}

function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    const carpeta = entrada.name;
    if (carpeta === 'descargas-federacion-sondeo' || carpeta === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta) || existsSync(join(RAIZ, carpeta, '.PRUEBA'))) continue;
    const federacion = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
    if (filtro && federacion !== filtro) continue;
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

const detalle = [];
for (const cola of colas()) {
  const db = new DatabaseSync(cola.ruta, { readOnly: true });
  let filas = [];
  try {
    /*
     * Se cuenta por grupo con SQL: parejas distintas CON LADO —la clave es la pareja dirigida, no la de
     * equipos— y número de jornadas. Se pide el grupo entero de una vez y no fila a fila, que es lo que hacía
     * lento el recuento del origen.
     */
    filas = db.prepare(`
      select p.temporada, t.etiqueta, p.competicion, p.grupo, p.jornada, p.local, p.visitante
        from partidos p
        join temporadas t on t.codigo = p.temporada`).all();
  } catch (error) {
    console.error(`  ${cola.federacion}: no se pudo leer (${error.message})`);
  } finally { db.close(); }

  let grupos = 0;
  let imposibles = 0;
  let partidosImposibles = 0;
  // Agrupación en memoria por (temporada, competición, grupo): así se descartan las filas de descanso, que en
  // SQL obligarían a repetir un predicado con acentos y marcadores de estado.
  const porGrupo = new Map();
  for (const f of filas) {
    if (esFilaDeDescanso(f.local, f.visitante)) continue;
    const clave = `${f.etiqueta}|${f.competicion}|${f.grupo}`;
    let g = porGrupo.get(clave);
    if (!g) { g = { etiqueta: f.etiqueta, competicion: f.competicion, grupo: f.grupo, partidos: 0, jornadas: new Set(), parejas: new Set() }; porGrupo.set(clave, g); }
    g.partidos += 1;
    g.jornadas.add(f.jornada);
    g.parejas.add(`${f.local}|${f.visitante}`);
  }
  for (const g of porGrupo.values()) {
    grupos += 1;
    const partidos = g.partidos;
    const jornadas = g.jornadas.size;
    const parejas = g.parejas.size;
    if (partidos < 2 || parejas === 0) continue;
    const mismoJornada = jornadas > 1 && parejas * jornadas === partidos;
    const demasiadasVueltas = partidos > 4 * parejas;
    if (mismoJornada || demasiadasVueltas) {
      imposibles += 1;
      partidosImposibles += partidos;
      detalle.push({ federacion: cola.federacion, temporada: g.etiqueta, competicion: g.competicion,
        grupo: g.grupo, partidos, jornadas, parejas,
        motivo: mismoJornada ? 'todas las jornadas iguales' : 'más de cuatro partidos por pareja' });
    }
  }
  console.log(`  ${cola.federacion.padEnd(20)} ${String(grupos).padStart(5)} grupos con partidos · `
    + `${String(imposibles).padStart(4)} con calendario imposible · ${String(partidosImposibles).padStart(7)} partidos`);
}

const porFederacion = {};
for (const d of detalle) {
  porFederacion[d.federacion] = porFederacion[d.federacion] ?? { grupos: 0, partidos: 0, temporadas: {} };
  porFederacion[d.federacion].grupos += 1;
  porFederacion[d.federacion].partidos += d.partidos;
  porFederacion[d.federacion].temporadas[d.temporada] = (porFederacion[d.federacion].temporadas[d.temporada] ?? 0) + 1;
}
writeFileSync(SALIDA, `${JSON.stringify({ cuando: new Date().toISOString(), porFederacion, lista: detalle }, null, 2)}\n`);
console.log(`\n  total: ${detalle.length} grupos con calendario imposible · `
  + `${detalle.reduce((n, d) => n + d.partidos, 0).toLocaleString('es-ES')} partidos`);
for (const [f, v] of Object.entries(porFederacion).sort((a, b) => b[1].grupos - a[1].grupos)) {
  console.log(`    ${f.padEnd(20)} ${String(v.grupos).padStart(4)} grupos · ${JSON.stringify(v.temporadas)}`);
}
console.log(`\n  la lista en pruebas/reconstruccion/calendarios-imposibles.json`);
