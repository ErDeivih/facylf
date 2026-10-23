#!/usr/bin/env node
/** Comprueba que una temporada pasada de ServerSports se puede leer (POST del menú → campeonato → equipo →
 *  ficha). Cinco peticiones espaciadas 6 s. No imprime nombres de jugadores, sólo recuentos.
 *  Uso: node prueba-historico-ss.mjs https://www.futormes.com 2019 */
import { pedirHttp } from './motor.mjs';
import { temporadasDelMenu, cuerpoTemporada, campeonatosEnlazados, nombreCampeonato, equiposEnlazados,
  partidosDeEquipo, fichaDePartido } from './adaptadores/serversports.mjs';
const [base, anio] = process.argv.slice(2);
const espera = () => new Promise((r) => setTimeout(r, 6000));
const texto = async (url, cuerpo) => { const r = await pedirHttp(url, { cuerpo }); console.log(`  ${r.estado} ${cuerpo ? 'POST' : 'GET '} ${url}`); return r.bruto.toString('utf8'); };
const comp = `${base}/mod/soccer/competitions.aspx`;
const h0 = await texto(comp);
const ts = temporadasDelMenu(h0);
console.log('temporadas:', ts.map((t) => t.anio).join(' '), '· campeonatos en curso:', campeonatosEnlazados(h0).length);
const t = ts.find((x) => String(x.anio) === String(anio));
if (!t) { console.log('sin esa temporada'); process.exit(0); }
await espera();
const h1 = await texto(comp, cuerpoTemporada(h0, t.id));
const cs = campeonatosEnlazados(h1);
console.log(`temporada ${anio}: ${cs.length} campeonatos (en curso: ${campeonatosEnlazados(h0).slice(0, 5)} · ${anio}: ${cs.slice(0, 5)})`);
console.log('  menú marca como actual:', /16calendar_now[^>]*>\s*(\d{4})/.exec(h1)?.[1]);
if (!cs.length) process.exit(0);
await espera();
const h2 = await texto(`${base}/mod/soccer/situation.aspx?itm=${cs[0]}`);
const eqs = equiposEnlazados(h2);
console.log(`campeonato ${cs[0]}: «${nombreCampeonato(h2)}», ${eqs.length} equipos`);
if (!eqs.length) process.exit(0);
await espera();
const h3 = await texto(`${base}/mod/soccer/team.aspx?itm=${eqs[0]}`);
const ps = partidosDeEquipo(h3);
console.log(`equipo ${eqs[0]}: ${ps.length} partidos, ${ps.filter((p) => p.finalizado).length} finalizados; primero ${ps[0]?.fecha} ${ps[0]?.local?.nombre} ${ps[0]?.goles_local}-${ps[0]?.goles_visitante} ${ps[0]?.visitante?.nombre}`);
const p = ps.find((x) => x.finalizado && x.id_partido);
if (!p) process.exit(0);
await espera();
const h4 = await texto(`${base}/mod/soccer/match.aspx?itm=${p.id_partido}`);
const f = fichaDePartido(h4);
console.log(`ficha ${p.id_partido}: jornada ${f.jornada}, categoría ${f.categoria}, ${f.competicion}, menores=${f.menores}`, JSON.stringify(f.totales));
