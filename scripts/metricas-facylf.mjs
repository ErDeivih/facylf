#!/usr/bin/env node
/**
 * metricas-facylf.mjs — publica `metricas-facylf.json` para el panel de proyectos.
 *
 * El panel NO calcula: lee este fichero y lo pinta. Por eso aquí se mide todo y se deja escrito con la
 * forma exacta acordada con David (ver `docs/plataforma-web/METRICAS-PANEL.md`):
 *
 *   { "cyl": { "competiciones_total": n, "completas": n, "porcentaje": n },
 *     "temporadas": [ { "temporada": "2025-26", "hecho": n, "total": n } ],
 *     "ritmo": { "pc_por_min": n, "servidor_por_min": n, "medido": "AAAA-MM-DDTHH:MM" } }
 *
 * Fuentes, todas de SÓLO LECTURA:
 *   · cola de CyL del PC         — `descargas-federacion/recolector-local/cola-v2.sqlite`
 *   · cola de CyL del servidor   — por SSH, ejecutando un sondeo EN MEMORIA (nada instalado allí)
 *   · canónico PostgreSQL        — rol de lectura (`DATABASE_URL_LECTOR`), cobertura por grupo
 *   · ritmo                      — peticiones de los últimos 5 minutos en cada máquina (todas las
 *                                  federaciones), expresadas por minuto y con la ventana cerrada hace
 *                                  un minuto (las filas se insertan al terminar la petición); no es
 *                                  una media histórica
 *
 * Si una fuente falla, **no se escribe un cero**: se deja el `metricas-facylf.json` anterior tal cual y
 * se sale con error, para que el panel enseñe la última medición con su fecha en vez de una cifra falsa.
 *
 * Uso:
 *   node scripts/metricas-facylf.mjs                · escribe el JSON y cuenta en una frase
 *   node scripts/metricas-facylf.mjs --json         · imprime el JSON por stdout
 *   node scripts/metricas-facylf.mjs --salida ruta  · escribe en otra ruta (pruebas)
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { rutasDeColasLocales } from './lib/colas-locales.mjs';
import {
  TAMANO_VENTANA_MINUTOS, construyeMetricas, formatoMedido, fraseResumen, parseaSondeoServidor, porMinuto,
} from './lib/metricas-facylf.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLA_CYL = join(RAIZ, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite');
const SALIDA = join(RAIZ, 'metricas-facylf.json');
const SONDEO = join(RAIZ, 'scripts', 'lib', 'metricas-servidor-remoto.mjs');
const ALIAS_SERVIDOR = process.env.FACYLF_SERVIDOR_SSH ?? 'servidor';

const argumentos = process.argv.slice(2);
const soloJson = argumentos.includes('--json');
const indiceSalida = argumentos.indexOf('--salida');
if (argumentos.includes('--ayuda') || argumentos.includes('-h')) {
  console.log('uso: node scripts/metricas-facylf.mjs [--json] [--salida <ruta>]');
  process.exit(0);
}
const destino = indiceSalida >= 0 ? resolve(argumentos[indiceSalida + 1]) : SALIDA;

const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no se puede preguntar al canónico */ }
}

const fallo = (mensaje) => {
  console.error(`metricas-facylf: ${mensaje}`);
  console.error('No se publica nada: se conserva la última medición buena (si existía) con su fecha.');
  process.exit(1);
};

/** Catálogo de competiciones que conoce la cola de CyL. */
function leeCatalogoDeLaCola(ruta) {
  if (!existsSync(ruta)) throw new Error(`no encuentro la cola de CyL: ${ruta}`);
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
  try {
    return {
      temporadas: db.prepare('select codigo, etiqueta from temporadas').all(),
      competiciones: db.prepare('select temporada, codigo from competiciones').all(),
    };
  } finally {
    db.close();
  }
}

/**
 * Peticiones hechas en el PC dentro de la ventana.
 *
 * Se localizan las colas con `rutasDeColasLocales`, que **sigue las junctions** de `descargas-*` (con
 * `Dirent.isDirectory()` se descartaban todas y el ritmo salía 0). No se salta ninguna cola: una cola
 * ilegible se trata como fallo, no como 0.
 */
function cuentaPeticionesDelPc(desde, hasta) {
  let total = 0;
  const porFederacion = {};
  for (const { federacion, ruta } of rutasDeColasLocales(RAIZ)) {
    let db;
    try {
      db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
      const n = Number(db.prepare('select count(*) n from peticiones where iniciada_en >= ? and iniciada_en < ?')
        .get(desde, hasta).n ?? 0);
      total += n;
      if (n > 0) porFederacion[federacion] = n;
    } catch (error) {
      throw new Error(`no se pudo leer la cola del PC «${federacion}»: ${error.message}`);
    } finally {
      try { db?.close(); } catch { /* ya cerrada */ }
    }
  }
  return { total, porFederacion };
}

