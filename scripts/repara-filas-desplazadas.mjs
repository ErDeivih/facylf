#!/usr/bin/env node
/*
 * REPARA LA FILA DEL CALENDARIO QUE SU PROPIO ACTA CONTRADICE, CUANDO ES DEMOSTRABLE.
 *
 * El daño. En estas colas hay jornadas con una fila DUPLICADA (la misma pareja dos veces) y, por tanto, una
 * pareja que falta. La fila que se llevó el enlace del acta declara en su cabecera la pareja que falta. Es el
 * defecto de §3.8 de la guía: la extracción de una tabla anidada duplica la fila anterior pero conserva el
 * enlace del acta, así que el acta acaba apuntando a un partido que no es el suyo. Medido el 25/09/2026 en 20
 * grupos bloqueados con «el acta no se corresponde con la fila del calendario».
 *
 * Ejemplo (Castilla y León 21734954, jornada 9):
 *
 *   o0  C.D. Salamanca City F.C. vs C.D. Munibar Pizarrales "B"   ← su acta dice «Alba de Tormes C.F. vs
 *   o1  C.D. Salamanca City F.C. vs C.D. Munibar Pizarrales "B"      C.D. Latino Kukuli», que NO está en J9
 *   o2  C.D. Ribert "B" vs Ciudad Rodrigo C.F. "B"                  y cuyos dos equipos NO juegan otro
 *   o3  Select Generation Academy vs U.D. Santa Marta de Tormes     partido de J9: es la pareja que falta
 *
 * Cuándo se repara, y sólo entonces (la prueba tiene que ser completa):
 *
 *   1. la pareja que declara el acta no está en NINGUNA otra fila de esa jornada;
 *   2. ninguno de los dos equipos del acta juega otro partido de esa jornada;
 *   3. la pareja de la fila está DUPLICADA en esa jornada (por eso falta la otra);
 *   4. los dos equipos del acta pertenecen al grupo (el acta no es de otro grupo).
 *
 * Entonces la fila toma la pareja del acta y sus códigos de equipo se ponen a NULL, porque los que tenía eran
 * de la pareja equivocada. Si alguna condición no se cumple, la fila NO se toca y se dice por qué: preferimos
 * un grupo bloqueado y visible a un calendario inventado.
 *
 * Uso:
 *   node scripts/repara-filas-desplazadas.mjs --federacion castilla-leon            · dice qué haría
 *   node scripts/repara-filas-desplazadas.mjs --federacion castilla-leon --aplicar
 *   node scripts/repara-filas-desplazadas.mjs --federacion ceuta --grupo 21876096 --json
 */
import { appendFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'filas-desplazadas.json');
const DIARIO = join(RAIZ, 'pruebas', 'reconstruccion', 'reparaciones-filas.jsonl');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const aplicar = argumentos.includes('--aplicar');
const quiereJson = argumentos.includes('--json');
const federacionPedida = arg('federacion');
const grupoPedido = arg('grupo');

/** El nombre normalizado, igual que el del canónico: sin tildes, sin signos, minúsculas. */
const normaliza = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Las colas del repositorio, con el nombre de federación que se deduce del directorio. */
const FEDERACIONES = (() => {
  const lista = [];
  for (const nombre of readdirSync(RAIZ)) {
    if (!nombre.startsWith('descargas-')) continue;
    const federacion = nombre === 'descargas-federacion' ? 'castilla-leon' : nombre.replace('descargas-', '');
    const ruta = join(RAIZ, nombre, 'recolector-local', 'cola-v2.sqlite');
    if (existsSync(ruta)) lista.push({ federacion, ruta });
  }
  return lista;
})();

/** La pareja que declara un acta, leída de su columna `datos`. */
function parejaDelActa(datos) {
  try {
    const j = JSON.parse(String(datos ?? ''));
    if (j === null || typeof j !== 'object') return null;
    const local = String(j.local ?? '').trim();
    const visitante = String(j.visitante ?? '').trim();
    return local !== '' && visitante !== '' ? { local, visitante } : null;
  } catch { return null; }
}

