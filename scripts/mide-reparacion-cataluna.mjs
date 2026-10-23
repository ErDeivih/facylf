#!/usr/bin/env node
/*
 * MIDE LO QUE SE PUEDE REPARAR EN CATALUÑA, SIN TOCAR NADA.
 *
 * El recolector de Cataluña repetía una jornada en todas las demás (§3.11) y esos partidos inventados entraron
 * al canónico: 208 grupos, 44.145 partidos y 7.296 apariciones infladas, medido con `pnpm importar:sospechosos`.
 *
 * Volver a recolectar NO arregla esto: la página del calendario sólo deja leer una jornada por carga (medido),
 * así que re-recolectar devolvería los mismos nueve emparejamientos. Lo que sí lo arregla es lo que ya está
 * descargado: **el archivo de cada acta guarda su propia verdad**. Un `acta-<código>.json.gz` trae:
 *
 *     "equipos": ["BADALONA, C.F.", "MONTAÑESA, C.F."],
 *     "detalles": { "jornada": "2", "fecha": "12.09.2026", "hora": "17.30H", "estadio": "…" },
 *     "marcador": [0, 1],
 *     "url": "https://www.fcf.cat/ca/competicio/acta/4106677"
 *
 * Es decir: pareja, jornada, fecha y marcador de cada partido jugado. Con eso el calendario de los partidos
 * jugados se puede reconstruir sin pedir nada a la red, y sin inventar nada.
 *
 * ESTE GUION SÓLO LEE. Cuenta cuánto se recuperaría en cada grupo y lo compara con lo que hay ahora, para
 * saber si la reparación merece la pena ANTES de escribir una sola fila.
 *
 * Uso:
 *   node scripts/mide-reparacion-cataluna.mjs                 · los grupos confirmados del parte
 *   node scripts/mide-reparacion-cataluna.mjs --grupo 58161925
 *   node scripts/mide-reparacion-cataluna.mjs --json
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLA = join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite');
const SOSPECHOSOS = join(RAIZ, 'pruebas', 'reconstruccion', 'grupos-con-acta-repetida.json');
const IMPOSIBLES = join(RAIZ, 'pruebas', 'reconstruccion', 'calendarios-imposibles.json');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'reparacion-cataluna.json');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const soloJson = argumentos.includes('--json');
const grupoSuelto = arg('grupo');

if (!existsSync(COLA)) { console.error(`No hay cola de Cataluña en ${COLA}`); process.exit(1); }

/*
 * Los grupos a mirar: los confirmados del último parte. Si no hay parte, se cogen los que la cola tenga con el
 * defecto, que es la misma lista pero medida en el sitio equivocado; por eso se avisa.
 */
/*
 * Los grupos a reparar salen de `calendarios-imposibles.json`, que es la lista que produce
 * `pnpm importar:imposibles` mirando las COLAS: son exactamente los grupos que el importador rechaza hoy.
 * (`grupos-con-acta-repetida.json` es la otra lista, la del canónico, y sirve para medir el daño ya escrito.)
 */
let objetivos;
if (grupoSuelto) {
  objetivos = [{ grupo: grupoSuelto, partidos: null }];
} else if (existsSync(IMPOSIBLES)) {
  const parte = JSON.parse(readFileSync(IMPOSIBLES, 'utf8'));
  objetivos = parte.lista.map((g) => ({ grupo: g.grupo, federacion: g.federacion, temporada: g.temporada, partidos: Number(g.partidos) }));
} else if (existsSync(SOSPECHOSOS)) {
  const parte = JSON.parse(readFileSync(SOSPECHOSOS, 'utf8'));
  objetivos = parte.lista.filter((g) => g.confirmado).map((g) => ({ grupo: g.grupo, partidos: Number(g.partidos), federacion: g.federacion }));
} else {
  console.error('No hay lista de grupos con calendario imposible: lanza antes `pnpm importar:imposibles`.');
  process.exit(1);
}

/** Abre el archivo de un acta: la cola guarda la ruta sin `.gz`, y el fichero está comprimido. */
function leeArchivo(ruta) {
  for (const candidata of [ruta, `${ruta}.gz`]) {
    if (!existsSync(candidata)) continue;
    try {
      const bytes = readFileSync(candidata);
      const texto = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
      return JSON.parse(texto);
    } catch { return null; }
  }
  return null;
}

