#!/usr/bin/env tsx
/**
 * Descubrimiento del catálogo de competiciones.
 *
 *   pnpm descubrir-competiciones --auto --provincias --desde 2022 --hasta 2026
 *       Rastrea competiciones → grupos de todas las provincias y varias temporadas, con el
 *       cliente identificado y su cadencia. Construye `catalogo.json` (puede chocar con la
 *       cookie del sitio; si ocurre, usa --urls o pide permiso).
 *
 *   pnpm descubrir-competiciones --urls ruta/urls.txt --categoria juvenil
 *       Lee una lista de URLs de jornada (una por línea, las que salen en la barra del
 *       navegador al abrir cada competición) y extrae CodCompeticion/CodGrupo/CodTemporada.
 *
 * En todos los casos no se inventa nada: se lee lo que hay escrito en el HTML o en la URL.
 * El resultado va a `descargas-federacion/catalogo.json` (o a `--salida ruta`).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodifica } from '../src/texto.js';
import { ClienteFederacion } from '../src/cliente.js';
import { COD_PRIMARIA } from '../src/urls.js';
import {
  opcionesDeCatalogo, competicionesDeUrls, parseaCompeticiones, competicionesDeSelect, parseaGrupos,
  codTemporadaDe, DELEGACIONES, nombreDeDelegacion, estructuraDe,
  type Categoria, type Competicion,
} from '../src/catalogo.js';
import { extraeReferencias } from '../src/enlaces.js';

const RAIZ = resolve(import.meta.dirname, '../../..');

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const args = new Set(process.argv.slice(2));

const salida = resolve(RAIZ, argumento('salida') ?? 'descargas-federacion/catalogo.json');

function guarda(datos: unknown): void {
  mkdirSync(dirnameSafe(salida), { recursive: true });
  writeFileSync(salida, JSON.stringify(datos, null, 2));
  console.log(`Guardado en ${salida}`);
}

function dirnameSafe(ruta: string): string {
  const i = Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\'));
  return i > 0 ? ruta.slice(0, i) : '.';
}

// --- modo: extraer el patrón de enlaces de una página (trazabilidad) -------------
const rutaEnlaces = argumento('enlaces');
if (rutaEnlaces) {
  const candidata = resolve(RAIZ, rutaEnlaces);
  const ruta = existsSync(candidata) ? candidata : resolve(rutaEnlaces);
  if (!existsSync(ruta)) {
    console.error(`No existe ${ruta}. Guarda una página de la federación con Ctrl+S (Solo HTML).`);
    process.exit(1);
  }
  const referencias = extraeReferencias(decodifica(readFileSync(ruta)));
  guarda(referencias);
  console.log(`${referencias.length} referencias extraídas de ${ruta}.`);
  console.log('Trazabilidad: competición → grupo → jornada → partido/acta → jugador → equipo.');
  process.exit(0);
}

// --- modo: rastreo automático (competiciones → grupos), por delegaciones y temporadas
if (args.has('--auto')) {
  const categoria = (argumento('categoria') ?? 'aficionados') as Categoria;
  const base = 'https://www.rfcylf.es/pnfg/NPcd';
  // Espaciado MUY generoso (el sitio bloquea la IP por ráfaga). Ajustable con --pausa.
  const pausa = Number(argumento('pausa')) || 6000;
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cliente = new ClienteFederacion({ urlBot: process.env.BOT_URL, contacto: process.env.BOT_CONTACTO, porMinuto: 8 });

  // provincias: todas si --provincias, o la de --delegacion
  const delegaciones = args.has('--provincias')
    ? Object.keys(DELEGACIONES)
    : (argumento('delegacion') ? [argumento('delegacion')!] : Object.keys(DELEGACIONES));
  // temporadas: rango --desde/--hasta (años), o una --temporada (código), o la actual
  const desde = argumento('desde');
  const hasta = argumento('hasta');
  const temporadaUnica = argumento('temporada');
  const temporadas: string[] = (desde && hasta)
    ? Array.from({ length: Number(hasta) - Number(desde) + 1 }, (_, i) => codTemporadaDe(Number(desde) + i))
    : (temporadaUnica ? [temporadaUnica] : [codTemporadaDe(new Date().getFullYear())]);

  const pideHtml = async (url: string): Promise<string> => {
    const r = await cliente.pide(url);
    if (r.sinCambios || !r.cuerpo) return '';
    return decodifica(Buffer.from(r.cuerpo));
  };

  await (async () => {
    // inicializar sesión: sin la cookie, el sitio devuelve "no se ha aceptado el cookie"
    await cliente.pide('https://www.rfcylf.es/');

    // Progreso: para no repetir competiciones ya resueltas ni pedir lo ya bajado.
    const progRuta = join(resolve(RAIZ, 'descargas-federacion'), '.catalogo-progreso.json');
    let progreso: Record<string, boolean> = {};
    try {
      progreso = JSON.parse(readFileSync(progRuta, 'utf8')) as Record<string, boolean>;
    } catch {
      progreso = {};
    }
    let existentes: Competicion[] = [];
    try {
      existentes = JSON.parse(readFileSync(salida, 'utf8')) as Competicion[];
    } catch {
      existentes = [];
    }

    const result: Competicion[] = [];
    let gruposTotal = 0;
    let frenado = false; // el sitio ha frenado (0 bytes): paramos y reanudamos luego
    for (const deleg of delegaciones) {
      for (const temporada of temporadas) {
        const delegNombre = nombreDeDelegacion(deleg);
        // El endpoint que SÍ filtra por temporada es NFG_CmpJornada_Exec (no LstCompeticiones).
        const listaUrl = `${base}/NFG_CmpJornada_Exec?cod_primaria=1000120&codtemporada=${temporada}&cod_agrupacion=&Sch_Codigo_Delegacion=${deleg}&Sch_Tipo_Juego=`;
        console.log(`\n${delegNombre} · temporada ${temporada}: listando competiciones…`);
        const html = await pideHtml(listaUrl);
        await dormir(pausa);
        const competiciones = competicionesDeSelect(html);
        if (competiciones.length === 0) {
          // 0 bytes = el sitio nos está frenando/bloqueado. Paramos y reanudamos luego.
          if (html.length === 0) {
            console.log(`  ⛔ El sitio ha frenado (0 bytes) al listar ${delegNombre}/${temporada}. Paro; relanza en un rato.`);
            frenado = true;
            break;
          }
          console.log(`  (sin competiciones) — ${html.length} bytes. Prólogo: ${html.slice(0, 160).replace(/\s+/g, ' ')}`);
          continue;
        }
        for (const c of competiciones) {
          if (frenado) break;
          if (progreso[c.codCompeticion]) {
            continue;
          }
          const htmlGrupos = await pideHtml(
            `${base}/NFG_POR_Lst_Competiciones_Grupos?codcompeticion=${c.codCompeticion}&N_Ajax=1`,
          );
          await dormir(pausa);
          // 0 bytes = el sitio nos está frenando. Paramos aquí; reanudamos en la próxima.
          if (htmlGrupos.length === 0) {
            console.log(`  ⛔ El sitio ha frenado (0 bytes) en ${c.codCompeticion}. Paro; la próxima pasada sigue.`);
            frenado = true;
            break;
          }
          const grupos = parseaGrupos(htmlGrupos, c.codCompeticion);
          if (grupos.length === 0) {
            console.log(`    · ${c.codCompeticion}: sin grupos — ${htmlGrupos.length} bytes. Prólogo: ${htmlGrupos.slice(0, 140).replace(/\s+/g, ' ')}`);
            continue;
          }
          for (const g of grupos) {
            const amb = estructuraDe(c.nombre).ambito;
            const esProvincial = amb === 'provincial' || amb === 'fase-ascenso';
            result.push({
              codCompeticion: g.codCompeticion,
              codGrupo: g.codGrupo,
              codTemporada: temporada,
              codDelegacion: esProvincial ? deleg : '', // regional/nacional = nivel CCyL (sin provincia)
              nombre: c.nombre,
              grupo: g.nombre,                           // p. ej. "Primera - Salamanca"
              ambito: amb,
              categoria,
              genero: 'm',
              slug: `comp-${g.codCompeticion}-gr-${g.codGrupo}-t${temporada}`,
              activa: true,
            });
            gruposTotal++;
          }
          console.log(`  · ${c.nombre}: ${grupos.length} grupos`);
          progreso[c.codCompeticion] = true; // marca esta competición como resuelta
        }
        if (frenado) break; // frena la temporada en curso
      }
      if (frenado) break;   // frena el resto de provincias
    }
    // guarda el catálogo completo (lo ya existente + lo nuevo), sin duplicar por slug
    const vistos = new Set(existentes.map((e) => e.slug));
    const merge = [...existentes];
    for (const r of result) {
      if (vistos.has(r.slug)) continue;
      vistos.add(r.slug);
      merge.push(r);
    }
    guarda(merge);
    writeFileSync(progRuta, JSON.stringify(progreso, null, 2));
    console.log(`\n${merge.length} entradas en el catálogo (${gruposTotal} nuevas).`);
    console.log('Progreso guardado: las competiciones ya resueltas no se vuelven a pedir.');
    console.log('Ahora ejecuta: pnpm ingesta:todas   (baja calendario + clasificación de cada uno)');
    process.exit(0);
  })().catch((e) => {
    console.error(`ERROR: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}

// --- modo: lista de URLs de jornada -------------------------------------------
const rutaUrls = argumento('urls');
if (rutaUrls) {
  // acepta la ruta desde la raíz del proyecto o desde donde estés (cwd)
  const candidata = resolve(RAIZ, rutaUrls);
  const ruta = existsSync(candidata) ? candidata : resolve(rutaUrls);
  if (!existsSync(ruta)) {
    console.error(`No existe ${ruta}. Crea un fichero de texto con una URL de jornada por línea.`);
    process.exit(1);
  }
  const urls = readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /^https?:\/\//.test(l));
  const categoria = (argumento('categoria') ?? 'aficionados') as Categoria;
  const competiciones = competicionesDeUrls(urls, categoria);
  guarda(competiciones);
  console.log(`${competiciones.length} competiciones extraídas desde las URLs.`);
  process.exit(0);
}

// --- modo: HTML de la página que lista las competiciones -----------------------
const rutaHtml = argumento('html');
const delegacion = argumento('delegacion');

if (!rutaHtml) {
  console.error(
    'Uso:\n' +
    '  pnpm descubrir-competiciones --urls ruta/urls.txt [--categoria juvenil]\n' +
    '  pnpm descubrir-competiciones --html ruta/pagina.html --delegacion 1',
  );
  process.exit(1);
}

const ruta = resolve(RAIZ, rutaHtml);
if (!existsSync(ruta)) {
  console.error(`No existe ${ruta}`);
  process.exit(1);
}
const opciones = opcionesDeCatalogo(decodifica(readFileSync(ruta)));
if (opciones.length === 0) {
  console.error('No se encontraron <option> en ese HTML. ¿Es la página que lista las competiciones?');
  process.exit(1);
}
guarda({ delegacion: delegacion ?? null, opciones });
console.log(`${opciones.length} opciones leídas de ${rutaHtml}. Primeras:`);
for (const o of opciones.slice(0, 25)) console.log(`  ${o.texto}  |  ${o.valor}`);
console.log('\nConfirma en la URL de la jornada (F12 → Red) qué parte del valor es\n' +
  'CodCompeticion y cuál CodGrupo, y rellena descargas-federacion/catalogo.json.');
