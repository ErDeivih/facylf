#!/usr/bin/env node
/*
 * Guarda el escudo de la federación a partir del logo de su propio portal.
 *
 *   node scripts/escudos-federacion.mjs --solo castilla-leon --seco
 *   node scripts/escudos-federacion.mjs --solo castilla-leon
 *   node scripts/escudos-federacion.mjs --espera-ms 2500
 *   node scripts/escudos-federacion.mjs --desde-archivo --solo castilla-leon
 *
 * Qué hace, por federación y EN SERIE:
 *   1. pide el portal (`core.federation.portal_url`) identificándose como `FacylfBot/1.0`;
 *   2. busca en el HTML el logo/escudo oficial (`<img>` con logo/escudo, iconos del sitio);
 *   3. descarga como mucho tres candidatos (≤ 512 KB) y se queda con el primero cuya FIRMA sea una
 *      imagen admitida (jpeg/png/webp/svg) — el `Content-Type` de la web no basta;
 *   4. lo guarda en `core.federation_asset` con `fuente_url` y `fuente_descripcion`, marcando el
 *      anterior como no vigente y sin duplicar la misma huella.
 *
 * Reglas que respeta:
 *   · una petición al portal por federación y en serie, con pausa de ≥ 2 s entre peticiones;
 *   · si una web no responde, bloquea o no publica logo, se informa y se sigue: ni se inventa una URL
 *     ni se reintenta en bucle;
 *   · lo que se guarda es el binario, para que la web no dependa del portal ni le pida una imagen por
 *     visita.
 *
 * Opciones:
 *   --solo <codigo>    sólo esa federación (por su `core.federation.codigo`)
 *   --seco             enseña los candidatos y no descarga ni guarda nada
 *   --espera-ms <n>    pausa entre peticiones (por defecto 2000; nunca por debajo de 2000)
 *   --desde-archivo    en vez de pedir el portal, usa el HTML que el recolector YA archivó de esa
 *                      federación. Es para los portales PNFG que exigen cookie de sesión y devuelven
 *                      «No se ha aceptado el cookie» a un cliente sin navegador: no se esquiva nada,
 *                      se aprovecha una página que ya se descargó. En este modo no hay petición al
 *                      portal; sólo se pide la imagen del logo.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  BOT_UA, TAMANO_MAXIMO, TAMANO_MINIMO, detectaMimeImagen, esDelSitioDelPortal, esFederacionObjetivo,
  extraeCandidatosLogo, extraeLogoDeCabecera,
} from './lib/escudos-federacion.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* el mensaje claro se da debajo */ }
}

const argumentos = process.argv.slice(2);
const arg = (nombre, porDefecto = null) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : porDefecto;
};
const solo = arg('solo');
const seco = argumentos.includes('--seco');
const desdeArchivo = argumentos.includes('--desde-archivo');
const esperaMs = Math.max(2000, Number(arg('espera-ms', 2000)) || 2000);
/** Como mucho se piden tres imágenes por portal: no es un rastreo, es elegir un logo. */
const MAX_CANDIDATOS = 3;
const TIEMPO_MAXIMO_MS = 20_000;

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));
/** La primera petición sale sin espera; a partir de ahí, siempre la pausa. */
let peticiones = 0;
async function pausa() {
  if (peticiones > 0) await dormir(esperaMs);
}

function describe(error) {
  const codigo = error?.name === 'TimeoutError' ? 'tiempo agotado' : (error?.cause?.code ?? error?.code ?? '');
  return `${error?.message ?? String(error)}${codigo ? ` (${codigo})` : ''}`;
}

/**
 * Carpeta de descargas de la federación. Cada federación tiene la SUYA (`descargas-<codigo>`; la de
 * Castilla y León se llama `descargas-federacion`). No hay carpeta común de respaldo a propósito: el
 * primer intento de este recolector buscó en el archivo de CyL para las demás y guardó el logo de CyL
 * en diecinueve federaciones. Una carpeta mal elegida es peor que no tener escudo.
 */
function carpetasDeDescargas(codigo) {
  const nombres = codigo === 'castilla-leon' ? ['descargas-federacion'] : [`descargas-${codigo}`];
  return nombres.map((n) => join(RAIZ, n)).filter((p) => existsSync(p));
}