/*
 * ── POR QUÉ NO SE PUEDE LEER UN ARCHIVO (medido el 24/09/2026) ───────────────────────────────────────────
 *
 * Saber que sólo se recupera un 0,3 % no sirve para decidir nada; saber POR QUÉ sí. Las tres causas piden
 * cosas distintas: los que están en el servidor se recuperan cuando vuelva 192.168.1.138, los que se
 * perdieron aquí hay que volver a descargarlos, y los que no tienen ruta no se pueden ni buscar.
 */
const MOTIVOS = {
  sinRuta: 'la cola no guarda ninguna ruta de archivo',
  enServidor: 'la ruta es del contenedor del servidor (/app/…)',
  perdidoAqui: 'la ruta es de este PC y el fichero no está',
  ilegible: 'el fichero está, pero no se puede leer o no trae pareja',
};
function clasificaArchivo(fila) {
  if (!fila.archivo) return 'sinRuta';
  if (String(fila.archivo).startsWith('/app/')) return 'enServidor';
  const ruta = join(RAIZ, fila.archivo);
  if (!existsSync(ruta) && !existsSync(`${ruta}.gz`)) return 'perdidoAqui';
  return 'ilegible';
}

/** El código de acta sale de la URL del archivo: es lo que permite atarlo a la fila del calendario. */
function codigoDeArchivo(datos) {
  const m = /\/acta\/(\d+)/.exec(String(datos?.url ?? ''));
  return m ? m[1] : null;
}

const db = new DatabaseSync(COLA, { readOnly: true });
const informe = [];
for (const objetivo of objetivos) {
  const grupo = objetivo.grupo;
  const filas = db.prepare(`select codigo, jornada, archivo, estado from actas where grupo = ?`).all(grupo);
  const calendario = db.prepare(`select count(*) filas, count(distinct jornada) jornadas,
      count(distinct (case when local < visitante then local||'-'||visitante else visitante||'-'||local end)) parejas,
      count(distinct codigo_acta) codigos from partidos where grupo = ?`).get(grupo);
  // Los nombres de equipo que la cola ya usa en su calendario: sirve para saber si lo recuperado encaja con
  // lo que ya conoce (mismo nombre exacto) o si hará falta resolverlo por nombre.
  const equiposDeLaCola = new Set(db.prepare('select distinct nombre from equipos').all().map((e) => e.nombre));

  const recuperados = new Map();
  const motivos = { sinRuta: 0, enServidor: 0, perdidoAqui: 0, ilegible: 0 };
  for (const fila of filas) {
    if (fila.estado !== 'hecha') continue;
    const datos = fila.archivo ? leeArchivo(fila.archivo) : null;
    if (!datos) { motivos[clasificaArchivo(fila)] += 1; continue; }
    const codigo = codigoDeArchivo(datos);
    const [local, visitante] = Array.isArray(datos.equipos) ? datos.equipos : [null, null];
    if (!codigo || !local || !visitante) { motivos.ilegible += 1; continue; }
    recuperados.set(codigo, {
      codigo,
      jornada: datos.detalles?.jornada ? Number(datos.detalles.jornada) : null,
      local, visitante,
      fecha: datos.detalles?.fecha ?? null,
      hora: datos.detalles?.hora ?? null,
      golesLocal: Array.isArray(datos.marcador) ? datos.marcador[0] : null,
      golesVisitante: Array.isArray(datos.marcador) ? datos.marcador[1] : null,
    });
  }
  const sinArchivo = motivos.sinRuta + motivos.enServidor + motivos.perdidoAqui + motivos.ilegible;

  const jornadas = new Set([...recuperados.values()].map((r) => r.jornada).filter((j) => j !== null));
  const parejas = new Set([...recuperados.values()].map((r) => [r.local, r.visitante].sort().join('|')));
  informe.push({
    grupo,
    federacion: objetivo.federacion ?? 'cataluna',
    enElParte: objetivo.partidos,
    cola: { filas: Number(calendario.filas), jornadas: Number(calendario.jornadas), parejas: Number(calendario.parejas), codigos: Number(calendario.codigos) },
    archivos: { actas: filas.length, hechas: filas.filter((f) => f.estado === 'hecha').length, sinArchivo, motivos },
    recuperable: { actas: recuperados.size, jornadas: jornadas.size, parejas: parejas.size },
    equiposConocidos: [...recuperados.values()].filter((r) => equiposDeLaCola.has(r.local) && equiposDeLaCola.has(r.visitante)).length,
    ejemplo: [...recuperados.values()][0] ?? null,
  });
}
db.close();

