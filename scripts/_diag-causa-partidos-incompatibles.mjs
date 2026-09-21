#!/usr/bin/env node
/**
 * SÓLO LECTURA: por qué el calendario y el acta de un partido no comparten NINGÚN equipo.
 *
 * Son los 242 casos que hoy detienen su lote. Aquí no se relaja ninguna barrera: se clasifican por
 * causa probable probando hipótesis contra la evidencia archivada, en un orden determinista, y cada
 * caso se queda con la primera que se demuestra.
 *
 * Hipótesis que se prueban (todas medibles en la cola, sin red):
 *
 *   H4  código de acta reutilizado .... el mismo `codigo_acta` aparece citado por más de un partido
 *   H5  jornada desfasada ............. la pareja del acta es OTRO partido del mismo grupo, en otra jornada
 *   H3  emparejamiento cruzado ........ la pareja del acta es OTRO partido del mismo grupo, en la misma jornada
 *   H6  otro grupo .................... la pareja del acta es un partido de otro grupo
 *   H2  misma denominación de club .... las dos parejas comparten el nombre de club (sin la letra de equipo)
 *   H8  equipos fuera del grupo ....... alguno de los equipos del acta no está en `equipos` del grupo
 *   H10 acta de otro ámbito ........... ni siquiera comparte club con el calendario
 *
 * Uso: node scripts/_diag-causa-partidos-incompatibles.mjs [--federacion X] [--muestra N]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const arg = (nombre, pordefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : pordefecto;
};
const soloFederacion = arg('federacion', '');
const tamanoMuestra = Number(arg('muestra', 14));

const raiz = resolve(import.meta.dirname, '..');
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sinLetra = (s) => normaliza(s).replace(/\s+[a-z]$/, '');
const pareja = (a, b) => [normaliza(a), normaliza(b)].sort().join(' || ');

const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const federacion = entrada.name.replace(/^descargas-/, '');
  if (soloFederacion && federacion !== soloFederacion) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion, ruta });
}

const casos = [];
const porCausa = new Map();
const porFederacionCausa = new Map();

for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));
  const competiciones = new Map(db.prepare('select temporada, codigo, nombre from competiciones').all()
    .map((c) => [`${c.temporada}|${c.codigo}`, c.nombre]));

  // Índices de la cola entera: por código de acta y por pareja de equipos.
  const porActa = new Map();
  const porPareja = new Map();
  const equiposDeGrupo = new Map();
  for (const p of db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
      equipo_local_codigo, equipo_visitante_codigo, local, visitante
    from partidos`).all()) {
    if (p.codigo_acta) {
      const k = `${p.temporada}|${p.codigo_acta}`;
      if (!porActa.has(k)) porActa.set(k, []);
      porActa.get(k).push(p);
    }
    const kp = pareja(p.local, p.visitante);
    if (!porPareja.has(kp)) porPareja.set(kp, []);
    porPareja.get(kp).push(p);
    const kg = `${p.temporada}|${p.competicion}|${p.grupo}`;
    if (!equiposDeGrupo.has(kg)) equiposDeGrupo.set(kg, new Set());
    for (const n of [p.local, p.visitante]) equiposDeGrupo.get(kg).add(normaliza(n));
  }

  // Todos los partidos con acta analizada, para buscar el desacuerdo.
  const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada, a.estado, a.calidad,
      a.archivo, a.datos, p.orden, p.local plocal, p.visitante pvisitante,
      p.equipo_local_codigo, p.equipo_visitante_codigo, p.jornada pjornada
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo
   where a.datos is not null`).all();

  for (const f of filas) {
    let d; try { d = JSON.parse(f.datos); } catch { continue; }
    if (!d?.local || !d?.visitante) continue;
    const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante), aL = normaliza(d.local), aV = normaliza(d.visitante);
    if (cL === aL && cV === aV) continue;
    // Las formas 'fuga' e 'invertido' ya tienen su propia regla y no son «otro».
    if (cL === aV && cV === aL) continue;
    if (cV === aL && cL !== aL && cL !== aV) continue;

    /* --- clasificación causal --- */
    const evidencias = {};
    const kActa = `${f.temporada}|${f.codigo}`;
    const reutilizacion = (porActa.get(kActa) ?? []).filter((p) => !(p.grupo === f.grupo && p.jornada === f.pjornada && p.orden === f.orden));
    const kPareja = pareja(d.local, d.visitante);
    const donde = porPareja.get(kPareja) ?? [];
    const mismosEquipos = new Set([cL, cV]);
    const comparteClub = [aL, aV].map(sinLetra).some((b) => [sinLetra(cL), sinLetra(cV)].includes(b));
    const equiposDelGrupo = equiposDeGrupo.get(`${f.temporada}|${f.competicion}|${f.grupo}`) ?? new Set();
    const actaFueraDelGrupo = ![aL, aV].some((n) => equiposDelGrupo.has(n)) ? false : (equiposDelGrupo.has(aL) && equiposDelGrupo.has(aV) ? false : true);

    let causa;
    if (reutilizacion.length > 0) {
      causa = 'H4 código de acta reutilizado';
      evidencias.otros_partidos_con_esa_acta = reutilizacion.slice(0, 3)
        .map((p) => `g${p.grupo} J${p.jornada} ord ${p.orden} ${p.local} vs ${p.visitante}`);
    } else if (donde.length > 0) {
      const otraJornada = donde.filter((p) => p.jornada !== f.pjornada);
      const otroGrupo = donde.filter((p) => p.grupo !== f.grupo);
      if (otroGrupo.length > 0) {
        causa = 'H6 la pareja del acta es un partido de OTRO grupo';
        evidencias.donde_esta = otroGrupo.slice(0, 3).map((p) => `c${p.competicion} g${p.grupo} J${p.jornada} ord ${p.orden} ${p.local} vs ${p.visitante}`);
      } else if (otraJornada.length > 0) {
        causa = 'H5 jornada desfasada (mismo grupo, otra jornada)';
        evidencias.donde_esta = otraJornada.slice(0, 3).map((p) => `J${p.jornada} ord ${p.orden} ${p.local} vs ${p.visitante}`);
      } else {
        causa = 'H3 emparejamiento cruzado en la misma jornada';
        evidencias.donde_esta = donde.slice(0, 3).map((p) => `J${p.jornada} ord ${p.orden} ${p.local} vs ${p.visitante}`);
      }
    } else if (actaFueraDelGrupo) {
      causa = 'H8 la pareja del acta no está en `equipos` de este grupo';
      evidencias.equipos_del_grupo = equiposDelGrupo.size;
      evidencias.faltan_en_el_grupo = [d.local, d.visitante].filter((n) => !equiposDelGrupo.has(normaliza(n)));
    } else if (comparteClub) {
      causa = 'H2 misma denominación de club, equipos distintos';
    } else if (mismosEquipos.size === 0) {
      causa = 'H10 acta de otro ámbito (no comparte ni el club)';
    } else {
      causa = 'H11 sin causa demostrada con la cola';
    }

    porCausa.set(causa, (porCausa.get(causa) ?? 0) + 1);
    const kfc = `${federacion}|${causa}`;
    porFederacionCausa.set(kfc, (porFederacionCausa.get(kfc) ?? 0) + 1);
    casos.push({
      federacion,
      etiqueta: etiquetas.get(f.temporada) ?? f.temporada,
      temporada: f.temporada,
      competicion: f.competicion,
      competicionNombre: competiciones.get(`${f.temporada}|${f.competicion}`) ?? '?',
      grupo: f.grupo,
      jornada: f.pjornada,
      orden: f.orden,
      acta: f.codigo,
      estadoActa: f.estado,
      calidad: f.calidad,
      archivo: f.archivo,
      calendario: `${f.plocal} vs ${f.pvisitante}`,
      calendarioCodigos: `${f.equipo_local_codigo} / ${f.equipo_visitante_codigo}`,
      actaPareja: `${d.local} vs ${d.visitante}`,
      actaNormalizado: `${aL} / ${aV}`,
      calendarioNormalizado: `${cL} / ${cV}`,
      causa,
      evidencias,
    });
  }
  db.close();
}

