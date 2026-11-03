/**
 * Qué fichas de La Preferente merece la pena pedir (L4, «LP como base de todas las federaciones», 27/10/2026).
 *
 * El recolector de LP hace ~4.600 páginas al día con el PC encendido y en España hay cientos de miles de fichas por
 * temporada: hay que pedir sólo las que dan algo que la federación no da. Se EXCLUYEN las competiciones de LP
 * emparejadas con un grupo de la federación que ya tiene acta en el ≥ 90 % de sus partidos jugados.
 *
 *   node scripts/lapreferente/elige-fichas.mjs                 informe (no escribe nada)
 *   node scripts/lapreferente/elige-fichas.mjs --escribe       pone la lista en lapreferente-fichas.json («excluidas»)
 *   node scripts/lapreferente/elige-fichas.mjs --escribe --cola   además, descarta en la cola las fichas pendientes
 *                                                               de esas competiciones (el recolector puede seguir)
 * Una vez por semana basta (lo llama ciclo-lapreferente.ps1 -Todas). Claude, 27/10/2026.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pg, urlBase, RAIZ } from './lib.mjs';

export const UMBRAL = 0.9;

const SQL_CUBIERTAS = `
  select e.competicion_id id, f.codigo federacion,
         count(m.id) filter (where m.goles_local is not null)::int jugados, count(r.match_id)::int actas
    from externo.lp_emparejado e
    join externo.lp_competicion c on c.id = e.competicion_id
    left join core.federation f on f.id = c.federation_id
    join core.match m on m.phase_group_id = e.phase_group_id
    left join core.match_report r on r.match_id = m.id
   where e.estado = 'emparejado' and e.phase_group_id is not null
   group by 1, 2`;

/** Puro: de las filas de cobertura, las competiciones a excluir y el resumen por federación. */
export function decideExcluidas(filas, umbral = UMBRAL) {
  const excluidas = [];
  const resumen = {};
  for (const r of filas) {
    const k = r.federacion ?? 'nacional';
    const x = (resumen[k] ??= { emparejadas: 0, excluidas: 0 });
    x.emparejadas += 1;
    if (r.jugados > 0 && r.actas >= umbral * r.jugados) { excluidas.push(Number(r.id)); x.excluidas += 1; }
  }
  return { excluidas: excluidas.sort((a, b) => a - b), resumen };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { Client } = pg();
  const cliente = new Client({ connectionString: urlBase(), application_name: 'lapreferente-elige-fichas' });
  await cliente.connect();
  let decision;
  try { decision = decideExcluidas((await cliente.query(SQL_CUBIERTAS)).rows); } finally { await cliente.end(); }
  console.log(`Competiciones de LP con grupo de federación ya con actas (≥ ${UMBRAL * 100} %): ${decision.excluidas.length}`);
  for (const [f, x] of Object.entries(decision.resumen).sort()) console.log(`  ${f.padEnd(20)} ${x.excluidas} de ${x.emparejadas} emparejadas`);
  if (process.argv.includes('--escribe')) {
    const ruta = fileURLToPath(new URL('scripts/multideporte/lapreferente-fichas.json', RAIZ));
    const cfg = JSON.parse(readFileSync(ruta, 'utf8'));
    cfg.excluidas = decision.excluidas;
    cfg.excluidas_calculadas_en = new Date().toISOString();
    writeFileSync(`${ruta}.nuevo`, `${JSON.stringify(cfg, null, 2)}\n`);
    renameSync(`${ruta}.nuevo`, ruta);
    console.log(`Escrito en ${ruta}`);
    if (process.argv.includes('--cola') && decision.excluidas.length) {
      const db = new DatabaseSync(fileURLToPath(new URL('descargas-multideporte/lapreferente-federado/cola.sqlite', RAIZ)), { timeout: 60_000 });
      const r = db.prepare(`update paginas set estado = 'descartada', ultimo_error = 'la federación ya tiene las actas (elige-fichas)'
        where adaptador = 'lapreferente-federado' and tipo = 'ficha' and estado = 'pendiente'
          and cast(json_extract(contexto, '$.competicion') as integer) in (select value from json_each(?))`).run(JSON.stringify(decision.excluidas));
      db.close();
      console.log(`Fichas pendientes descartadas en la cola: ${r.changes}`);
    }
  }
}