/** Primer fichero HTML dentro de una carpeta, sin recorrerla entera (límite de tiempo). */
function primerHtmlEn(carpeta, limite) {
  let entradas;
  try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { return null; }
  for (const entrada of entradas) {
    if (entrada.isFile() && /\.html(?:\.gz)?$/i.test(entrada.name)) return join(carpeta, entrada.name);
    if (Date.now() > limite) return null;
  }
  return null;
}

/** Número de temporada de una carpeta `t<numero>` o `t<numero>-<año>`; 0 si no encaja. */
function numeroDeTemporada(nombre) {
  return Number(/^t(\d+)/.exec(nombre)?.[1] ?? 0);
}

/**
 * Primer HTML archivado de la federación, buscando en las rutas donde el recolector local lo deja:
 * ficheros sueltos en la raíz, en la carpeta de una temporada, o en temporada, competición y grupo.
 * Está acotado (cuatro temporadas, cuarenta competiciones, ocho segundos) porque es una búsqueda local
 * dentro de una tarea de red, no un rastreo del disco.
 */
function primerHtmlArchivado(codigo) {
  const limite = Date.now() + 8000;
  for (const carpeta of carpetasDeDescargas(codigo)) {
    const suelto = primerHtmlEn(carpeta, limite);
    if (suelto !== null) return suelto;
    const rec = join(carpeta, 'recolector-local');
    let temporadas;
    try {
      temporadas = readdirSync(rec, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !/perfil-chrome|rechazadas|node_modules/i.test(e.name))
        .map((e) => e.name)
        // De la temporada más reciente a la más vieja: `t9` no puede ir antes que `t22` por orden
        // alfabético, que es lo que pasaba y dejaba a las federaciones «sin HTML archivado».
        .sort((a, b) => numeroDeTemporada(b) - numeroDeTemporada(a) || b.localeCompare(a))
        .slice(0, 4);
    } catch { continue; }
    for (const temporada of temporadas) {
      const dirTemporada = join(rec, temporada);
      const sueltoTemporada = primerHtmlEn(dirTemporada, limite);
      if (sueltoTemporada !== null) return sueltoTemporada;
      let competiciones;
      try {
        competiciones = readdirSync(dirTemporada, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^comp-/.test(e.name))
          .map((e) => e.name).slice(0, 40);
      } catch { continue; }
      for (const competicion of competiciones) {
        const dirCompeticion = join(dirTemporada, competicion);
        const sueltoComp = primerHtmlEn(dirCompeticion, limite);
        if (sueltoComp !== null) return sueltoComp;
        let grupos;
        try {
          grupos = readdirSync(dirCompeticion, { withFileTypes: true })
            .filter((e) => e.isDirectory() && /^grupo-/.test(e.name)).map((e) => e.name);
        } catch { continue; }
        for (const grupo of grupos) {
          for (const dentroDe of ['jornadas', 'actas-menores', 'actas-adultos', '']) {
            const dirGrupo = dentroDe === '' ? join(dirCompeticion, grupo) : join(dirCompeticion, grupo, dentroDe);
            const html = primerHtmlEn(dirGrupo, limite);
            if (html !== null) return html;
            if (Date.now() > limite) return null;
          }
        }
        if (Date.now() > limite) return null;
      }
    }
  }
  return null;
}

const urlDb = process.env.DATABASE_URL_PUBLICADOR || process.env.DATABASE_URL_LECTOR;
if (!urlDb) throw new Error('Falta DATABASE_URL_PUBLICADOR (o DATABASE_URL_LECTOR) en .env.');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const db = new Client({ connectionString: urlDb, application_name: 'facylf-escudos-federacion' });
await db.connect();

