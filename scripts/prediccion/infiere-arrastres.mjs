#!/usr/bin/env node
/*
 * infiere-arrastres.mjs — comparación histórica de plantillas por división.
 *
 * No sustituye al reglamento: mide cuántos clubes salen y entran de cada división entre dos
 * temporadas. Sirve para detectar arrastres y para comprobar si el número directo del reglamento
 * se queda corto. Escribe un markdown; no modifica la base.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
try { process.loadEnvFile('.env'); } catch {}
const url = process.env.DATABASE_URL_LECTOR ?? process.env.DATABASE_URL_MIGRACION;
if (!url) { console.error('Falta DATABASE_URL_LECTOR o DATABASE_URL_MIGRACION'); process.exit(2); }
const { Client } = createRequire(resolve('packages/canonico/package.json'))('pg');
const cliente = new Client({ connectionString: url });
await cliente.connect();
const { rows } = await cliente.query(`
  select s.etiqueta temporada, ce.categoria, ce.division, pg.nombre grupo,
         ts.club_id, te.id equipo, te.nombre_en_fuente equipo_nombre
    from core.team_entry te
    join core.team_season ts on ts.id = te.team_season_id
    join core.phase_group pg on pg.id = te.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    join core.season s on s.id = ce.season_id
    join core.federation f on f.id = ce.federation_id
   where f.codigo = 'castilla-leon' and ce.ambito in ('nacional','regional','provincial')
   order by s.etiqueta, ce.categoria, ce.division, pg.nombre, te.nombre_en_fuente`);
await cliente.end();
const porTemporada = new Map();
for (const r of rows) {
  const clave = `${r.temporada}|${r.categoria}|${r.division}`;
  if (!porTemporada.has(clave)) porTemporada.set(clave, new Map());
  const mapa = porTemporada.get(clave);
  if (!mapa.has(r.club_id)) mapa.set(r.club_id, new Set());
  mapa.get(r.club_id).add(r.equipo_nombre);
}
const temporadas = [...new Set(rows.map((r) => r.temporada))].sort();
const divisiones = [...new Set(rows.map((r) => `${r.categoria}|${r.division}`))].sort();
const lineas = ['# Inferencia histórica de movimientos entre divisiones', '',
  'Generado por `scripts/prediccion/infiere-arrastres.mjs`. Cada fila compara los clubes de una división',
  'en dos temporadas consecutivas. **No es una verdad oficial**: sirve para ver si el número directo del',
  'reglamento necesita arrastre y para detectar temporadas con movimientos anómalos.', ''];
for (const d of divisiones) {
  const [categoria, division] = d.split('|');
  lineas.push(`## ${categoria} · ${division}`, '', '| Temporada | Clubes | Salen | Entran | Ejemplos de salida |', '|---|---:|---:|---:|---|');
  for (let i = 0; i < temporadas.length - 1; i++) {
    const a = porTemporada.get(`${temporadas[i]}|${d}`);
    const b = porTemporada.get(`${temporadas[i + 1]}|${d}`);
    if (!a || !b) continue;
    const salen = [...a.keys()].filter((c) => !b.has(c));
    const entran = [...b.keys()].filter((c) => !a.has(c));
    const ejemplo = salen.slice(0, 3).map((c) => [...a.get(c)][0]).join(' · ') || '—';
    lineas.push(`| ${temporadas[i]} → ${temporadas[i + 1]} | ${a.size} → ${b.size} | ${salen.length} | ${entran.length} | ${ejemplo} |`);
  }
  lineas.push('');
}
writeFileSync(resolve('docs/plataforma-web/INFERENCIA-ARRASTRES.md'), lineas.join('\n'));
console.log(`docs/plataforma-web/INFERENCIA-ARRASTRES.md · ${divisiones.length} divisiones · ${temporadas.length} temporadas`);
