#!/usr/bin/env node
/**
 * Estimación realista de tiempo para terminar cada federación.
 *
 * Por qué no basta con mirar los trabajos pendientes de la cola: una parte del trabajo todavía no
 * existe. Los trabajos de `jornada` y `acta` se crean cuando se lee el índice de jornadas de cada
 * grupo, así que una federación que sólo ha leído el 2 % de sus índices tiene en la cola una fracción
 * minúscula de lo que le queda. Contar sólo lo pendiente daría un tiempo absurdamente optimista.
 *
 * Dos pasadas:
 *   1. Métricas REALES de cada cola: grupos, índices leídos, jornadas previstas de esos índices,
 *      jornadas y actas ya hechas, y el paso real del recolector medido como la mediana del hueco
 *      entre peticiones consecutivas recientes (incluye su espera respetuosa y el análisis).
 *   2. Proyección. Se usan las medias DE LA PROPIA federación (jornadas por grupo y partidos por
 *      jornada medidos en sus grupos ya leídos). Si no ha leído ni el 5 % de sus índices no hay
 *      media propia, así que se usa la media ponderada del conjunto y se marca con «*» para que
 *      nadie confunda una extrapolación con un dato.
 *
 * Además se separa el trabajo APLAZADO (jornadas de la temporada en curso que aún no se han jugado):
 * eso no es tiempo de trabajo, es espera de calendario, y fija la fecha mínima de fin.
 *
 * Uso:
 *   node scripts/estimar-tiempos.mjs
 *   node scripts/estimar-tiempos.mjs --json
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const HOY = new Date().toISOString().slice(0, 10);
const EN_400_DIAS = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
const comoJson = process.argv.includes('--json');

/** Territoriales sin cola de datos, con el motivo verificado. Sólo se informan si de verdad no hay
 *  cola: si otro proceso ha creado una, se estima como las demás. */
const SIN_COLA_VERIFICADO = {
  melilla: 'sin robots.txt, pero su web devuelve HTTP 500 en calendarios, clasificaciones y actas (comprobado también con un navegador real).',
};

// Antes Madrid estaba aquí porque su adaptador no abría fichas individuales. Ya no: sus actas se
// descargan (52.611 fichas encoladas el 12/09/2026), así que dejarlo fuera de la proyección daba un
// ETA falsamente corto. Se mantiene el conjunto vacío por si alguna federación vuelve a publicar
// sólo estructura, pero ahora mismo ninguna está en ese caso.
const SIN_ACTAS_INDIVIDUALES = new Set();

function abre(ruta) {
  if (!existsSync(ruta)) return null;
  try { return new DatabaseSync(ruta, { readOnly: true }); } catch { return null; }
}

/** Mediana del hueco entre peticiones consecutivas: el paso real del recolector mientras trabaja. */
function pasoReal(db) {
  let filas;
  try { filas = db.prepare('select iniciada_en from peticiones order by id desc limit 240').all(); }
  catch { return null; }
  if (filas.length < 12) return null;
  const tiempos = filas.map((f) => new Date(f.iniciada_en).getTime()).sort((a, b) => a - b);
  const huecos = [];
  for (let i = 1; i < tiempos.length; i += 1) {
    const d = (tiempos[i] - tiempos[i - 1]) / 1000;
    // Se descartan los huecos de inactividad (espera por fechas futuras, pausas): aquí se mide el
    // paso MIENTRAS trabaja, no cuánto tiempo lleva encendida la tarea.
    if (d > 0 && d < 120) huecos.push(d);
  }
  if (huecos.length < 8) return null;
  huecos.sort((a, b) => a - b);
  const medio = Math.floor(huecos.length / 2);
  return huecos.length % 2 ? huecos[medio] : (huecos[medio - 1] + huecos[medio]) / 2;
}