/** Sondeo del servidor: una sola ida y vuelta por SSH; el script viaja por stdin (no se instala nada). */
function sondeaElServidor(desde, hasta) {
  if (!existsSync(SONDEO)) throw new Error(`no encuentro el sondeo del servidor: ${SONDEO}`);
  const script = readFileSync(SONDEO, 'utf8');
  const comando = `docker exec -i -e DESDE=${desde} -e HASTA=${hasta} facylf-monitor node --input-type=module -`;
  const resultado = spawnSync('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', ALIAS_SERVIDOR, comando,
  ], { input: script, encoding: 'utf8', timeout: 90_000, windowsHide: true });
  if (resultado.error) throw new Error(`no se pudo ejecutar ssh hacia «${ALIAS_SERVIDOR}»: ${resultado.error.message}`);
  if (resultado.status !== 0) {
    throw new Error(`el sondeo del servidor falló (código ${resultado.status}): ${(resultado.stderr ?? '').trim().slice(-300)}`);
  }
  const datos = parseaSondeoServidor(resultado.stdout);
  if (datos.error) throw new Error(`el servidor no pudo leer sus colas: ${datos.error}`);
  if (Array.isArray(datos.errores) && datos.errores.length > 0) {
    throw new Error(`el servidor no pudo leer ${datos.errores.length} cola(s): ${datos.errores.join('; ').slice(0, 300)}`);
  }
  if (!datos.cyl || !Array.isArray(datos.cyl.competiciones)) {
    throw new Error('el servidor no devolvió el catálogo de competiciones de CyL');
  }
  return datos;
}

/** Ediciones de CyL en el canónico y si están completas (todos sus grupos con cobertura «completa»). */
async function leeEdicionesDelCanonico() {
  /*
   * Se lee con el rol PUBLICADOR, no con el de la web. El rol `facylf_lector` tiene una política RLS
   * restrictiva («web_sin_la_preferente») que le esconde las ediciones de La Preferente: son 34 en CyL
   * y forman parte de lo que hay que terminar, así que el panel, que mide la ingesta y no la oferta
   * pública de la web, tiene que verlas. Aquí sólo se hacen SELECT.
   */
  const cadena = process.env.DATABASE_URL_PUBLICADOR;
  if (!cadena) throw new Error('falta DATABASE_URL_PUBLICADOR en .env: sin él no se puede medir el canónico completo');
  const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
  const { Client } = requerir('pg');
  const cliente = new Client({
    connectionString: cadena,
    statement_timeout: 120_000,
    connectionTimeoutMillis: 15_000,
  });
  await cliente.connect();
  try {
    const { rows } = await cliente.query(`
      with ed as (
        select s.etiqueta as etiqueta,
               coalesce(ce.codigo_externo, 'ce:' || ce.id) as codigo,
               -- Todos los grupos tienen que tener su fila de cobertura Y estar completos: bool_and
               -- ignora NULL, así que sin la igualdad de recuentos una edición con un checkpoint
               -- ausente podría colarse como completa.
               (bool_and(cp.visibility_state = 'completa')
                and count(cp.phase_group_id) = count(pg.id)) as completa
          from core.federation f
          join core.competition_edition ce on ce.federation_id = f.id
          join core.season s on s.id = ce.season_id
          join core.phase_group pg on pg.competition_edition_id = ce.id
          left join ops.coverage_checkpoint cp on cp.phase_group_id = pg.id
         where f.codigo = 'castilla-leon'
         group by s.etiqueta, ce.codigo_externo, ce.id
      )
      select etiqueta, codigo, completa from ed
    `);
    return rows.map((f) => ({ etiqueta: String(f.etiqueta), codigo: String(f.codigo), completa: f.completa === true }));
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

async function main() {
  /*
   * La ventana termina hace UN MINUTO, no «ahora». El recolector inserta la fila de `peticiones` al
   * TERMINAR la petición; si se cuenta hasta el segundo actual, las que están en vuelo todavía no
   * están en la tabla y el ritmo sale entre un 20 y un 30 % por debajo (medido por QA el 04/11/2026).
   * Con un minuto de retardo se cuentan peticiones ya cerradas y el número deja de ser una cota
   * inferior; la marca `medido` sigue siendo la de ahora.
   */
  const medido = new Date();
  const hasta = new Date(medido.getTime() - 60_000);
  const desde = new Date(hasta.getTime() - TAMANO_VENTANA_MINUTOS * 60_000);
  const isoDesde = desde.toISOString();
  const isoHasta = hasta.toISOString();

  let catalogoPc;
  let edicionesCanonico;
  let sondeo;
  let ritmoPc;
  try {
    catalogoPc = leeCatalogoDeLaCola(COLA_CYL);
    sondeo = sondeaElServidor(isoDesde, isoHasta);
    edicionesCanonico = await leeEdicionesDelCanonico();
    ritmoPc = cuentaPeticionesDelPc(isoDesde, isoHasta);
  } catch (error) {
    fallo(error.message);
  }

  const metricas = construyeMetricas({
    catalogoPc,
    catalogoServidor: sondeo.cyl,
    edicionesCanonico,
    ritmo: {
      pcPorMin: porMinuto(ritmoPc.total),
      servidorPorMin: porMinuto(Number(sondeo.peticiones ?? 0)),
    },
    medido: formatoMedido(medido),
  });

  const contenido = `${JSON.stringify(metricas, null, 2)}\n`;
  const temporal = `${destino}.tmp`;
  try {
    writeFileSync(temporal, contenido, 'utf8');
    renameSync(temporal, destino);
  } catch (error) {
    fallo(`no se pudo escribir ${destino}: ${error.message}`);
  }

  if (soloJson) {
    console.log(contenido.trimEnd());
    return;
  }
  console.log(fraseResumen(metricas));
  console.log(`  fuentes: cola del PC (${Object.keys(ritmoPc.porFederacion).length} federaciones pidiendo), `
    + `servidor (${Object.keys(sondeo.porFederacion ?? {}).length}), canónico (${edicionesCanonico.length} ediciones de CyL).`);
  console.log(`  escrito en ${destino}`);
}

main().catch((error) => fallo(error.message));
