#!/usr/bin/env tsx
/**
 * Worker de ingesta.
 *
 *   pnpm ingesta:una                                    # parsea el fichero real (en seco)
 *   pnpm ingesta:una --cod 24218963 --grupo 24218968 --delegacion 1 --temporada 22
 *                                                       # una competición, de verdad
 *   pnpm ingesta:todas  [--catalogo ruta.json] [--cada min]   # ciclo sobre el catálogo
 *
 * La descarga usa el cliente identificado y espaciado (src/cliente.ts) y el planificador
 * (src/planificador.ts) para no hacer ráfagas. El Excel se pide con la propia página de la
 * federación + `excel=1&NPcd_File=1` (patrón confirmado con F12 → Red, ver src/urls.ts):
 * se baja el calendario y la clasificación a `descargas-federacion/`, se parsean y se
 * validan. No escribe en la base de datos: de momento deja los ficheros y el resumen.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClienteFederacion } from '../src/cliente.js';
import { urlCalendario, urlCalendarioExcel, urlClasificacionExcel, urlJornada, urlActa } from '../src/urls.js';
import { parseaCalendario } from '../src/parsers/calendario.js';
import { parseaJornada } from '../src/parsers/jornada.js';
import { parseaActa } from '../src/parsers/acta.js';
import { validaCalendario } from '../src/validacion.js';
import { reconstruyeTemporada } from '../src/reconstruccion.js';
import { decodifica } from '../src/texto.js';
import { calculaClasificacion } from '@facylf/dominio';
import type { Competicion } from '../src/catalogo.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
const carpetaDescargas = resolve(RAIZ, 'descargas-federacion');
const ficheroEstado = join(carpetaDescargas, '.estado-ingesta.json');

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const args = new Set(process.argv.slice(2));

function local(): void {
  const ruta = new URL('../../../datos-ejemplo/Calendario.xls', import.meta.url);
  const c = parseaCalendario(readFileSync(ruta));
  const problemas = validaCalendario(c.partidos);
  console.log(`equipos:   ${c.equipos.length}`);
  console.log(`jornadas:  ${c.jornadas}`);
  console.log(`partidos:  ${c.partidos.length}`);
  console.log(problemas.length
    ? `PROBLEMAS:\n${problemas.map((p) => `  · [${p.regla}] ${p.detalle}`).join('\n')}`
    : 'validación: correcta');
  console.log('(en seco: no se ha escrito nada)');
}

function competicionDeCodigos(cod: string, grupo: string, delegacion: string, temporada: string, categoria: string): Competicion {
  return {
    codCompeticion: cod,
    codGrupo: grupo,
    codTemporada: temporada,
    codDelegacion: delegacion,
    nombre: `Competición ${cod} · grupo ${grupo}`,
    categoria: categoria as Competicion['categoria'],
    genero: 'm',
    slug: `comp-${cod}-gr-${grupo}`,
    activa: true,
  };
}

/** Descarga calendario y clasificación (Excel) de una competición y valida el calendario.
 *  Devuelve cuántas descargó y si el sitio frenó (descarga vacía). */