function metricas(nombre, dbPath) {
  const db = abre(dbPath);
  if (!db) return null;
  const uno = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return null; } };
  const n = (sql, ...a) => Number(uno(sql, ...a)?.n ?? 0);

  const total = n('select count(*) n from trabajos');
  const hecho = n("select count(*) n from trabajos where estado='hecho'");
  const cancelados = n("select count(*) n from trabajos where estado='cancelado'");
  const bloqueados = n("select count(*) n from trabajos where estado='bloqueado'");
  const ahoraIso = new Date().toISOString();
  const aplazados = n(`select count(*) n from trabajos where estado='pendiente'
    and siguiente_intento is not null and siguiente_intento > ?`, ahoraIso);
  const enColaDescubrimiento = n(`select count(*) n from trabajos where estado in ('pendiente','en_curso','bloqueado')
    and tipo in ('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion')`);

  const gruposTotales = n("select count(*) n from grupos where estado != 'ausente_web'");
  const gruposConIndice = n('select count(*) n from grupos where jornadas is not null');
  const jornadasPrevistas = n('select coalesce(sum(jornadas),0) n from grupos where jornadas is not null');
  const jornadasHechas = n('select count(*) n from jornadas where archivo is not null');
  const actasHechas = n("select count(*) n from actas where estado='hecha'");
  // Actas que YA están encoladas: dato real, no proyección. Se cuenta aparte porque en federaciones
  // con pocos índices leídos la proyección por cobertura se queda corta frente a lo que ya se sabe.
  const actasEnCola = n(`select count(*) n from trabajos where tipo='acta'
    and estado in ('pendiente','en_curso','bloqueado')`);
  const partidosConocidos = n('select count(*) n from partidos');

  // Medias medidas sólo en los grupos cuyo índice ya se leyó.
  const est = uno(`with g as (
      select gr.jornadas jor,
        (select count(*) from jornadas j where j.temporada=gr.temporada and j.competicion=gr.competicion
          and j.grupo=gr.codigo and j.archivo is not null) baj,
        (select count(*) from partidos p where p.temporada=gr.temporada and p.competicion=gr.competicion
          and p.grupo=gr.codigo) par
      from grupos gr where gr.jornadas is not null)
    select coalesce(sum(jor),0) esperadas, coalesce(sum(baj),0) bajadas, coalesce(sum(par),0) partidos
    from g`) ?? { esperadas: 0, bajadas: 0, partidos: 0 };

  const futuras = uno(`select count(*) n, max(fecha) ultima from jornadas where fecha is not null and (
      (fecha like '____-__-__%' and substr(fecha,1,10) > ?)
      or (fecha like '__-__-____' and substr(fecha,7,4)||'-'||substr(fecha,4,2)||'-'||substr(fecha,1,2) > ?))`,
  HOY, HOY) ?? { n: 0, ultima: null };
  const fechasRaras = n(`select count(*) n from jornadas where fecha is not null and fecha > ?`, EN_400_DIAS);

  const paso = pasoReal(db);
  db.close();

  return {
    nombre, total, hecho, cancelados, bloqueados, aplazados, enColaDescubrimiento,
    gruposTotales, gruposConIndice, jornadasPrevistas, jornadasHechas, actasHechas, actasEnCola, partidosConocidos,
    estEsperadas: est.esperadas, estBajadas: est.bajadas, estPartidos: est.partidos,
    jornadasFuturas: Number(futuras.n ?? 0), ultimaJornadaFutura: futuras.ultima ?? null, fechasRaras,
    paso, actasDisponibles: !SIN_ACTAS_INDIVIDUALES.has(nombre),
    pctEstructura: gruposTotales > 0 ? Math.round((gruposConIndice / gruposTotales) * 100) : 0,
  };
}

/* ---------- Pasada 1: métricas reales ---------- */
const colas = [];
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  if (dir === 'descargas-federacion-sondeo') continue;
  const nombre = dir === 'descargas-federacion' ? 'castilla-leon' : dir.replace(/^descargas-/, '');
  const m = metricas(nombre, join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite'));
  if (m) colas.push(m);
}

/* ---------- Medias ponderadas del conjunto, para quien no tiene media propia ---------- */
const conEstructura = colas.filter((c) => c.gruposConIndice > 0);
const sumaJor = conEstructura.reduce((s, c) => s + c.jornadasPrevistas, 0);
const sumaGru = conEstructura.reduce((s, c) => s + c.gruposConIndice, 0);
const sumaBaj = conEstructura.reduce((s, c) => s + c.estBajadas, 0);
const sumaPar = conEstructura.reduce((s, c) => s + c.estPartidos, 0);
const JOR_GLOBAL = sumaGru > 0 ? sumaJor / sumaGru : 0;
const PAR_GLOBAL = sumaBaj > 0 ? sumaPar / sumaBaj : 0;

