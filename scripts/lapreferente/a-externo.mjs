/**
 * L2 · Registros de lapreferente-federado (cola del multideporte) → externo.lp_* del canónico. Idempotente.
 *
 *   node scripts/lapreferente/a-externo.mjs [--cola …/lapreferente-federado/cola.sqlite] [--todo] [--tanda 300] [--seco]
 *
 * Sólo escribe en `externo` (no toca core). La cola se abre en sólo lectura: el recolector puede seguir corriendo.
 * Claude, 26/10/2026. Plan: LA-PREFERENTE-PLAN-2026-10-25.md §4.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { abreRegistros, etiquetaTemporada, federacionPrincipal, grupoDeUrlFederacion, federacionesPorHost, pg, urlBase, RAIZ } from './lib.mjs';

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * El lado que se lleva cada gol, por el marcador parcial que LP pone junto a cada goleador: el gol que deja el parcial
 * en a-b sigue al que lo dejó con un gol menos; si sube a, es del local. Sin parcial (o incoherente), null: se usa el
 * encabezado «GOLEADORES <equipo>».
 */
export function ladoBeneficiado(goles) {
  const porSuma = new Map();
  for (const g of goles) if (Array.isArray(g.parcial)) porSuma.set(g.parcial[0] + g.parcial[1], g.parcial);
  return goles.map((g) => {
    if (!Array.isArray(g.parcial)) return null;
    const k = g.parcial[0] + g.parcial[1];
    const antes = k === 1 ? [0, 0] : porSuma.get(k - 1);
    if (!antes) return null;
    if (g.parcial[0] === antes[0] + 1 && g.parcial[1] === antes[1]) return 'local';
    if (g.parcial[1] === antes[1] + 1 && g.parcial[0] === antes[0]) return 'visitante';
    return null;
  });
}