const total = (campo, sub) => informe.reduce((n, g) => n + (sub ? g[campo][sub] : g[campo]), 0);
const resumen = {
  grupos: informe.length,
  partidosInventadosEnLaCola: total('cola', 'filas'),
  parejasInventadasEnLaCola: total('cola', 'parejas'),
  actasArchivadas: total('archivos', 'hechas'),
  partidosRecuperables: total('recuperable', 'actas'),
  jornadasRecuperables: informe.reduce((n, g) => n + g.recuperable.jornadas, 0),
  parejasRecuperables: informe.reduce((n, g) => n + g.recuperable.parejas, 0),
  // Por qué no se puede leer el resto: cada motivo pide una cosa distinta.
  motivosDeArchivo: ['sinRuta', 'enServidor', 'perdidoAqui', 'ilegible'].reduce((acc, m) => {
    acc[m] = informe.reduce((n, g) => n + (g.archivos.motivos[m] ?? 0), 0);
    return acc;
  }, {}),
};
writeFileSync(SALIDA, `${JSON.stringify({ cuando: new Date().toISOString(), resumen, grupos: informe }, null, 2)}\n`);

if (soloJson) {
  console.log(JSON.stringify({ resumen, grupos: informe }, null, 2));
} else {
  console.log(`medición de la reparación de Cataluña sobre ${resumen.grupos} grupos`);
  console.log('');
  console.log(`  ahora en la cola, inventado   ${String(resumen.partidosInventadosEnLaCola).padStart(7)} partidos · `
    + `${String(resumen.parejasInventadasEnLaCola).padStart(6)} parejas distintas`);
  console.log(`  actas archivadas y analizadas ${String(resumen.actasArchivadas).padStart(7)}`);
  console.log(`  partidos QUE SE PUEDEN RECUPERAR ${String(resumen.partidosRecuperables).padStart(5)} actas con pareja, jornada y marcador`);
  console.log(`  parejas distintas recuperadas     ${String(resumen.parejasRecuperables).padStart(5)} (frente a `
    + `${resumen.parejasInventadasEnLaCola} inventadas)`);
  console.log('');
  console.log(`  y el resto de actas analizadas (${resumen.actasArchivadas - resumen.partidosRecuperables}) NO se puede leer:`);
  for (const [motivo, n] of Object.entries(resumen.motivosDeArchivo).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(6)} · ${MOTIVOS[motivo]}`);
  }
  console.log('');
  console.log('  los grupos que más recuperan:');
  for (const g of [...informe].sort((a, b) => b.recuperable.actas - a.recuperable.actas).slice(0, 10)) {
    console.log(`    g${String(g.grupo).padEnd(10)} cola ${String(g.cola.filas).padStart(4)} partidos (${g.cola.parejas} parejas) `
      + `→ recuperables ${String(g.recuperable.actas).padStart(4)} partidos en ${String(g.recuperable.jornadas).padStart(2)} jornadas `
      + `(${String(g.recuperable.parejas).padStart(3)} parejas)`);
  }
  const vacios = informe.filter((g) => g.recuperable.actas === 0);
  if (vacios.length) console.log(`\n  ${vacios.length} grupos sin nada recuperable (sin archivos de acta): `
    + `${vacios.slice(0, 6).map((g) => 'g' + g.grupo).join(', ')}${vacios.length > 6 ? '…' : ''}`);
  const ejemplo = informe.find((g) => g.ejemplo);
  if (ejemplo) {
    console.log(`\n  ejemplo, g${ejemplo.grupo}: acta ${ejemplo.ejemplo.codigo} · J${ejemplo.ejemplo.jornada} · `
      + `${ejemplo.ejemplo.local} vs ${ejemplo.ejemplo.visitante} · ${ejemplo.ejemplo.golesLocal}-${ejemplo.ejemplo.golesVisitante} · ${ejemplo.ejemplo.fecha}`);
  }
  console.log(`\n  el detalle en pruebas/reconstruccion/reparacion-cataluna.json`);
}