async function descargaCompeticion(cliente: ClienteFederacion, c: Competicion, estado: Record<string, number>, ahora: Date):
  Promise<{ procesadas: number; bloqueado: boolean }> {
  try {
    // La federación exige una cookie de sesión antes de servir el Excel. Se obtiene
    // visitando antes la raíz del sitio y la página del calendario (flujo: entrar → descargar).
    await cliente.pide('https://www.rfcylf.es/');
    await cliente.pide(urlCalendario(c));
    if (!cliente.tieneCookies) {
      console.warn('  · Aviso: el sitio no ha dado una cookie de sesión. Es probable que su compuerta ' +
        'anti-bot se resuelva por JavaScript y no por cookie; en ese caso no se puede bajar el Excel ' +
        'sin navegador o permiso. Sigo intentando, pero puede devolver "no se ha aceptado el cookie".');
    }

    let bajados = 0;
    let bloqueado = false; // true si alguna descarga vino vacía → el sitio está frenando
    // pausa entre cada petición fina (jornadas/actas) para no saturar
    const pausa = Number(argumento('pausa')) || 4000;
    const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const descargas: [string, string, string][] = [
      ['calendario', urlCalendarioExcel(c), `${c.slug}-calendario.xls`],
      ['clasificacion', urlClasificacionExcel(c), `${c.slug}-clasificacion.xls`],
    ];
    for (const [tipo, url, nombre] of descargas) {
      const resp = await cliente.pide(url);
      if (resp.sinCambios) continue; // 304 de verdad: no ha cambiado
      if (!resp.cuerpo || resp.cuerpo.length === 0) { bloqueado = true; continue; } // el sitio frenó (vacío)
      writeFileSync(join(carpetaDescargas, nombre), resp.cuerpo);
      bajados++;
      console.log(`  · ${tipo}: descargado`);
    }

    const rutaCal = join(carpetaDescargas, `${c.slug}-calendario.xls`);
    if (existsSync(rutaCal)) {
      const datos = parseaCalendario(readFileSync(rutaCal));
      const problemas = validaCalendario(datos.partidos);
      const criticos = problemas.filter((p) => p.nivel === 'critico');
      const avisos = problemas.filter((p) => p.nivel === 'aviso');
      console.log(`  · calendario: ${datos.equipos.length} equipos, ${datos.jornadas} jornadas, ${datos.partidos.length} partidos` +
        (criticos.length ? ` — PROBLEMAS: ${criticos.map((p) => p.regla).join(', ')}` : ' — ok') +
        (avisos.length ? `  [aviso: ${avisos.map((p) => p.regla).join(', ')}]` : ''));

      // Con --jornadas baja y parsea los resultados de cada jornada (para reconstruir
      // la evolución jornada a jornada). Guarda el HTML para poder depurar el parser.
      const actas: string[] = [];
      if ((args.has('--jornadas') || argumento('jornada')) && datos.jornadas > 0) {
        const solo = argumento('jornada');
        const a = solo ? Number(solo) : 1;
        const b = solo ? Number(solo) : datos.jornadas;
        // --jornadas-max limita cuántas jornadas NUEVAS se bajan por ciclo (las demás se
        // completan en ciclos siguientes, porque quedan como "pendientes").
        const jornadasMax = Number(argumento('jornadas-max'));
        let total = 0;
        let descargadasJ = 0;
        for (let j = a; j <= b; j++) {
          const rutaJ = join(carpetaDescargas, `${c.slug}-jornada-${j}.html`);
          // re-descarga si el fichero no existe o quedó vacío de una pasada anterior
          if (!existsSync(rutaJ) || readFileSync(rutaJ).length === 0) {
            if (jornadasMax > 0 && descargadasJ >= jornadasMax) break; // ya bajamos las N del ciclo
            const resp = await cliente.pide(urlJornada(c, j));
            await dormir(pausa);
            if (!resp.sinCambios && resp.cuerpo && resp.cuerpo.length > 0) {
              writeFileSync(rutaJ, resp.cuerpo);
              descargadasJ++;
            }
          }
          if (existsSync(rutaJ)) {
            const res = parseaJornada(decodifica(readFileSync(rutaJ)), j);
            total += res.length;
            for (const r of res) if (r.codActa) actas.push(r.codActa);
            if (res.length === 0) console.log(`    · jornada ${j}: sin resultados con este patrón`);
          }
        }
        console.log(`  · jornadas: ${total} resultados ${solo ? '' : `(${a}–${b})`}` +
          (jornadasMax > 0 && descargadasJ >= jornadasMax ? '  (límite del ciclo; las demás en la próxima)' : ''));
      }

      // Con --actas baja cada acta (alineación/goles) y las guarda parseadas.
      // El sitio frena por ráfaga, así que se limita el número por pasada con
      // `--actas N` (por defecto 15). Reejecutando se completan las demás (los vacíos
      // se re-descargan).
      if (args.has('--actas') && actas.length > 0) {
        const limite = Number(argumento('actas'));
        const actasUnicas = [...new Set(actas)];
        const aProcesar = actasUnicas.slice(0, Number.isFinite(limite) && limite > 0 ? limite : 30);
        const guardadas: unknown[] = [];
        let parseadas = 0;
        for (const codActa of aProcesar) {
          const rutaA = join(carpetaDescargas, `${c.slug}-acta-${codActa}.html`);
          if (!existsSync(rutaA) || readFileSync(rutaA).length === 0) {
            const resp = await cliente.pide(urlActa(codActa));
            await dormir(pausa);
            if (!resp.sinCambios && resp.cuerpo && resp.cuerpo.length > 0) {
              writeFileSync(rutaA, resp.cuerpo);
            }
          }
          if (existsSync(rutaA)) {
            const html = decodifica(readFileSync(rutaA));
            if (html.includes('CmpPartido') || html.length > 500) {
              guardadas.push(parseaActa(html));
              parseadas++;
            }
          }
        }
        writeFileSync(join(carpetaDescargas, `${c.slug}-actas.json`), JSON.stringify(guardadas, null, 2));
        console.log(`  · actas: ${parseadas}/${aProcesar.length} de ${actasUnicas.length} parseadas → ${c.slug}-actas.json` +
          (aProcesar.length < actasUnicas.length ? '  (re-ejecuta para las demás.)' : ''));
      }
    }

    if (bajados === 0) {
      if (bloqueado) {
        console.log(`· ${c.slug}: ⛔ el sitio ha frenado (descarga vacía). Se marcará como pendiente y se reintenta.`);
        return { procesadas: 0, bloqueado: true };
      }
      console.log(`· ${c.slug}: los ficheros no cambiaron (304); al día.`);
      return { procesadas: 0, bloqueado: false };
    }
    estado[c.slug] = ahora.getTime();

    // Reconstrucción y clasificación en caliente: apenas se descarga, se calcula.
    try {
      const t = reconstruyeTemporada(c.slug, carpetaDescargas);
      const tabla = calculaClasificacion(t.partidos);
      const lider = tabla[0];
      console.log(`  → reconstrucción: ${t.conResultado}/${t.partidos.length} con resultado` +
        (lider ? ` · líder: ${lider.equipo} (${lider.puntos} pts)` : ''));
    } catch {
      /* si aún hay jornadas vacías, se completa con las siguientes pasadas */
    }
    return { procesadas: bajados, bloqueado };
  } catch (e) {
    console.error(`· ${c.slug}: ERROR — ${e instanceof Error ? e.message : e}`);
    return { procesadas: 0, bloqueado: true };
  }
}