/** Filas para externo a partir de los registros (puro: se prueba sin base). */
export function filasExterno({ competiciones, partidos, fichas }, federacionId = () => null) {
  const hosts = federacionesPorHost();
  const comps = new Map();
  for (const c of competiciones) {
    const id = num(c.id ?? c.clave);
    if (!id) continue;
    const ccaa = c.nacional ? 0 : num(c.ccaa_lp) ?? 0;
    const desdeUrl = grupoDeUrlFederacion(c.url_federacion, hosts);
    // Las nacionales son de la RFEF (fuente «rfef», 27/10/2026), salvo que LP cargue el grupo de la web de una
    // territorial (Tercera Federación, Liga Nacional juvenil): entonces, de esa territorial.
    const federacion = desdeUrl?.federacion ?? (c.nacional ? 'rfef' : federacionPrincipal(ccaa));
    comps.set(id, {
      id, linea_id: num(c.linea), temporada: etiquetaTemporada(c.temporada), ccaa_lp: ccaa,
      deporte: c.modalidad === 'sala' ? 'sala' : c.modalidad === 'playa' ? 'playa' : 'futbol',
      categoria_lp: num(c.categoria_lp), nombre: c.nombre ?? c.nombre_completo ?? `LP ${id}`, division: c.division ?? null,
      grupo: c.grupo ?? null, nacional: Boolean(c.nacional), federation_id: federacion ? federacionId(federacion) : null,
      calendario_leido_en: c.actualizado_en ?? null, _federacion: federacion,
      organizador: c.organizador ?? null, url_federacion: c.url_federacion ?? null, plataforma_federacion: desdeUrl?.plataforma ?? null,
      competicion_federacion: desdeUrl?.competicion ?? null, grupo_federacion: desdeUrl?.grupo ?? null,
    });
  }
  const fichaPor = new Map(fichas.map((f) => [String(f.clave), f]));
  const partidosFilas = [];
  const participaciones = [];
  const eventos = [];
  for (const p of partidos) {
    const comp = comps.get(num(p.competicion));
    if (!comp || !comp.temporada) continue;
    const f = fichaPor.get(String(p.clave)) ?? null;
    partidosFilas.push({
      clave: String(p.clave), partido_id: num(p.partido_id), competicion_id: comp.id, jornada: num(p.jornada),
      fecha: f?.fecha ?? p.fecha_jornada ?? null, local_id: num(p.local?.id), local_nombre: p.local?.nombre ?? '?',
      visitante_id: num(p.visitante?.id), visitante_nombre: p.visitante?.nombre ?? '?',
      goles_local: p.goles_local ?? null, goles_visitante: p.goles_visitante ?? null, marcador_texto: p.marcador_texto ?? null,
      ficha_disponible: Boolean(p.ficha_disponible), ficha_leida_en: f ? (f.actualizado_en ?? null) : null,
      estadio_lp_id: num(f?.estadio?.id), estadio: f?.estadio?.nombre ?? null,
      arbitro_lp_id: num(f?.arbitro?.id), arbitro: f?.arbitro?.nombre ?? null, arbitro_delegacion: f?.arbitro?.delegacion ?? null,
    });
    if (!f) continue;
    const lados = (f.equipos ?? []).slice(0, 2);
    for (const [i, e] of lados.entries()) {
      const lado = i === 0 ? 'local' : 'visitante';
      for (const [condicion, lista] of [['titular', e.titulares], ['suplente', e.suplentes], ['tecnico', e.tecnicos]]) {
        for (const [orden, j] of (lista ?? []).entries()) {
          participaciones.push({ partido_clave: String(p.clave), equipo_lp_id: num(e.id), lado, condicion, orden, jugador_lp_id: num(j.id),
            alias: j.alias ?? null, nombre: j.nombre ?? null, dorsal: num(j.dorsal), rol: j.rol ?? null, menores: Boolean(f.menores) });
        }
      }
    }
    const indice = (n) => lados.findIndex((e) => String(e.nombre ?? '').toUpperCase() === String(n ?? '').toUpperCase());
    const ladoDe = (n) => ({ 0: 'local', 1: 'visitante' })[indice(n)] ?? null;
    const equipoDe = (n) => num(lados[indice(n)]?.id);
    let orden = 0;
    const beneficiado = ladoBeneficiado(f.goles ?? []);
    for (const [i, g] of (f.goles ?? []).entries()) {
      const lado = beneficiado[i] ?? ladoDe(g.equipo);
      eventos.push({ partido_clave: String(p.clave), orden: orden++, tipo: 'gol', subtipo: g.propia ? 'propia-puerta' : g.penalti ? 'penalti' : 'normal',
        minuto: num(g.minuto), equipo_lp_id: lado ? num(lados[lado === 'local' ? 0 : 1]?.id) : equipoDe(g.equipo), lado, jugador_lp_id: num(g.id), entra_lp_id: null });
    }
    for (const t of f.tarjetas ?? []) if (t.tipo) eventos.push({ partido_clave: String(p.clave), orden: orden++, tipo: t.tipo, minuto: num(t.minuto), equipo_lp_id: equipoDe(t.equipo), lado: ladoDe(t.equipo), jugador_lp_id: num(t.id), entra_lp_id: null });
    for (const [i, e] of lados.entries()) for (const c of e.cambios ?? []) eventos.push({ partido_clave: String(p.clave), orden: orden++, tipo: 'cambio', minuto: num(c.minuto), equipo_lp_id: num(e.id), lado: i === 0 ? 'local' : 'visitante', jugador_lp_id: num(c.sale?.id), entra_lp_id: num(c.entra?.id) });
  }
  return { competiciones: [...comps.values()], partidos: partidosFilas, participaciones, eventos };
}

