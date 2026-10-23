#!/usr/bin/env node
/*
 * jornadas-vacias.mjs — SÓLO LEE. Jornadas cuyo trabajo está «hecho» pero que no tienen ni un partido (21/10/2026).
 * Dice cuántas hay por temporada y enseña unas muestras: URL, fichero archivado y el texto de la página, para
 * saber si la web las publica vacías o si el lector no las entiende.
 *
 * Uso: node jornadas-vacias.mjs <federación> [etiqueta-temporada] [muestras]      (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [fed, etiqueta, muestrasTxt] = process.argv.slice(2);
const carpeta = fed === 'castilla-leon' ? 'descargas-federacion' : `descargas-${fed}`;
const base = join(RAIZ, carpeta, 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true, timeout: 60000 });
const temporadas = db.prepare('select codigo, etiqueta from temporadas').all();
const cod = etiqueta ? temporadas.find((t) => t.etiqueta === etiqueta)?.codigo : null;
const vacias = db.prepare(`select w.temporada, w.competicion, w.grupo, w.jornada, w.url, w.actualizado_en, j.archivo, j.fecha, c.nombre comp
  from trabajos w left join jornadas j on j.temporada=w.temporada and j.competicion=w.competicion and j.grupo=w.grupo and j.numero=w.jornada
  left join competiciones c on c.temporada=w.temporada and c.codigo=w.competicion
  where w.tipo='jornada' and w.estado='hecho' ${cod ? 'and w.temporada=?' : ''}
    and not exists (select 1 from partidos p where p.temporada=w.temporada and p.competicion=w.competicion and p.grupo=w.grupo and p.jornada=w.jornada)`)
  .all(...(cod ? [cod] : []));
const et = new Map(temporadas.map((t) => [t.codigo, t.etiqueta]));
const porTemp = {};
for (const v of vacias) porTemp[et.get(v.temporada)] = (porTemp[et.get(v.temporada)] ?? 0) + 1;
console.log(`${fed}: ${vacias.length} jornadas «hecho» sin partidos`, porTemp);
const porComp = {};
for (const v of vacias) porComp[v.comp] = (porComp[v.comp] ?? 0) + 1;
console.log('por competición (10 primeras):', Object.entries(porComp).sort((a, b) => b[1] - a[1]).slice(0, 10));
const n = Number(muestrasTxt ?? 3);
const elegidas = [...vacias].sort(() => Math.random() - 0.5).slice(0, n);
for (const v of elegidas) {
  console.log(`\n--- ${et.get(v.temporada)} «${v.comp}» g${v.grupo} j${v.jornada} fecha ${v.fecha} · hecho ${v.actualizado_en}\n    url ${v.url}\n    archivo ${v.archivo}`);
  if (!v.archivo) continue;
  const ruta = String(v.archivo).replace(/\\/g, '/').replace(/^.*?descargas-[^/]+\/recolector-local\//, `${base}/`);
  const cands = [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')];
  const ok = cands.find((r) => existsSync(r));
  if (!ok) { console.log('    (no está el archivo)'); continue; }
  let crudo = readFileSync(ok); if (ok.endsWith('.gz')) crudo = gunzipSync(crudo);
  const html = crudo.toString('utf8');
  const texto = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const i = texto.search(/Jornada\s+\d+/i);
  console.log(`    ${html.length} bytes · texto desde «Jornada»: ${texto.slice(Math.max(0, i - 150), i + 900)}`);
  const tablas = (html.match(/<table/gi) ?? []).length;
  const enlacesActa = (html.match(/acta|NPartido|CodActa|cod_acta/gi) ?? []).length;
  console.log(`    tablas ${tablas} · menciones de acta ${enlacesActa}`);
}