function cargaCatalogo(ruta: string): Competicion[] {
  if (!existsSync(ruta)) {
    console.error(
      `No hay catálogo en ${ruta}.\n` +
      'Con `pnpm descubrir-competiciones` se rehace desde un HTML guardado. ' +
      'O descarga una competición suelta con `--cod --grupo --delegacion`.',
    );
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(ruta, 'utf8')) as Competicion[];
  if (!Array.isArray(data) || data.length === 0) {
    console.error(`El catálogo de ${ruta} está vacío.`);
    process.exit(1);
  }
  return data;
}

function leeEstado(): Record<string, number> {
  return existsSync(ficheroEstado)
    ? JSON.parse(readFileSync(ficheroEstado, 'utf8')) as Record<string, number>
    : {};
}

async function ciclo(catalogoRuta: string, cliente: ClienteFederacion): Promise<{ procesadas: number; bloqueado: boolean }> {
  const catalogo = cargaCatalogo(catalogoRuta);
  mkdirSync(carpetaDescargas, { recursive: true });
  const estado = leeEstado();
  const ahora = new Date();

  // Reanudar: se cogen las competiciones con TRABAJO REAL pendiente (sin calendario,
  // o con jornadas/actas que faltan), y las más incompletas PRIMERO. Las que ya están
  // completas se saltan (aunque haya pasado su cadencia), para no repetir.
  const fuerza = args.has('--fuerza');
  const dueñas = fuerza
    ? catalogo.map((c) => c.slug)
    : catalogo
        .filter((c) => conTrabajo(c.slug))
        .sort((a, b) => trabajoDe(b.slug) - trabajoDe(a.slug))
        .map((c) => c.slug);

  console.log(`${ahora.toISOString()} — ${dueñas.length}/${catalogo.length} competiciones ${fuerza ? '(--fuerza: todas)' : 'con trabajo pendiente'}`);
  if (dueñas.length === 0) {
    console.log('Nada que hacer; la próxima pasada vuelve a comprobar (usa --fuerza para forzar).');
    return { procesadas: 0, bloqueado: false };
  }

  // --max N limita cuántas se procesan por pasada (para no saturar y que no te bloqueen).
  const maximo = Number(argumento('max'));
  const aProcesar = Number.isFinite(maximo) && maximo > 0 ? dueñas.slice(0, maximo) : dueñas;
  // pausa entre competiciones (configurable con --pausa, por defecto 4 s) + cadencia tranquila
  const pausa = Number(argumento('pausa')) || 4000;
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let bloqueado = false;
  for (const slug of aProcesar) {
    const c = catalogo.find((x) => x.slug === slug)!;
    const r = await descargaCompeticion(cliente, c, estado, ahora);
    bloqueado = bloqueado || r.bloqueado;
    await dormir(pausa);
  }
  writeFileSync(ficheroEstado, JSON.stringify(estado, null, 2));
  console.log(`Ficheros guardados en descargas-federacion/ (${aProcesar.length}/${dueñas.length} procesadas; con --max puedes limitar).`);
  return { procesadas: aProcesar.length, bloqueado };
}