/** Descarga un candidato y comprueba firma y tamaño. Devuelve el elegido o el motivo del descarte. */
async function descargaImagen(candidato) {
  await pausa();
  peticiones += 1;
  try {
    const imagen = await fetch(candidato.url, {
      headers: { 'user-agent': BOT_UA, accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (!imagen.ok) return { error: `HTTP ${imagen.status}` };
    const declarado = Number(imagen.headers.get('content-length') ?? 0);
    if (declarado > TAMANO_MAXIMO) return { error: `${declarado} bytes, por encima del tope` };
    const contenido = Buffer.from(await imagen.arrayBuffer());
    if (contenido.length < TAMANO_MINIMO || contenido.length > TAMANO_MAXIMO) {
      return { error: `${contenido.length} bytes, fuera de rango` };
    }
    const mime = detectaMimeImagen(contenido);
    if (mime === null) return { error: 'la firma no es una imagen admitida' };
    return { contenido, mime, url: imagen.url || candidato.url };
  } catch (error) {
    return { error: describe(error) };
  }
}

/** Guarda el escudo como vigente y retira el anterior. */
async function guardaEscudo(federacion, elegido, descripcionFuente) {
  const sha256 = createHash('sha256').update(elegido.contenido).digest('hex');
  await db.query('begin');
  try {
    await db.query(
      `update core.federation_asset set vigente=false
        where federation_id=$1 and tipo='escudo' and vigente and sha256<>$2`,
      [federacion.id, sha256]);
    const guardado = await db.query(
      `insert into core.federation_asset
         (federation_id, tipo, mime_type, sha256, contenido, fuente_url, fuente_descripcion, vigente)
       values ($1, 'escudo', $2, $3, $4, $5, $6, true)
       on conflict (federation_id, tipo, sha256) do update set
         mime_type = excluded.mime_type, contenido = excluded.contenido,
         fuente_url = excluded.fuente_url, fuente_descripcion = excluded.fuente_descripcion,
         observado_en = now(), vigente = true
       returning id`,
      [federacion.id, elegido.mime, sha256, elegido.contenido, elegido.url, descripcionFuente]);
    await db.query('commit');
    return { id: guardado.rows[0].id, sha256 };
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    throw error;
  }
}

const resultados = [];
try {
  const federaciones = await db.query(
    'select id, codigo, nombre, portal_url from core.federation where activa order by codigo');
  const objetivo = federaciones.rows.filter(esFederacionObjetivo).filter((f) => !solo || f.codigo === solo);
  if (solo && objetivo.length === 0) {
    const disponibles = federaciones.rows.filter(esFederacionObjetivo).map((f) => f.codigo).join(', ');
    console.error(`No hay federación activa con código «${solo}». Disponibles: ${disponibles}`);
    process.exit(2);
  }
  console.log(`${seco ? 'EN SECO · ' : ''}${objetivo.length} federación(es) · pausa ${esperaMs} ms${
    desdeArchivo ? ' · desde HTML archivado' : ''}`);

  for (const federacion of objetivo) {
    const resultado = { federacion: federacion.codigo, portal: federacion.portal_url };
    try {
      let candidatos = [];
      let descripcionFuente = 'logo del portal de la federación';
      let base = new URL(federacion.portal_url).origin + '/';

      if (desdeArchivo) {
        const archivo = primerHtmlArchivado(federacion.codigo);
        if (archivo === null) {
          resultado.estado = 'sin-archivo';
          resultado.detalle = 'no hay HTML archivado de esta federación';
          resultados.push(resultado);
          console.warn(`  ! ${federacion.codigo}: sin HTML archivado — se sigue`);
          continue;
        }
        const bytes = readFileSync(archivo);
        const html = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('latin1');
        const encontrados = extraeLogoDeCabecera(html, base);
        // La página viene de un fichero del disco: si su logo no es del sitio del portal —ni el HTML
        // nombra el dominio del portal— no se puede asegurar que sea de esta federación y no se guarda.
        candidatos = encontrados
          .filter((c) => esDelSitioDelPortal(c.url, federacion.portal_url, html))
          .slice(0, MAX_CANDIDATOS * 2);
        if (candidatos.length === 0 && encontrados.length > 0) {
          resultado.detalle = `el logo del archivo no es del dominio del portal (${encontrados[0].url})`;
        }
        resultado.origen = 'html-archivado';
        resultado.archivo = relative(RAIZ, archivo);
        descripcionFuente = 'logo del portal de la federación (cabecera del HTML archivado por el recolector)';
      } else {
        await pausa();
        peticiones += 1;
        const respuesta = await fetch(federacion.portal_url, {
          headers: {
            'user-agent': BOT_UA,
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'accept-language': 'es-ES,es;q=0.9',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        });
        resultado.http = respuesta.status;
        if (!respuesta.ok) {
          resultado.estado = respuesta.status === 403 || respuesta.status === 429 ? 'bloqueada' : 'sin-respuesta';
          resultado.detalle = `HTTP ${respuesta.status}`;
          resultados.push(resultado);
          console.warn(`  ! ${federacion.codigo}: HTTP ${respuesta.status} — se sigue`);
          continue;
        }
        const tipo = (respuesta.headers.get('content-type') ?? '').toLowerCase();
        if (!/text\/html|application\/xhtml\+xml/.test(tipo)) {
          resultado.estado = 'sin-html';
          resultado.detalle = `Content-Type ${tipo || 'desconocido'}`;
          resultados.push(resultado);
          console.warn(`  ! ${federacion.codigo}: el portal no devuelve HTML (${tipo || 'sin tipo'}) — se sigue`);
          continue;
        }
        const html = await respuesta.text();
        base = respuesta.url || federacion.portal_url;
        candidatos = extraeCandidatosLogo(html, base).slice(0, MAX_CANDIDATOS * 2);
        resultado.origen = 'portal';
        // Un portal que devuelve una página de sesión («No se ha aceptado el cookie») no publica logo:
        // se dice tal cual para que se pueda usar `--desde-archivo` en vez de reintentar.
        if (candidatos.length === 0 && /no se ha aceptado el cookie/i.test(html)) {
          resultado.detalle = 'el portal exige cookie de sesión';
        }
      }

      resultado.candidatos = candidatos.map((c) => c.url);
      if (seco) {
        resultado.estado = candidatos.length > 0 ? 'candidatos' : 'sin-logo';
        resultados.push(resultado);
        console.log(`  · ${federacion.codigo}: ${candidatos.length} candidato(s)${resultado.detalle ? ` — ${resultado.detalle}` : ''}`);
        for (const candidato of candidatos) console.log(`      - ${candidato.url} (${candidato.motivo})`);
        continue;
      }

      let elegido = null;
      for (const candidato of candidatos.slice(0, MAX_CANDIDATOS)) {
        const descarga = await descargaImagen(candidato);
        if (descarga.error) {
          resultado.detalle = `${candidato.url}: ${descarga.error}`;
          continue;
        }
        elegido = descarga;
        break;
      }

      if (elegido === null) {
        resultado.estado = 'sin-logo';
        resultados.push(resultado);
        console.warn(`  ! ${federacion.codigo}: sin logo descargable (${resultado.detalle ?? 'ningún candidato'})`);
        continue;
      }

      const guardado = await guardaEscudo(federacion, elegido, descripcionFuente);
      resultado.estado = 'guardado';
      resultado.mime = elegido.mime;
      resultado.bytes = elegido.contenido.length;
      resultado.sha256 = guardado.sha256;
      resultado.asset_id = guardado.id;
      resultado.fuente_url = elegido.url;
      resultado.fuente_descripcion = descripcionFuente;
      delete resultado.candidatos;
      resultados.push(resultado);
      console.log(`  ✓ ${federacion.codigo}: ${elegido.mime}, ${elegido.contenido.length} bytes`);
    } catch (error) {
      resultado.estado = 'error';
      resultado.detalle = describe(error);
      resultados.push(resultado);
      console.warn(`  ! ${federacion.codigo}: ${resultado.detalle} — se sigue`);
    }
  }
} finally {
  await db.end();
}

const cuenta = (estado) => resultados.filter((r) => r.estado === estado).length;
console.log(`\nGuardados: ${cuenta('guardado')} · sin logo: ${cuenta('sin-logo')} · bloqueadas/sin respuesta: ${
  cuenta('bloqueada') + cuenta('sin-respuesta')} · sin archivo: ${cuenta('sin-archivo')} · otros: ${
  cuenta('sin-html') + cuenta('error')} · peticiones: ${peticiones}`);
console.log(JSON.stringify(resultados, null, 2));