/* ---------- Pasada 2: proyección ---------- */
for (const c of colas) {
  const propia = c.paso != null;
  const jorPorGrupo = c.gruposConIndice > 0 ? c.jornadasPrevistas / c.gruposConIndice : JOR_GLOBAL;
  // Media propia si el índice leído da una base creíble. Si no la hay se usa la del conjunto, pero
  // distinguiendo POR QUÉ falta, porque no es lo mismo:
  //   '*'  pocos índices leídos: la federación aún no sabe cuántas jornadas tiene.
  //   '†'  índices leídos pero CERO partidos vistos: no hay media de partidos por jornada. Esto
  //        último no es sólo una limitación del cálculo, es un aviso: o esa federación publica
  //        jornadas sin partidos o su parser no los está leyendo.
  const pocosIndices = c.pctEstructura < 5;
  const sinPartidos = c.estBajadas > 0 && c.estPartidos === 0;
  const basePropia = !pocosIndices && !sinPartidos;
  const parPorJornada = basePropia ? c.estPartidos / c.estBajadas : PAR_GLOBAL;
  const jornadasPorGrupo = basePropia ? jorPorGrupo : (jorPorGrupo || JOR_GLOBAL);

  c.basePropia = basePropia;
  c.marca = pocosIndices ? '*' : sinPartidos ? '†' : ' ';
  c.motivoMarca = pocosIndices ? 'menos del 5 % de índices leídos'
    : sinPartidos ? 'índices leídos pero ningún partido visto' : null;
  c.jornadasPorGrupo = +jornadasPorGrupo.toFixed(1);
  c.partidosPorJornada = +parPorJornada.toFixed(2);
  c.jornadasTotales = Math.round(c.jornadasPrevistas + Math.max(0, c.gruposTotales - c.gruposConIndice) * jornadasPorGrupo);
  const actasEstimadas = c.actasDisponibles ? Math.round(c.jornadasTotales * parPorJornada) : c.actasHechas;
  // Lo real manda sobre lo proyectado: si la cola ya tiene más actas pendientes que la estimación por
  // cobertura, se usa el número que se puede contar hoy.
  c.actasTotales = Math.max(actasEstimadas, c.actasHechas + c.actasEnCola);
  c.jornadasRestantes = Math.max(0, c.jornadasTotales - c.jornadasHechas);
  c.actasRestantes = Math.max(Math.max(0, actasEstimadas - c.actasHechas), c.actasEnCola);
  c.restanteDescubrimiento = c.enColaDescubrimiento;
  c.restanteTotal = c.restanteDescubrimiento + c.jornadasRestantes + c.actasRestantes;
  c.pctJornadas = c.jornadasTotales > 0 ? Math.round((c.jornadasHechas / c.jornadasTotales) * 100) : 0;
  c.pctActas = c.actasTotales > 0 ? Math.round((c.actasHechas / c.actasTotales) * 100) : 0;
  // Tiempo de trabajo de esta federación a su propio paso.
  c.horasDescubrimiento = propia && c.restanteDescubrimiento > 0 ? (c.restanteDescubrimiento * c.paso) / 3600 : (propia ? 0 : null);
  c.horas = propia ? (c.restanteTotal * c.paso) / 3600 : null;
  // Aportación al ritmo del conjunto: peticiones por segundo que esta cola sostiene.
  c.petPorSegundo = propia ? 1 / c.paso : 0;
}

colas.sort((a, b) => (b.horas ?? -1) - (a.horas ?? -1));
const ritmoAgregado = colas.reduce((s, c) => s + c.petPorSegundo, 0);
const restanteGlobal = colas.reduce((s, c) => s + c.restanteTotal, 0);
const horasParedon = ritmoAgregado > 0 ? restanteGlobal / ritmoAgregado / 3600 : null;

const sinCola = Object.entries(SIN_COLA_VERIFICADO).filter(([nombre]) =>
  !colas.some((c) => c.nombre === nombre));