/** Worker continuo: recorre todas las competiciones, jornadas y actas con calma, sin límite
 *  de tiempo. Reanuda (no repite), espacia, y si el sitio frena espera largo. Ctrl+C para parar. */
async function continuo(catalogoRuta: string, cliente: ClienteFederacion): Promise<void> {
  console.log('⚙️  Worker continuo: bajando todos los datos con calma (cadencia + reanuda). Ctrl+C para parar.');
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const esperaNormal = Number(argumento('cada-ciclo')) || 45_000;   // 45 s entre ciclos
  const esperaBloqueo = Number(argumento('cooldown')) || 300_000;  // 5 min si el sitio frena
  let seguidosVacio = 0;

  for (;;) {
    try {
      const r = await ciclo(catalogoRuta, cliente);
      // Si el sitio frenó (descargas vacías) o no había nada, esperamos más para no insistir.
      if (r.bloqueado || r.procesadas === 0) {
        seguidosVacio++;
        const w = Math.min(esperaBloqueo * seguidosVacio, 30 * 60_000);
        console.log(`  … esperando ${Math.round(w / 1000)} s (${r.bloqueado ? 'el sitio ha frenado' : 'no hay nada que hacer'}).`);
        await dormir(w);
      } else {
        seguidosVacio = 0;
        await dormir(esperaNormal);
      }
    } catch (e) {
      seguidosVacio++;
      const w = esperaBloqueo * seguidosVacio;
      console.error(`⚠️  ${e instanceof Error ? e.message : e} — esperando ${Math.round(w / 1000)} s.`);
      await dormir(Math.min(w, 30 * 60_000));
    }
  }
}

/** Jornadas cuyo HTML no existe o quedó vacío (trabajo pendiente de una pasada anterior). */
function jornadasPendientes(slug: string): number {
  try {
    const cal = parseaCalendario(decodifica(readFileSync(join(carpetaDescargas, `${slug}-calendario.xls`))));
    let pend = 0;
    for (let j = 1; j <= cal.jornadas; j++) {
      const r = join(carpetaDescargas, `${slug}-jornada-${j}.html`);
      if (!existsSync(r) || readFileSync(r).length === 0) pend++;
    }
    return pend;
  } catch {
    return 0;
  }
}

