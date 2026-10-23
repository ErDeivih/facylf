/* Página de la previa. Todo el texto de la fuente se escapa; ningún identificador interno se enseña. */
import { nombreFederacion } from './informes-federaciones.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
const nombre = (v) => { const [a, b] = String(v ?? '').split(','); return b ? `${b.trim()} ${a.trim()}` : a; };
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }) : 'fecha sin publicar');
const letra = { V: 'victoria', E: 'empate', D: 'derrota' };

export function htmlPrevia(d, { a, b }) {
  const A = d.a, B = d.b;
  const ppp = (x) => (x.total.pj ? (3 * x.total.v + x.total.e) / x.total.pj : null);
  const linea = (et, fa, fb, nota = '') => `<tr><td class="va">${fa}</td><th scope="row">${et}${nota ? `<small>${nota}</small>` : ''}</th><td class="vb">${fb}</td></tr>`;
  const ved = (s) => `${num(s.v)}-${num(s.e)}-${num(s.d)}`;
  const golesSplit = (s) => `${num(s.gf)}-${num(s.gc)}`;
  const forma = (x) => x.forma.length
    ? x.forma.map((m) => `<li class="r-${m.r}" title="${esc(letra[m.r])} · jornada ${esc(m.jornada)}"><b>${m.r}</b><span>${m.casa ? 'vs' : 'en'} ${esc(m.rival)}</span><em>${m.gf}-${m.gc}</em></li>`).join('')
    : '<li class="vacio">Sin partidos jugados todavía.</li>';
  const max = Math.max(1, ...[...A.tramos, ...B.tramos].flatMap((t) => [t.favor, t.contra]));
  const tramos = (x, clase) => x.tramos.map((t) => `<div class="tramo"><span>${t.desde}–${t.hasta}'</span>
    <div class="barra"><i class="${clase}" style="width:${(100 * t.favor) / max}%"></i></div><b>${t.favor}</b>
    <div class="barra"><i class="contra" style="width:${(100 * t.contra) / max}%"></i></div><b>${t.contra}</b></div>`).join('');
  const notaTramos = (x) => [
    x.sinMinuto ? `${x.sinMinuto} gol(es) sin minuto publicado no entran en los tramos` : '',
    !x.cuadranGoles ? `los goles con acta (${x.golesEventos}) no cuadran con los marcadores (${x.golesMarcador}): los tramos describen sólo los primeros` : '',
  ].filter(Boolean).join(' · ');
  const once = (x) => (x.once.length
    ? `<ol>${x.once.map((p) => `<li><a href="/persona/${Number(p.person_id)}">${esc(nombre(p.nombre))}</a><span>${num(p.titularidades)} de ${num(x.conAlineacion)}</span></li>`).join('')}</ol>`
    : '<p class="muted">Sin alineaciones publicadas en sus partidos de este grupo.</p>');
  const goleadores = (x) => (x.goleadores.length
    ? `<ol>${x.goleadores.map((g) => `<li>${esc(nombre(g.nombre))}<span>${num(g.goles)}</span></li>`).join('')}</ol>`
    : '<p class="muted">Ningún gol con autor identificado.</p>');
  const partidoPrevio = (m, eq) => `<tr><td>${esc(m.temporada ?? A.temporada)}</td><td>${esc(m.competicion ?? A.competicion)}${m.jornada ? ` · J${esc(m.jornada)}` : ''}</td>
    <td>${esc(m.local)}</td><td class="marcador">${num(m.goles_local)}-${num(m.goles_visitante)}</td><td>${esc(m.visitante ?? '')}</td></tr>`;
  const esteAno = d.entreEllos.map((m) => ({ ...m, local: String(m.local) === String(a) ? A.equipo : B.equipo, visitante: String(m.visitante) === String(a) ? A.equipo : B.equipo }));
  const cobertura = d.enCurso
    ? `Temporada en curso: resultados publicados hasta la jornada ${num(d.ultimaJornada)}${A.jornadas_previstas ? ` de ${num(A.jornadas_previstas)}` : ''}. No es una temporada cerrada.`
    : 'Temporada terminada, grupo con certificado de cobertura completo.';
  const oficial = d.oficialJornada
    ? `La clasificación oficial publicada es de la jornada ${num(d.oficialJornada)}: ${esc(A.equipo)} ${num(A.oficial?.posicion)}º (${num(A.oficial?.puntos)} pts) · ${esc(B.equipo)} ${num(B.oficial?.posicion)}º (${num(B.oficial?.puntos)} pts).`
    : 'No hay clasificación oficial importada para este grupo: la posición sale de los resultados publicados.';

  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Previa · ${esc(A.equipo)} – ${esc(B.equipo)} · Observatorio</title>
<style>
:root{--ink:#16303d;--muted:#607381;--line:#dce3e8;--a:#087e83;--b:#b52039;--bg:#f1f4f6}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1180px;margin:auto;padding:28px 18px}a{color:var(--a)}.muted,.nota{color:var(--muted)}.nota{font-size:12px}
.acciones{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.pdf{background:var(--a);color:#fff;border-radius:9px;padding:8px 13px;text-decoration:none}
header.cab{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:14px 0}
.eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted);font-weight:750}
.vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;margin:10px 0}.vs h1{font-size:clamp(20px,3.2vw,34px);margin:0;line-height:1.15}
.vs .ea{color:var(--a)}.vs .eb{color:var(--b);text-align:right}.vs span{font-weight:800;color:var(--muted)}
.proximo{background:#eef6f6;border-radius:10px;padding:10px 13px;margin-top:10px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0;break-inside:avoid}.card h2{font-size:18px;margin:0 0 10px}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dos>.card{margin:0}.dos h3{margin:0 0 8px;font-size:15px}.ta{color:var(--a)}.tb{color:var(--b)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{padding:6px 8px;border-bottom:1px solid #edf1f4}
.cara th{text-align:center;font-weight:600;color:var(--muted);font-size:13px}.cara th small{display:block;font-weight:400;font-size:11px}
.cara .va{text-align:right;font-weight:700;color:var(--a);width:36%}.cara .vb{text-align:left;font-weight:700;color:var(--b);width:36%}
.forma{list-style:none;margin:0;padding:0}.forma li{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid #f0f3f5}
.forma b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;color:#fff;font-size:12px}.r-V b{background:#2e7d32}.r-E b{background:#8a96a0}.r-D b{background:#b52039}
.forma em{font-style:normal;font-weight:700}.tramo{display:grid;grid-template-columns:62px 1fr 26px 1fr 26px;gap:6px;align-items:center;font-size:12px;margin:4px 0}
.barra{background:#eef2f4;height:10px;border-radius:5px;overflow:hidden}.barra i{display:block;height:100%}.barra i.ia{background:var(--a)}.barra i.ib{background:var(--b)}.barra i.contra{background:#c9a227}
.leyenda{font-size:12px;color:var(--muted)}.leyenda i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px}
ol{margin:0;padding-left:20px}ol li{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid #f0f3f5}ol li span{color:var(--muted);white-space:nowrap}
.clas tr.a td{background:#e6f3f3;font-weight:700}.clas tr.b td{background:#f8e7ea;font-weight:700}.clas td:not(:nth-child(2)){text-align:center}.marcador{text-align:center;font-weight:700}
@media(max-width:760px){.dos{grid-template-columns:1fr}.vs{grid-template-columns:1fr}.vs .eb{text-align:left}}
@page{size:A4 portrait;margin:10mm}@media print{body{background:#fff;font-size:11px}main{padding:0}.acciones{display:none}.card,header.cab{border-color:#cfd8de;padding:10px 12px;margin:8px 0}.dos{grid-template-columns:1fr 1fr}}
</style>
<main>
<div class="acciones"><a href="/equipo/${Number(a)}">← Informe de ${esc(A.equipo)}</a><a class="pdf" href="/previa/${Number(a)}/${Number(b)}/pdf" download>Descargar PDF</a></div>
<header class="cab"><span class="eyebrow">Previa de partido · ${esc(nombreFederacion(A.federacion))} · ${esc(A.competicion)} · ${esc(A.grupo)} · ${esc(A.temporada)}</span>
<div class="vs"><h1 class="ea">${esc(A.equipo)}</h1><span>vs</span><h1 class="eb">${esc(B.equipo)}</h1></div>
${d.proximo ? `<div class="proximo"><b>Próximo enfrentamiento:</b> jornada ${num(d.proximo.jornada)} · ${esc(fecha(d.proximo.fecha))} · en casa de ${esc(String(d.proximo.local) === String(a) ? A.equipo : B.equipo)}</div>` : ''}
<p class="nota">${cobertura} ${oficial}</p></header>

<section class="card"><h2>Cara a cara esta temporada</h2><table class="cara"><tbody>
${linea('Posición', num(A.posicion?.pos) + 'º', num(B.posicion?.pos) + 'º', 'según resultados publicados')}
${linea('Puntos', num(A.posicion?.pts), num(B.posicion?.pts))}
${linea('Puntos por partido', num(ppp(A), 2), num(ppp(B), 2))}
${linea('Jugados · V-E-D', `${num(A.total.pj)} · ${ved(A.total)}`, `${num(B.total.pj)} · ${ved(B.total)}`)}
${linea('Goles a favor-en contra', golesSplit(A.total), golesSplit(B.total))}
${linea('En casa · V-E-D · goles', `${ved(A.casa)} · ${golesSplit(A.casa)}`, `${ved(B.casa)} · ${golesSplit(B.casa)}`)}
${linea('Fuera · V-E-D · goles', `${ved(A.fuera)} · ${golesSplit(A.fuera)}`, `${ved(B.fuera)} · ${golesSplit(B.fuera)}`)}
${linea('Amarillas · rojas', `${num(A.amarillas)} · ${num(A.rojas)}`, `${num(B.amarillas)} · ${num(B.rojas)}`, 'de jugadores, según actas')}
</tbody></table></section>

<div class="dos">
<section class="card"><h3 class="ta">${esc(A.equipo)} · últimos partidos</h3><ul class="forma">${forma(A)}</ul></section>
<section class="card"><h3 class="tb">${esc(B.equipo)} · últimos partidos</h3><ul class="forma">${forma(B)}</ul></section>
</div>

<section class="card"><h2>Cuándo marcan y cuándo encajan</h2>
<p class="leyenda">Por tramos de ${num((d.formato.duracion ?? 90) / 6)} minutos.<i style="background:var(--a)"></i>marca ${esc(A.equipo)}<i style="background:var(--b)"></i>marca ${esc(B.equipo)}<i style="background:#c9a227"></i>encaja</p>
<div class="dos"><div><h3 class="ta">${esc(A.equipo)}</h3>${tramos(A, 'ia')}<p class="nota">${esc(notaTramos(A))}</p></div>
<div><h3 class="tb">${esc(B.equipo)}</h3>${tramos(B, 'ib')}<p class="nota">${esc(notaTramos(B))}</p></div></div></section>

<div class="dos">
<section class="card"><h3 class="ta">Once más repetido · ${esc(A.equipo)}</h3>${once(A)}<p class="nota">Titularidades sobre sus partidos con alineación publicada. No indica posiciones: el acta no las publica.</p></section>
<section class="card"><h3 class="tb">Once más repetido · ${esc(B.equipo)}</h3>${once(B)}<p class="nota">Titularidades sobre sus partidos con alineación publicada. No indica posiciones: el acta no las publica.</p></section>
<section class="card"><h3 class="ta">Goleadores · ${esc(A.equipo)}</h3>${goleadores(A)}</section>
<section class="card"><h3 class="tb">Goleadores · ${esc(B.equipo)}</h3>${goleadores(B)}</section>
</div>

<section class="card"><h2>Enfrentamientos</h2>
${esteAno.length || d.previos.length ? `<table><thead><tr><th>Temporada</th><th>Competición</th><th>Local</th><th>Resultado</th><th>Visitante</th></tr></thead><tbody>
${esteAno.map((m) => partidoPrevio(m)).join('')}${d.previos.map((m) => partidoPrevio(m)).join('')}</tbody></table>` : '<p class="muted">No constan enfrentamientos esta temporada ni en grupos certificados anteriores.</p>'}
<p class="nota">Las temporadas anteriores incluyen sólo grupos con cobertura completa y equipos de estos dos clubes en la misma categoría: pueden ser otras secciones (A, B…) del club.</p></section>

<section class="card"><h2>Clasificación según los resultados publicados</h2><table class="clas"><thead><tr><th>Pos.</th><th>Equipo</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>GF</th><th>GC</th><th>Pts</th></tr></thead><tbody>
${d.clasificacion.map((x) => `<tr class="${x.id === String(a) ? 'a' : x.id === String(b) ? 'b' : ''}"><td>${x.pos}</td><td>${esc(x.equipo)}</td><td>${x.pj}</td><td>${x.g}</td><td>${x.e}</td><td>${x.p}</td><td>${x.gf}</td><td>${x.gc}</td><td>${x.pts}</td></tr>`).join('')}
</tbody></table><p class="nota">Calculada con 3 puntos por victoria y 1 por empate sobre los marcadores publicados. Puede diferir de la oficial si la federación ha aplicado sanciones o decisiones de comité.</p></section>
<p class="nota">Consulta del ${esc(new Date(d.generadoEn).toLocaleDateString('es-ES', { dateStyle: 'long' }))}. Los datos dependen de las actas disponibles: un vacío no demuestra que algo no ocurriera.</p>
</main></html>`;
}