const plan = [];
for (const { federacion, ruta } of FEDERACIONES) {
  if (federacionPedida !== null && federacion !== federacionPedida) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const grupos = grupoPedido !== null
    ? [grupoPedido]
    : db.prepare('select distinct grupo from partidos').all().map((f) => f.grupo);

  for (const grupo of grupos) {
    const filas = db.prepare(`select jornada, orden, local, visitante, codigo_acta, temporada, competicion
      from partidos where grupo = ? and local is not null and visitante is not null order by jornada, orden`).all(grupo);
    if (filas.length === 0) continue;
    const actas = new Map(db.prepare('select codigo, datos from actas where grupo = ?').all(grupo).map((a) => [String(a.codigo), a]));

    /* Los equipos del grupo: los que cita su calendario. Un acta de otro ámbito no se usa aquí. */
    const equiposDelGrupo = new Set();
    for (const f of filas) { equiposDelGrupo.add(normaliza(f.local)); equiposDelGrupo.add(normaliza(f.visitante)); }

    /* Cómo está repartida cada jornada: parejas, equipos y las filas mismas. */
    const porJornada = new Map();
    for (const f of filas) {
      const j = porJornada.get(f.jornada) ?? { parejas: new Map(), equipos: new Map(), filas: [] };
      const clave = `${normaliza(f.local)}|${normaliza(f.visitante)}`;
      j.parejas.set(clave, (j.parejas.get(clave) ?? 0) + 1);
      for (const lado of [f.local, f.visitante]) {
        const k = normaliza(lado);
        j.equipos.set(k, (j.equipos.get(k) ?? 0) + 1);
      }
      j.filas.push(f);
      porJornada.set(f.jornada, j);
    }

    for (const fila of filas) {
      const acta = fila.codigo_acta ? actas.get(String(fila.codigo_acta)) : null;
      if (!acta) continue;
      const declarada = parejaDelActa(acta.datos);
      if (declarada === null) continue;
      const parFila = `${normaliza(fila.local)}|${normaliza(fila.visitante)}`;
      const parActa = `${normaliza(declarada.local)}|${normaliza(declarada.visitante)}`;
      if (parFila === parActa) continue;

      const jornada = porJornada.get(fila.jornada);
      const equiposDelActa = [normaliza(declarada.local), normaliza(declarada.visitante)];
      const otrasFilas = jornada.filas.filter((otra) => otra !== fila);
      const motivos = [];
      /*
       * Las cuatro condiciones, y todas tienen que cumplirse. La primera es la que distingue este daño del
       * ENLACE desplazado: si la pareja del acta ya está en esa jornada, el acta pertenece a ESA otra fila y
       * lo que hay que arreglar es el enlace, no la pareja.
       */
      if (jornada.parejas.has(parActa)) motivos.push('la pareja del acta YA está en esa jornada: el enlace es lo que está desplazado');
      if (equiposDelActa.some((e) => !equiposDelGrupo.has(e))) motivos.push('el acta nombra un equipo que no es del grupo');
      if (equiposDelActa.some((e) => otrasFilas.some((o) => normaliza(o.local) === e || normaliza(o.visitante) === e))) {
        motivos.push('un equipo del acta ya juega otro partido de esa jornada');
      }
      if ((jornada.parejas.get(parFila) ?? 0) < 2) motivos.push('la pareja de la fila NO está duplicada en esa jornada');

      /*
       * ── Y EL ACTA QUE ES DE OTRO PARTIDO, EN OTRA JORNADA ────────────────────────────────────────────
       *
       * Medido el 25/09/2026 en el grupo asturiano 22296395: el acta 25716458 cuelga de J26 o0 y declara
       * «Asunción C.F. A vs Veriña C.F. C», que es el partido de J24 o7 —y ese partido ya tiene SU acta, la
       * 25716443, que declara lo mismo—. O sea: la fuente publicó la misma acta otra vez bajo otra jornada.
       * Entonces lo que sobra es el ENLACE, no la fila: se quita el enlace y el partido entra sin acta, que
       * es la verdad (su acta ya está contada en el partido que le corresponde).
       */
      const filaDeLaPareja = filas.find((otra) => otra !== fila
        && `${normaliza(otra.local)}|${normaliza(otra.visitante)}` === parActa);
      const destino = filaDeLaPareja === undefined ? null : {
        jornada: filaDeLaPareja.jornada, orden: filaDeLaPareja.orden,
        acta: filaDeLaPareja.codigo_acta === null ? null : String(filaDeLaPareja.codigo_acta),
      };
      // La fila es consistente: con su pareja, ningún equipo juega dos veces en esa jornada.
      const parejaConsistente = [normaliza(fila.local), normaliza(fila.visitante)]
        .every((e) => !otrasFilas.some((o) => normaliza(o.local) === e || normaliza(o.visitante) === e));
      // Y el partido al que pertenece el acta ya tiene SU acta, que declara la misma pareja: es un duplicado.
      const actaDelDestino = destino?.acta == null ? null : actas.get(String(destino.acta));
      const parDelDestino = actaDelDestino == null ? null : parejaDelActa(actaDelDestino.datos);
      const elDestinoYaLaTiene = parDelDestino !== null
        && `${normaliza(parDelDestino.local)}|${normaliza(parDelDestino.visitante)}` === parActa;
      const desenlazar = destino !== null && destino.acta !== null && parejaConsistente && elDestinoYaLaTiene;

      plan.push({
        federacion, grupo, temporada: fila.temporada, competicion: fila.competicion,
        jornada: fila.jornada, orden: fila.orden, acta: String(fila.codigo_acta),
        filaDice: `${fila.local} vs ${fila.visitante}`,
        actaDice: `${declarada.local} vs ${declarada.visitante}`,
        destino: destino === null ? null : `J${destino.jornada} o${destino.orden}${destino.acta === null ? ' (sin acta)' : ` (con el acta ${destino.acta})`}`,
        reparar: motivos.length === 0, motivos,
        desenlazar,
      });
    }
  }
  db.close();
}

