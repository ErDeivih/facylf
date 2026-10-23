#!/usr/bin/env node
/** Sondeo de dominios candidatos de ServerSports: una petición por dominio (competitions.aspx), 6 s entre una y
 *  otra. Imprime estado, título, temporadas del menú (cuántas y desde cuándo) y campeonatos en curso.
 *  Uso: node sondea-serversports.mjs https://www.a.com http://www.b.es … */
import { pedirHttp } from './motor.mjs';
import { temporadasDelMenu, campeonatosEnlazados, nombresDeCampeonatos } from './adaptadores/serversports.mjs';
const espera = () => new Promise((r) => setTimeout(r, 6000));
for (const [i, base] of process.argv.slice(2).entries()) {
  if (i) await espera();
  try {
    const r = await pedirHttp(`${base}/mod/soccer/competitions.aspx`);
    const h = r.bruto.toString('utf8');
    const ts = temporadasDelMenu(h).map((t) => t.anio);
    const titulo = (/<title>([^<]*)/.exec(h)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const desc = (/name="description" content="([^"]*)/i.exec(h)?.[1] ?? '').slice(0, 100);
    const nombres = Object.values(nombresDeCampeonatos(h)).slice(0, 4).join(' | ');
    console.log(`${r.estado} ${base} · «${titulo}» · ${ts.length} temporadas ${ts.length ? `${Math.min(...ts)}-${Math.max(...ts)}` : ''} · ${campeonatosEnlazados(h).length} campeonatos · ${desc} · ${nombres}`);
  } catch (e) { console.log(`ERR ${base} · ${e?.cause?.code ?? e?.message ?? e}`); }
}
