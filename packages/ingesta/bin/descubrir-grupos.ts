/**
 * Completa el catálogo: para cada competición (de `competiciones-por-temporada.json`),
 * pide sus GRUPOS al endpoint AJAX (`NFG_POR_Lst_Competiciones_Grupos`) y construye
 * `catalogo.json` con (competición + grupo + temporada + provincia).
 *
 * Reanudable (guarda progreso), con cadencia y freno si el sitio deja de responder.
 * Uso: pnpm descubrir-grupos   [--max N] [--pausa ms]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClienteFederacion } from '../src/cliente.js';
import { parseaGrupos, estructuraDe, type Competicion, type Categoria } from '../src/catalogo.js';
import { urlGrupos } from '../src/urls.js';
import { decodifica } from '../src/texto.js';

const RAIZ = resolve(import.meta.dirname, '..', '..', '..');
const carpetas = join(RAIZ, 'descargas-federacion');
const rutaComps = join(carpetas, 'competiciones-por-temporada.json');
const rutaCatalogo = join(carpetas, 'catalogo.json');
const rutaProg = join(carpetas, '.grupos-progreso.json');

const PROVINCIAS: Record<string, string> = {
  '1000': 'Castilla y Leon', '1002': 'Avila', '1003': 'Burgos', '1004': 'Leon', '1005': 'Palencia',
  '1006': 'Salamanca', '1007': 'Segovia', '1008': 'Soria', '1009': 'Valladolid', '1010': 'Zamora', '9636101': 'El Bierzo',
};

/** Lee un JSON quitando un posible BOM inicial (PowerShell lo añade al escribir). */
const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));

/** Quita acentos/mojibake y deja solo letras minúsculas, para emparejar provincias. */
const soloLetras = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/gi, '').toLowerCase();

function provinciaDeGrupo(nombre: string): string {
  const parte = soloLetras(nombre.split(/[-–—]/).pop() ?? '');
  for (const [cod, nom] of Object.entries(PROVINCIAS)) {
    if (soloLetras(nom) === parte) return cod;
  }
  return '';
}

function categoriaDe(nombre: string): Categoria {
  const n = nombre.toLowerCase();
  if (n.includes('juvenil')) return 'juvenil';
  if (n.includes('cadete')) return 'cadete';
  if (n.includes('infantil')) return 'infantil';
  if (n.includes('alevin')) return 'alevin';
  if (n.includes('benjamin')) return 'benjamin';
  if (n.includes('prebenjamin')) return 'prebenjamin';
  if (n.includes('sala')) return 'sala';
  if (n.includes('copa')) return 'copa';
  return 'aficionados';
}

async function main() {
  if (!existsSync(rutaComps)) {
    console.log('Falta competiciones-por-temporada.json. Ejecuta primero: pnpm catalogo-historico');
    process.exit(1);
  }
  const porTemporada = leerJson(rutaComps) as Record<string, { codCompeticion: string; nombre: string; ambito: string }[]>;
  const existente: Competicion[] = existsSync(rutaCatalogo) ? (leerJson(rutaCatalogo) as Competicion[]) : [];
  const progreso: Record<string, boolean> = existsSync(rutaProg) ? (leerJson(rutaProg) as Record<string, boolean>) : {};

  const maximo = Number(process.argv[process.argv.indexOf('--max') + 1]) || 2;
  const pausa = Number(process.argv[process.argv.indexOf('--pausa') + 1]) || 8000;
  const continuo = process.argv.includes('--continuo');
  const cadaCiclo = Number(process.argv[process.argv.indexOf('--cada-ciclo') + 1]) || 120_000;
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const cliente = new ClienteFederacion({ urlBot: process.env.BOT_URL, contacto: process.env.BOT_CONTACTO, porMinuto: 6 });
  await cliente.pide('https://www.rfcylf.es/');

  const vistos = new Set(existente.map((e) => `${e.codTemporada}|${e.codCompeticion}|${e.codGrupo}`));
  let nuevos = 0;

  async function unaPasada(): Promise<{ procesadas: number; frenado: boolean }> {
    let procesadas = 0;
    let frenado = false;
    outer: for (const temp of Object.keys(porTemporada).sort((a, b) => Number(b) - Number(a))) {
      for (const c of porTemporada[temp] ?? []) {
        if (progreso[`${temp}|${c.codCompeticion}`]) continue;
        if (maximo > 0 && procesadas >= maximo) break outer;

        const html = await cliente.pide(urlGrupos(c.codCompeticion));
        await dormir(pausa);
        if (!html.cuerpo || html.cuerpo.length === 0) { frenado = true; console.log(`  ⛔ frenado en ${c.codCompeticion}.`); break outer; }
        const cuerpo: Uint8Array = html.cuerpo!;

        const grupos = parseaGrupos(decodifica(cuerpo), c.codCompeticion);
        const ambito = estructuraDe(c.nombre).ambito;
        const categoria = categoriaDe(c.nombre);
        for (const g of grupos) {
          const slug = `comp-${c.codCompeticion}-gr-${g.codGrupo}-t${temp}`;
          if (vistos.has(`${temp}|${c.codCompeticion}|${g.codGrupo}`)) continue;
          vistos.add(`${temp}|${c.codCompeticion}|${g.codGrupo}`);
          existente.push({
            codCompeticion: c.codCompeticion, codGrupo: g.codGrupo, codTemporada: temp,
            codDelegacion: provinciaDeGrupo(g.nombre), nombre: c.nombre, grupo: g.nombre,
            ambito, categoria, genero: 'm', slug, activa: true,
          });
          nuevos++;
        }
        progreso[`${temp}|${c.codCompeticion}`] = true;
        procesadas++;
        console.log(`  · t${temp} ${c.codCompeticion} (${c.nombre}): ${grupos.length} grupos`);
      }
    }
    writeFileSync(rutaCatalogo, JSON.stringify(existente, null, 2));
    writeFileSync(rutaProg, JSON.stringify(progreso, null, 2));
    return { procesadas, frenado };
  }

  do {
    const r = await unaPasada();
    console.log(`\n${nuevos} (competición×grupo) hasta ahora. Catálogo: ${existente.length}.`);
    if (!continuo) break;
    // si no hay nada pendiente o fue bloqueado, espera más; una pasada tranquila cada `cadaCiclo`
    await dormir(r.frenado ? cadaCiclo * 3 : cadaCiclo);
  } while (true);
}

main().catch((e) => { console.error(e); process.exit(1); });