/** Códigos de acta que aparecen en las jornadas ya bajadas, menos las actas ya descargadas. */
function actasPendientes(slug: string): number {
  try {
    const cal = parseaCalendario(decodifica(readFileSync(join(carpetaDescargas, `${slug}-calendario.xls`))));
    const codActas = new Set<string>();
    for (let j = 1; j <= cal.jornadas; j++) {
      const r = join(carpetaDescargas, `${slug}-jornada-${j}.html`);
      if (!existsSync(r) || readFileSync(r).length === 0) continue;
      const html = decodifica(readFileSync(r));
      for (const m of html.matchAll(/CodActa=(\d+)/gi)) codActas.add(m[1]!);
    }
    if (codActas.size === 0) return 0;
    let existentes = 0;
    for (const f of readdirSync(carpetaDescargas)) {
      if (f.startsWith(`${slug}-acta-`) && f.endsWith('.html') &&
          readFileSync(join(carpetaDescargas, f)).length > 0) existentes++;
    }
    return Math.max(0, codActas.size - existentes);
  } catch {
    return 0;
  }
}

/** ¿Esta competición tiene trabajo real pendiente (según las banderas activas)? */
function conTrabajo(slug: string): boolean {
  const cal = join(carpetaDescargas, `${slug}-calendario.xls`);
  if (!existsSync(cal) || readFileSync(cal).length === 0) return true;
  if (args.has('--jornadas') && jornadasPendientes(slug) > 0) return true;
  if (args.has('--actas') && actasPendientes(slug) > 0) return true;
  return false;
}

/** Cantidad de trabajo pendiente (para ordenar: lo más incompleto primero). */
function trabajoDe(slug: string): number {
  const cal = join(carpetaDescargas, `${slug}-calendario.xls`);
  let n = !existsSync(cal) || readFileSync(cal).length === 0 ? 100 : 0;
  if (args.has('--jornadas')) n += jornadasPendientes(slug);
  if (args.has('--actas')) n += actasPendientes(slug);
  return n;
}

/** Catálogo candidato → lista de competiciones, si se puede inferir el slug y los códigos.
 *  Necesita la correspondencia `valor` → `codCompeticion`/`codGrupo`, que se confirma a mano. */
async function una(): Promise<void> {
  const cod = argumento('cod');
  const grupo = argumento('grupo');
  const delegacion = argumento('delegacion') ?? '0';
  const temporada = argumento('temporada') ?? '22';
  if (!cod || !grupo) {
    console.error(
      'Uso: pnpm ingesta:una --cod <CodCompeticion> --grupo <CodGrupo> --delegacion <N>\n' +
      '     [--temporada 22] [--categoria juvenil|cadete|infantil|...]\n' +
      'Ejemplo: pnpm ingesta:una --cod 24218963 --grupo 24218968 --delegacion 1 --temporada 22 --categoria juvenil',
    );
    process.exit(1);
  }
  const c = competicionDeCodigos(cod, grupo, delegacion, temporada, argumento('categoria') ?? 'aficionados');
  mkdirSync(carpetaDescargas, { recursive: true });
  const estado = leeEstado();
  const cliente = new ClienteFederacion({
    urlBot: process.env.BOT_URL,
    contacto: process.env.BOT_CONTACTO,
  });
  await descargaCompeticion(cliente, c, estado, new Date());
  writeFileSync(ficheroEstado, JSON.stringify(estado, null, 2));
}

if (args.has('--una')) {
  if (argumento('cod')) {
    await una();
  } else {
    local();
  }
} else if (args.has('--todas')) {
  const catalogoRuta = resolve(RAIZ, argumento('catalogo') ?? 'descargas-federacion/catalogo.json');
  const cliente = new ClienteFederacion({
    urlBot: process.env.BOT_URL,
    contacto: process.env.BOT_CONTACTO,
  });
  if (args.has('--continuo')) {
    await continuo(catalogoRuta, cliente);
  } else {
    await ciclo(catalogoRuta, cliente);
  }
} else {
  console.error(
    'Uso: pnpm ingesta:una            (parsea el fichero de ejemplo, en seco)\n' +
    '     pnpm ingesta:una --cod …     (descarga una competición de verdad)\n' +
    '     pnpm ingesta:todas           (ciclo sobre el catálogo)',
  );
  process.exit(1);
}