async function upsert(cliente, tabla, filas, columnas, clave, lote = 500) {
  for (let i = 0; i < filas.length; i += lote) {
    const trozo = filas.slice(i, i + lote);
    const valores = [];
    const marcas = trozo.map((f) => `(${columnas.map((c) => { valores.push(f[c] ?? null); return `$${valores.length}`; }).join(',')})`);
    const actualiza = columnas.filter((c) => !clave.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
    await cliente.query(`insert into ${tabla} (${columnas.join(',')}) values ${marcas.join(',')}
      on conflict (${clave.join(',')}) do ${actualiza ? `update set ${actualiza}` : 'nothing'}`, valores);
  }
}

export async function cargaExterno(cliente, filas) {
  const { competiciones, partidos, participaciones, eventos } = filas;
  await cliente.query('begin');
  try {
    await upsert(cliente, 'externo.lp_competicion', competiciones,
      ['id', 'linea_id', 'temporada', 'ccaa_lp', 'deporte', 'categoria_lp', 'nombre', 'division', 'grupo', 'nacional', 'federation_id', 'calendario_leido_en',
        'organizador', 'url_federacion', 'plataforma_federacion', 'competicion_federacion', 'grupo_federacion'], ['id']);
    await upsert(cliente, 'externo.lp_partido', partidos,
      ['clave', 'partido_id', 'competicion_id', 'jornada', 'fecha', 'local_id', 'local_nombre', 'visitante_id', 'visitante_nombre', 'goles_local', 'goles_visitante',
        'marcador_texto', 'ficha_disponible', 'ficha_leida_en', 'estadio_lp_id', 'estadio', 'arbitro_lp_id', 'arbitro', 'arbitro_delegacion'], ['clave']);
    // Las alineaciones y los eventos de una ficha se reescriben enteros: así una ficha corregida no deja restos.
    const conFicha = [...new Set(participaciones.map((p) => p.partido_clave).concat(eventos.map((e) => e.partido_clave)))];
    for (let i = 0; i < conFicha.length; i += 1000) {
      const trozo = conFicha.slice(i, i + 1000);
      await cliente.query('delete from externo.lp_participacion where partido_clave = any($1)', [trozo]);
      await cliente.query('delete from externo.lp_evento where partido_clave = any($1)', [trozo]);
    }
    await upsert(cliente, 'externo.lp_participacion', participaciones,
      ['partido_clave', 'equipo_lp_id', 'lado', 'condicion', 'orden', 'jugador_lp_id', 'alias', 'nombre', 'dorsal', 'rol', 'menores'], ['partido_clave', 'equipo_lp_id', 'condicion', 'orden']);
    await upsert(cliente, 'externo.lp_evento', eventos,
      ['partido_clave', 'orden', 'tipo', 'subtipo', 'minuto', 'equipo_lp_id', 'lado', 'jugador_lp_id', 'entra_lp_id'], ['partido_clave', 'orden']);
    await cliente.query('commit');
  } catch (e) {
    await cliente.query('rollback');
    throw e;
  }
  return { competiciones: competiciones.length, partidos: partidos.length, participaciones: participaciones.length, eventos: eventos.length };
}

/** Da de alta las federaciones que LP cubre y aún no están en core (como lote.ts: buscar primero, crear sólo si falta). */
async function altaFederaciones(cliente, codigos, feds) {
  const faltan = [...new Set(codigos)].filter((f) => f && !feds.has(f));
  if (!faltan.length) return;
  const cfg = JSON.parse(readFileSync(new URL('config/federaciones-espana.json', RAIZ), 'utf8'));
  for (const codigo of faltan) {
    const f = [...(cfg.fuentes ?? []), ...(cfg.nacionales ?? [])].find((x) => x.codigo === codigo);
    if (!f) continue;
    const adaptador = ['pnfg', 'isquad', 'fcf'].includes(f.adaptador) ? f.adaptador : 'ninguno';
    const { rows } = await cliente.query(
      `insert into core.federation (codigo, nombre, adaptador, portal_url) values ($1, $2, $3, $4)
       on conflict (codigo) do nothing returning id`, [codigo, f.nombre, adaptador, f.portal ?? null]);
    const id = rows[0]?.id ?? (await cliente.query('select id from core.federation where codigo = $1', [codigo])).rows[0]?.id;
    if (id !== undefined) { feds.set(codigo, Number(id)); console.log(`Federación dada de alta: ${codigo}`); }
  }
}

/*
 * Por TANDAS de competiciones y en orden de competición, sin cargar la cola entera: con el histórico son ~50.000
 * calendarios y millones de partidos, que en memoria agotarían la RAM del PC. Los partidos y las fichas se leen con
 * dos cursores ordenados por competición (iterate de node:sqlite) y se escriben en externo cada `--tanda` (300).
 * Incremental por defecto: sólo las competiciones cuyo calendario o alguna ficha se ha leído después de lo último
 * que hay en externo (con 1 h de margen). `--todo` lo rehace entero.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const ruta = fileURLToPath(new URL(arg('cola', 'descargas-multideporte/lapreferente-federado/cola.sqlite'), RAIZ));
  const seco = process.argv.includes('--seco');
  const tanda = Number(arg('tanda', 300));
  const { Client } = pg();
  const cliente = new Client({ connectionString: urlBase(), application_name: 'lapreferente-a-externo' });
  await cliente.connect();
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
  if (typeof db.prepare('select 1').iterate !== 'function') throw new Error(`Este Node (${process.version}) no tiene StatementSync.iterate: hace falta 22.13 o más.`);
  try {
    let marcaC = null, marcaF = null;
    if (!process.argv.includes('--todo')) {
      const { rows: [m] } = await cliente.query(`select (select max(calendario_leido_en) from externo.lp_competicion) c,
        (select max(ficha_leida_en) from externo.lp_partido) f`);
      const menos1h = (d) => (d ? new Date(new Date(d).getTime() - 3_600_000).toISOString() : null);
      marcaC = menos1h(m.c); marcaF = menos1h(m.f);
    }
    const A = 'lapreferente-federado';
    const comps = new Map(db.prepare(`select clave, datos, url, actualizado_en from registros where adaptador = ? and tipo = 'competicion'`).all(A)
      .map((r) => { const d = { clave: r.clave, url: r.url, actualizado_en: r.actualizado_en, ...JSON.parse(r.datos) }; return [Number(d.id ?? d.clave), d]; }));
    const objetivo = new Set();
    for (const [id, c] of comps) if (!marcaC || (c.actualizado_en ?? '') > marcaC) objetivo.add(id);
    // Un calendario revisitado puede cambiar sólo sus partidos (resultados nuevos) y no la competición.
    if (marcaC) {
      for (const r of db.prepare(`select distinct cast(json_extract(datos, '$.competicion') as integer) c from registros
          where adaptador = ? and tipo = 'partido' and actualizado_en > ?`).all('lapreferente-federado', marcaC)) objetivo.add(Number(r.c));
    }
    if (marcaF) {
      for (const r of db.prepare(`select cast(json_extract(datos, '$.competicion') as integer) c from registros where adaptador = ? and tipo = 'ficha' and actualizado_en > ?`).all(A, marcaF)) objetivo.add(Number(r.c));
    } else if (marcaC) {
      for (const r of db.prepare(`select distinct cast(json_extract(datos, '$.competicion') as integer) c from registros where adaptador = ? and tipo = 'ficha'`).all(A)) objetivo.add(Number(r.c));
    }
    const ids = [...objetivo].filter((id) => comps.has(id)).sort((a, b) => a - b);
    console.log(`${comps.size} competiciones en la cola; ${ids.length} con algo nuevo${marcaC ? ` desde ${marcaC}` : ' (todo)'}.`);
    const feds = new Map((await cliente.query('select codigo, id from core.federation')).rows.map((f) => [f.codigo, Number(f.id)]));
    if (!seco) await altaFederaciones(cliente, filasExterno({ competiciones: ids.map((id) => comps.get(id)), partidos: [], fichas: [] }).competiciones.map((c) => c._federacion), feds);
    const fedId = (codigo) => feds.get(codigo) ?? null;
    const lista = JSON.stringify(ids);
    const cursor = (tipo) => db.prepare(`select clave, datos, url, actualizado_en, cast(json_extract(datos, '$.competicion') as integer) comp
        from registros where adaptador = ? and tipo = ? and cast(json_extract(datos, '$.competicion') as integer) in (select value from json_each(?))
       order by comp`).iterate(A, tipo, lista)[Symbol.iterator]();
    const curP = cursor('partido');
    const curF = cursor('ficha');
    let sigP = curP.next();
    let sigF = curF.next();
    const total = { competiciones: 0, partidos: 0, participaciones: 0, eventos: 0 };
    const sinFed = new Set();
    for (let i = 0; i < ids.length; i += tanda) {
      const trozo = ids.slice(i, i + tanda);
      const hasta = trozo[trozo.length - 1];
      const partidos = [];
      const fichas = [];
      const fila = (r) => ({ clave: r.clave, url: r.url, actualizado_en: r.actualizado_en, ...JSON.parse(r.datos) });
      while (!sigP.done && Number(sigP.value.comp) <= hasta) { partidos.push(fila(sigP.value)); sigP = curP.next(); }
      while (!sigF.done && Number(sigF.value.comp) <= hasta) { fichas.push(fila(sigF.value)); sigF = curF.next(); }
      const filas = filasExterno({ competiciones: trozo.map((id) => comps.get(id)), partidos, fichas }, fedId);
      // La marca de lectura de cada competición es lo último que cambió de ella (su registro o cualquiera de sus partidos).
      const ultimo = new Map();
      for (const p of partidos) { const k = Number(p.competicion); if ((p.actualizado_en ?? '') > (ultimo.get(k) ?? '')) ultimo.set(k, p.actualizado_en); }
      for (const c of filas.competiciones) if ((ultimo.get(c.id) ?? '') > (c.calendario_leido_en ?? '')) c.calendario_leido_en = ultimo.get(c.id);
      for (const c of filas.competiciones) if (c._federacion && !c.federation_id) sinFed.add(c._federacion);
      const r = seco ? { competiciones: filas.competiciones.length, partidos: filas.partidos.length, participaciones: filas.participaciones.length, eventos: filas.eventos.length }
        : await cargaExterno(cliente, filas);
      for (const k of Object.keys(total)) total[k] += r[k];
      if ((i / tanda) % 20 === 19) console.log(`  … ${Math.min(i + tanda, ids.length)}/${ids.length}`, total);
    }
    if (sinFed.size) console.log(`Aviso: competiciones de federaciones que no están en core.federation (${[...sinFed].join(', ')}).`);
    console.log(seco ? 'Seco: no se escribe.' : 'Escrito en externo:', total);
  } finally {
    db.close();
    await cliente.end();
  }
}