const reparables = plan.filter((p) => p.reparar);
const desenlazables = plan.filter((p) => !p.reparar && p.desenlazar);
const movibles = plan.filter((p) => !p.reparar && !p.desenlazar && p.destino !== null && !p.destino.includes('con el acta'));
const bloqueadas = plan.filter((p) => !p.reparar && !p.desenlazar);
const salida = {
  cuando: new Date().toISOString(),
  resumen: {
    filasConActaQueNoCuadra: plan.length,
    reparables: reparables.length,
    desenlazables: desenlazables.length,
    movibles: movibles.length,
    sinPruebaSuficiente: bloqueadas.length,
    grupos: new Set(plan.map((p) => `${p.federacion}|${p.grupo}`)).size,
    gruposReparables: new Set(reparables.map((p) => `${p.federacion}|${p.grupo}`)).size,
    gruposDesenlazables: new Set(desenlazables.map((p) => `${p.federacion}|${p.grupo}`)).size,
  },
  filas: plan,
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`, 'utf8');

if (quiereJson) {
  console.log(JSON.stringify(salida, null, 1));
} else {
  const r = salida.resumen;
  console.log(`${aplicar ? 'REPARACIÓN' : 'SIMULACIÓN'} de filas que su propio acta contradice`);
  console.log(`  ${r.filasConActaQueNoCuadra} fila(s) con un acta que dice otra pareja`);
  console.log(`  ${r.reparables} con la fila mal (prueba completa) en ${r.gruposReparables} grupo(s)`);
  console.log(`  ${r.desenlazables} con el ENLACE mal y el acta ya contada en su partido, en ${r.gruposDesenlazables} grupo(s)`);
  console.log(`  ${r.movibles} con el enlace a un partido SIN acta: se dice, no se mueve (hay que ajustar la jornada del acta)`);
  console.log(`  ${r.sinPruebaSuficiente} sin prueba suficiente: NO se tocan`);
  for (const p of reparables.slice(0, 10)) {
    console.log(`    · fila  ${p.federacion} g${p.grupo} J${p.jornada} o${p.orden}: «${p.filaDice}» → «${p.actaDice}»`);
  }
  for (const p of desenlazables.slice(0, 10)) {
    console.log(`    · enlace ${p.federacion} g${p.grupo} J${p.jornada} o${p.orden}: su acta ${p.acta} es la de ${p.destino}`);
  }
  const porMotivo = new Map();
  for (const p of bloqueadas) for (const m of p.motivos) porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  if (porMotivo.size > 0) {
    console.log('\n  por qué NO se tocan las demás:');
    for (const [m, n] of [...porMotivo].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)} × ${m}`);
  }
}