console.log(`partidos incompatibles (calendario y acta sin ningún equipo en común): ${casos.length}\n`);
console.log('--- por causa ---');
for (const [c, n] of [...porCausa.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(52)} ${n}`);
console.log('\n--- por federación y causa ---');
const feds = [...new Set(casos.map((c) => c.federacion))].sort();
for (const fed of feds) {
  const suyos = [...porFederacionCausa.entries()].filter(([k]) => k.startsWith(`${fed}|`));
  const total = suyos.reduce((a, [, n]) => a + n, 0);
  console.log(`  ${fed} (${total}):`);
  for (const [k, n] of suyos.sort((a, b) => b[1] - a[1])) console.log(`      ${k.split('|')[1].padEnd(52)} ${n}`);
}

/* Muestra VARIADA: se recorre la lista intercalando federaciones y causas, no los primeros registros. */
const restantes = [...casos];
const muestra = [];
const vistosFed = new Map();
const vistosCausa = new Map();
while (muestra.length < tamanoMuestra && restantes.length) {
  // Se elige el caso cuya federación y causa estén menos representadas en la muestra: así no se
  // cuentan catorce veces los primeros 167 de Euskadi.
  let mejor = 0;
  let mejorPeso = Number.POSITIVE_INFINITY;
  for (const [i, c] of restantes.entries()) {
    const peso = (vistosFed.get(c.federacion) ?? 0) * 10 + (vistosCausa.get(c.causa) ?? 0) * 3 + i * 0.001;
    if (peso < mejorPeso) { mejorPeso = peso; mejor = i; }
  }
  const [elegido] = restantes.splice(mejor, 1);
  vistosFed.set(elegido.federacion, (vistosFed.get(elegido.federacion) ?? 0) + 1);
  vistosCausa.set(elegido.causa, (vistosCausa.get(elegido.causa) ?? 0) + 1);
  muestra.push(elegido);
}

console.log(`\n--- muestra variada (${muestra.length} casos) ---`);
for (const c of muestra) {
  console.log(`\n[${c.causa}] ${c.federacion} · t${c.etiqueta} (${c.temporada}) · c${c.competicion} ${c.competicionNombre} · g${c.grupo} · J${c.jornada} ord ${c.orden} · acta ${c.acta} (${c.estadoActa}${c.calidad ? '/' + c.calidad : ''})`);
  console.log(`    calendario: ${c.calendario}   [códigos ${c.calendarioCodigos}]`);
  console.log(`    acta:       ${c.actaPareja}`);
  console.log(`    normalizado: calendario «${c.calendarioNormalizado}» · acta «${c.actaNormalizado}»`);
  if (c.archivo) console.log(`    archivo del acta: ${c.archivo}`);
  for (const [k, v] of Object.entries(c.evidencias)) console.log(`    ${k}: ${JSON.stringify(v)}`);
}
