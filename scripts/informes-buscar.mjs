#!/usr/bin/env node
/*
 * Buscador de informes por línea de comandos.
 *
 * Es la puerta de entrada «sin web» a las mismas consultas que usa la página: sirve para comprobar que el
 * buscador encuentra lo que debe y para documentar la consulta exacta que se hace.
 *
 *   node scripts/informes-buscar.mjs --filtros
 *   node scripts/informes-buscar.mjs --texto pizarrales --temporada 2025-26 --categoria juvenil
 *   node scripts/informes-buscar.mjs pizarrales            (una palabra suelta es el texto)
 *   node scripts/informes-buscar.mjs --texto "victoria" --federacion castilla-leon
 *   node scripts/informes-buscar.mjs --equipo 8873          (todo lo que necesita el generador)
 *   node scripts/informes-buscar.mjs --cobertura            (qué temporadas están completas)
 */
import { abreCanonico, buscarEquipos, catalogoDeFiltros, contextoDeEquipo, estadoDeCobertura } from './lib/informes-consulta.mjs';

try { process.loadEnvFile('.env'); } catch { /* puede venir del entorno */ }
const args = process.argv.slice(2);
const arg = (n, d = null) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
/*
 * ── NINGÚN ARGUMENTO SE IGNORA EN SILENCIO (11/10/2026) ───────────────────────────────────────────────
 * Antes sólo se leía `--texto`: `informe:buscar rioja`, `… ARRUBAL` y `… CALZADA` devolvían la MISMA lista (la
 * búsqueda sin texto), sin ningún aviso, y parecía que el buscador no filtraba. Ahora una palabra suelta es el
 * texto a buscar, y una opción desconocida para con un error en vez de no hacer nada.
 */
const CON_VALOR = new Set(['texto', 'temporada', 'categoria', 'federacion', 'limite', 'equipo']);
const SIN_VALOR = new Set(['filtros', 'cobertura', 'con-vacios']);
const sueltas = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) { sueltas.push(a); continue; }
  const nombre = a.slice(2);
  if (CON_VALOR.has(nombre)) { i++; continue; }
  if (SIN_VALOR.has(nombre)) continue;
  console.error(`Opción desconocida: ${a}. Válidas: ${[...CON_VALOR].map((n) => `--${n} <valor>`).join(', ')}, ${[...SIN_VALOR].map((n) => `--${n}`).join(', ')}.`);
  process.exit(2);
}
if (sueltas.length && arg('texto') !== null) {
  console.error(`Sobra «${sueltas.join(' ')}»: ya se ha dado --texto. Usa una de las dos formas.`);
  process.exit(2);
}
const textoBuscado = arg('texto', sueltas.join(' '));

const url = process.env.DATABASE_URL_LECTOR;
if (!url) {
  console.error('Falta DATABASE_URL_LECTOR (míralo en .env).');
  process.exit(2);
}
const c = await abreCanonico(url);

try {
  if (args.includes('--filtros')) {
    console.log(JSON.stringify(await catalogoDeFiltros(c), null, 2));
  } else if (args.includes('--cobertura')) {
    const filas = await estadoDeCobertura(c, { federacion: arg('federacion', '') });
    console.log('Grupos que entran en un informe (certificado de cobertura del grupo, igual que el generador):');
    console.log('temporada   ediciones   grupos  certificados      %  en-curso  sin-certificar');
    for (const f of filas) {
      const pct = f.grupos ? Math.round(100 * f.certificados / f.grupos) : 0;
      console.log(`${String(f.etiqueta).padEnd(11)} ${String(f.ediciones).padStart(9)} ${String(f.grupos).padStart(8)} ${String(f.certificados).padStart(13)} ${String(pct).padStart(5)} %${String(f.en_curso).padStart(9)} ${String(f.sin_certificar).padStart(15)}`);
    }
  } else if (arg('equipo')) {
    const ctx = await contextoDeEquipo(c, Number(arg('equipo')));
    if (!ctx) {
      console.error(`No existe la inscripción ${arg('equipo')}.`);
      process.exit(1);
    }
    console.log(JSON.stringify(ctx, null, 2));
    console.log('\n--- lo que se le pasaría al generador ---');
    console.log(`  --equipo ${ctx.inscripcion} --anterior ${ctx.anterior?.id ?? 0} --temporada ${ctx.temporadaId}`);
    console.log(`  --titulo "${ctx.equipo} · ${ctx.categoria}" --slug ${ctx.slug}`);
    console.log(`  --mayores "${(ctx.mayores ?? []).map((m) => `${m.id}:${m.equipo} ${m.competicion} ${m.etiqueta}`.replaceAll(',', ' ')).join(',') || '0:Sin equipo de categoría superior localizado'}"`);
  } else {
    const equipos = await buscarEquipos(c, {
      texto: textoBuscado,
      temporada: arg('temporada', ''),
      categoria: arg('categoria', ''),
      federacion: arg('federacion', ''),
      soloConDatos: !args.includes('--con-vacios'),
      limite: Number(arg('limite', 40)),
    });
    console.log('inscr    temporada  categoria     competicion                            grupo                cobertura                 jug  partidos');
    for (const e of equipos) {
      console.log(`${String(e.inscripcion).padStart(6)}  ${String(e.temporada).padEnd(9)} ${String(e.categoria).padEnd(13)} ${String(e.competicion).slice(0, 36).padEnd(38)} ${String(e.grupo).slice(0, 18).padEnd(20)} ${String(e.cobertura.texto).slice(0, 22).padEnd(24)} ${String(e.jugadores).padStart(4)} ${String(e.con_resultado + '/' + e.partidos_grupo).padStart(9)}`);
    }
    console.log(`\n${equipos.length} resultado(s)${textoBuscado ? ` para «${textoBuscado}»` : ' (sin texto: todos los equipos de los filtros)'}`
      + ` · federación ${arg('federacion') ?? 'castilla-leon (por defecto; --federacion <código> o todas)'}`
      + ` · temporada ${arg('temporada') ?? 'la vigente (por defecto; --temporada AAAA-AA o todas)'}`
      + ' · solo grupos con cobertura certificada desde 2021-22.');
    console.log('Ojo: esto busca equipos para informes; NO sirve para comprobar qué se ha importado (para eso, scripts/claude/canonico-por-federacion.mjs).');
    if (equipos.length === 0) console.log('Prueba con --texto vacío para ver todo, o revisa los filtros.');
  }
} finally {
  await c.end();
}