/* ---------- Salida ---------- */
const numero = (v) => Number(v ?? 0).toLocaleString('es-ES');
function duracion(horas) {
  if (horas == null) return '—';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toFixed(1)} h`;
  const dias = horas / 24;
  if (dias < 90) return `${dias.toFixed(1)} días`;
  return `${(dias / 30.44).toFixed(1)} meses`;
}

if (comoJson) {
  console.log(JSON.stringify({
    generadoEn: new Date().toISOString(), mediasConjunto: { jornadasPorGrupo: JOR_GLOBAL, partidosPorJornada: PAR_GLOBAL },
    restanteGlobal, horasParedon, ritmoAgregado, federaciones: colas, sinCola,
  }, null, 2));
  process.exit(0);
}

console.log('ESTIMACIÓN DE TIEMPO PARA COMPLETAR CADA FEDERACIÓN');
console.log(`Calculada el ${new Date().toLocaleString('es-ES')} leyendo las ${colas.length} colas reales.\n`);

console.log('1. ESTRUCTURA DESCUBIERTA Y TAMAÑO DEL TRABAJO');
console.log('federación            índice  grupos   jornadas      actas         paso');
console.log('                      leído   total   prev./~tot.   est./hechas   s/pet');
console.log('-'.repeat(76));
for (const c of colas) {
  const jor = `${numero(c.jornadasPrevistas)}/~${numero(c.jornadasTotales)}`;
  const act = `${numero(c.actasTotales)}/${numero(c.actasHechas)}`;
  console.log(
    `${c.nombre.padEnd(20)} ${String(c.pctEstructura).padStart(4)}%  ${numero(c.gruposTotales).padStart(6)}  ` +
    `${jor.padStart(13)}  ${act.padStart(13)}  ${(c.paso != null ? c.paso.toFixed(1) : '—').padStart(5)}`,
  );
}

console.log('\n2. LO QUE QUEDA Y CUÁNTO TARDA A SU RITMO MEDIDO');
console.log('federación           en cola   jornadas   actas      TOTAL      descubrir   TERMINAR');
console.log('                     (descub.) restantes  restantes  peticiones (solo desc.) (todo)');
console.log('-'.repeat(94));
for (const c of colas) {
  const marca = c.marca;
  console.log(
    `${c.nombre.padEnd(20)}${marca}${numero(c.restanteDescubrimiento).padStart(7)}  ${numero(c.jornadasRestantes).padStart(8)}  ` +
    `${numero(c.actasRestantes).padStart(9)}  ${numero(c.restanteTotal).padStart(10)}  ` +
    `${duracion(c.horasDescubrimiento).padStart(11)}  ${duracion(c.horas).padStart(10)}`,
  );
}

/*
 * Cómo se combina el tiempo de todas. Es la parte fácil de equivocar:
 *
 * Dividir el total de peticiones entre el ritmo agregado (la suma de las 16 colas) da un número
 * falsamente optimista, porque supone que el trabajo se puede repartir entre colas. NO se puede:
 * cada worker sólo toca su propia federación y su propia cola, y Andalucía no avanza más rápido
 * porque Castilla y León esté trabajando. El único reparto real es la máquina (CPU, RAM, red), y
 * eso ya está dentro del paso medido: las colas se están estorbando ahora mismo.
 *
 * Por tanto el tiempo de reloj para tenerlo TODO es el de la federación más lenta, no un promedio.
 */
const conTiempo = colas.filter((c) => c.horas != null);
const peor = conTiempo[0];
const sumaHoras = conTiempo.reduce((s, c) => s + c.horas, 0);
const totalPeticionesColas = conTiempo.reduce((s, c) => s + c.restanteTotal, 0);

console.log('\n3. RESPUESTA GLOBAL: CUÁNDO ESTÁ TODO');
console.log(`   Peticiones pendientes en total: ${numero(restanteGlobal)} (de ellas, ${numero(totalPeticionesColas)} en colas con ritmo medible).`);
const restanteActas = colas.reduce((s, c) => s + c.actasRestantes, 0);
const restanteDescubrimientoTotal = colas.reduce((s, c) => s + c.restanteDescubrimiento, 0);
console.log(`   Reparto del trabajo que queda: ${numero(restanteDescubrimientoTotal)} de descubrimiento ` +
  `(${((restanteDescubrimientoTotal / restanteGlobal) * 100).toFixed(1).replace('.', ',')} %), ` +
  `${numero(colas.reduce((s, c) => s + c.jornadasRestantes, 0))} de jornadas y ` +
  `${numero(restanteActas)} de ACTAS (${((restanteActas / restanteGlobal) * 100).toFixed(1).replace('.', ',')} %).`);
if (peor) {
  console.log(`   La federación más lenta es ${peor.nombre}: ${numero(peor.restanteTotal)} peticiones ` +
    `a ${peor.paso?.toFixed(1).replace('.', ',')} s = ${duracion(peor.horas)}.`);
  console.log('');
  console.log(`   TODO TERMINADO en unos ${duracion(peor.horas)}, contando sólo tiempo de trabajo.`);
  console.log('   Ése es el número que hay que usar, y es un suelo:');
  console.log('     · El trabajo NO se reparte entre federaciones. Cada worker sólo atiende su cola, así');
  console.log('       que sumar las 16 y dividir por el ritmo conjunto daría un dato falso por optimista.');
  console.log(`       Repartiendo el total a ${ritmoAgregado.toFixed(2).replace('.', ',')} peticiones/s saldrían ` +
    `${duracion(horasParedon)}, pero eso exigiría que unas federaciones hicieran el trabajo de otras.`);
  console.log(`     · Sumando los tiempos de cada una en serie saldrían ${duracion(sumaHoras)}; tampoco, porque`);
  console.log('       corren a la vez.');
  console.log('   Lo que sí puede mejorar el suelo:');
  console.log('     · Las colas grandes empezaron antes que las pequeñas, así que las pequeñas irán cayendo');
  console.log('       y liberarán máquina. El paso medido mejorará algo, pero no cambia el orden.');
  console.log('     · Dar prioridad a las temporadas recientes dentro de cada federación (ya está activo).');
}

console.log('\n4. ESPERA DE CALENDARIO (no es tiempo de trabajo)');
const aplazadas = colas.filter((c) => c.aplazados > 0).sort((a, b) => b.aplazados - a.aplazados);
for (const c of aplazadas) {
  console.log(`   ${c.nombre.padEnd(20)} ${numero(c.aplazados).padStart(7)} trabajos aplazados` +
    (c.ultimaJornadaFutura ? `  · última jornada prevista ${c.ultimaJornadaFutura}` : ''));
}
console.log('   Estas jornadas no existen hasta que se jueguen. Ninguna federación con temporada en');
console.log('   curso puede estar completa antes de su última jornada, haga lo que haga el recolector.');

const raras = colas.filter((c) => c.fechasRaras > 0);
const sinPartidosParseados = colas.filter((c) => c.jornadasHechas >= 50 && c.partidosConocidos === 0);
if (raras.length || sinPartidosParseados.length) {
  console.log('\n5. AVISOS DE CALIDAD');
  for (const c of raras) {
    console.log(`   ${c.nombre.padEnd(20)} ${c.fechasRaras} jornada(s) con fecha imposible (posterior a ${EN_400_DIAS}).`);
  }
  if (raras.length) {
    console.log('     El recolector ya ignora esas fechas al aplazar, para que no dejen el trabajo en el año 9999.');
  }
  for (const c of sinPartidosParseados) {
    console.log(`   ${c.nombre.padEnd(20)} ${numero(c.jornadasHechas)} jornadas descargadas y 0 partidos leídos.`);
  }
  if (sinPartidosParseados.length) {
    console.log('     Eso no es una limitación de la estimación: son páginas de jornada guardadas de las que');
    console.log('     no sale ningún partido. O la fuente las publica sin resultados, o el parser no las lee.');
    console.log('     Mientras siga así, esa federación no puede generar actas ni estadísticas de jugador.');
  }
}

if (sinCola.length) {
  console.log('\n6. SIN COLA DE DATOS (no estimable, con el motivo verificado)');
  for (const [nombre, motivo] of sinCola) console.log(`   ${nombre.padEnd(10)} ${motivo}`);
}

console.log('\nCómo leerlo, sin adornos:');
console.log('  · «índice leído», «grupos», «jornadas prev.», «jornadas hechas» y «actas hechas» son medidas reales.');
console.log('  · «~tot.» y «actas est.» son ESTIMACIONES: jornadas por grupo × grupos, y partidos por jornada');
console.log(`    medidos en esa federación (partidos/jornada real del conjunto: ${PAR_GLOBAL.toFixed(2).replace('.', ',')}).`);
console.log('  · «actas est.» NUNCA baja de las actas que ya están encoladas: si la cola tiene más fichas');
console.log('    pendientes que la proyección, manda el dato real (es el caso de Madrid).');
console.log('  · «*» = esa federación aún no ha leído el 5 % de sus índices, así que sus medias son las del');
console.log('    CONJUNTO y no las suyas. Es la estimación más floja de la tabla.');
console.log('  · «†» = tiene índices leídos pero ningún partido visto: falta la media de partidos por jornada.');
console.log('  · El paso «s/pet» es la mediana real del hueco entre peticiones, con espera y análisis dentro.');
console.log('  · Los tiempos son de trabajo acumulado a máquina compartida: las colas ya se estorban entre sí,');
console.log('    así que el ritmo medido es el que de verdad tienen, no el que tendrían solas.');