if (!aplicar) {
  console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
  console.log('  (simulación: no se ha escrito nada; añade --aplicar para hacerlo)');
} else {
  let hechas = 0;
  let desenlazadas = 0;
  for (const { federacion, ruta } of FEDERACIONES) {
    const mias = reparables.filter((p) => p.federacion === federacion);
    const sueltas = desenlazables.filter((p) => p.federacion === federacion);
    if (mias.length === 0 && sueltas.length === 0) continue;
    const db = new DatabaseSync(ruta);
    db.exec('pragma busy_timeout = 10000');
    const actualiza = db.prepare(`update partidos set local = ?, visitante = ?, equipo_local_codigo = null,
        equipo_visitante_codigo = null, actualizado_en = ? where grupo = ? and jornada = ? and orden = ?`);
    const desenlaza = db.prepare('update partidos set codigo_acta = null, actualizado_en = ? where grupo = ? and jornada = ? and orden = ?');
    const lee = db.prepare('select local, visitante, equipo_local_codigo, equipo_visitante_codigo, codigo_acta from partidos where grupo = ? and jornada = ? and orden = ?');
    for (const p of mias) {
      const antes = lee.get(p.grupo, p.jornada, p.orden);
      db.exec('begin');
      try {
        actualiza.run(p.actaDice.split(' vs ')[0], p.actaDice.split(' vs ')[1], new Date().toISOString(), p.grupo, p.jornada, p.orden);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        console.error(`  ✗ ${p.grupo} J${p.jornada} o${p.orden}: ${error.message}`);
        continue;
      }
      appendFileSync(DIARIO, `${JSON.stringify({ cuando: new Date().toISOString(), accion: 'pareja', ...p, antes })}\n`, 'utf8');
      hechas += 1;
    }
    for (const p of sueltas) {
      const antes = lee.get(p.grupo, p.jornada, p.orden);
      db.exec('begin');
      try {
        desenlaza.run(new Date().toISOString(), p.grupo, p.jornada, p.orden);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        console.error(`  ✗ enlace ${p.grupo} J${p.jornada} o${p.orden}: ${error.message}`);
        continue;
      }
      appendFileSync(DIARIO, `${JSON.stringify({ cuando: new Date().toISOString(), accion: 'desenlace', ...p, antes })}\n`, 'utf8');
      desenlazadas += 1;
    }
    db.close();
  }
  console.log(`\n  ${hechas} fila(s) con la pareja corregida · ${desenlazadas} enlace(s) quitados (su acta ya está en su partido)`);
  console.log(`  diario en ${DIARIO.replace(`${RAIZ}\\`, '')}`);
  console.log('  ahora hay que reimportar los grupos con la pareja corregida.');
  if (desenlazadas > 0) {
    /*
     * Y los del ENLACE quitado necesitan algo más, medido el 25/09/2026 en dos grupos de Castilla y León: el
     * canónico guarda las filas del acta que se acaba de desenlazar (su informe, sus alineaciones y sus
     * eventos colgando del partido equivocado), así que la reimportación falla con «actas analizadas 83≠84».
     * Hay que RETIRAR lo del grupo y reimportarlo:
     *
     *     node scripts/prepara-lote-retirada-grupo.mjs --federacion <f> --grupo <g> --temporada <t>
     *     pnpm importar --retirar <lote.json> --aplicar
     *     pnpm importar --federacion <f> --temporada <t> --grupo <g>
     */
    console.log('  y los del ENLACE quitado, además, hay que RETIRARLOS del canónico antes de reimportar');
    console.log('  (los datos del acta desenlazada siguen colgados del partido: v. la cabecera de esta herramienta)');
  }
}
