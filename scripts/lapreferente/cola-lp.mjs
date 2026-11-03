/**
 * L3b · Lo que la federación NO tiene (externo.lp_emparejado = 'sin_contraparte') → una cola SQLite con el formato
 * de recolector-local, para importarla con el importador de siempre y la marca de procedencia:
 *
 *   node scripts/lapreferente/cola-lp.mjs --federacion cataluna --temporada 2018-19
 *   $env:FACYLF_ORIGEN = 'lapreferente'
 *   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion cataluna `
 *     -Temporada 2018-19 -Paquete _traspaso\lapreferente\cataluna-2018-19.sqlite
 *
 * Todos los códigos llevan «lp» delante (competición, grupo, equipo, acta y jugador): nunca chocan con los de la
 * federación, y el importador (con FACYLF_ORIGEN=lapreferente) marca la edición con origen = 'lapreferente'.
 * Las alineaciones y eventos se escriben con guardaActaEstructura, el mismo código que usa el recolector.
 * Claude, 26/10/2026.
 */
import { existsSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { abreBase, guardaActaEstructura } from '../lib/recolector-local.mjs';
import { CATEGORIAS_LP } from '../multideporte/adaptadores/lapreferente-federado.mjs';
import { pg, urlBase, RAIZ } from './lib.mjs';

const slug = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PALABRA_CATEGORIA = { aficionados: '', juvenil: 'Juvenil', cadete: 'Cadete', infantil: 'Infantil', alevin: 'Alevín', benjamin: 'Benjamín', prebenjamin: 'Prebenjamín', veteranos: 'Veteranos' };

/** El nombre que verá el importador: el de LP más la categoría y la modalidad, que LP no pone en el nombre. */
export function nombreParaImportador(c) {
  const cat = CATEGORIAS_LP[c.categoria_lp] ?? {};
  const partes = [c.nombre];
  const palabra = PALABRA_CATEGORIA[cat.categoria] ?? '';
  if (palabra && !new RegExp(palabra, 'i').test(c.nombre)) partes.push(palabra);
  if (cat.genero === 'femenina' && !/femen/i.test(c.nombre)) partes.push('Femenino');
  if (c.deporte === 'sala' && !/sala/i.test(c.nombre)) partes.push('Fútbol Sala');
  return partes.join(' ');
}

const codigoEquipo = (id, nombre) => `lp${id ?? 'x'}-${slug(nombre)}`;

/** La ficha de externo → el objeto que espera guardaActaEstructura. */
export function parseadaDesdeFicha(participaciones, eventos) {
  const nombreDe = new Map(participaciones.map((p) => [String(p.jugador_lp_id), p.nombre || p.alias]));
  const lineups = { local: { titulares: [], suplentes: [] }, visitante: { titulares: [], suplentes: [] } };
  const tecnicos = [];
  for (const p of [...participaciones].sort((a, b) => a.orden - b.orden)) {
    if (!p.lado) continue;
    const persona = { nombre: p.nombre || p.alias, dorsal: p.dorsal ?? null, codigoJugador: p.jugador_lp_id ? `lpJ${p.jugador_lp_id}` : null };
    if (p.condicion === 'titular') lineups[p.lado].titulares.push(persona);
    else if (p.condicion === 'suplente') lineups[p.lado].suplentes.push(persona);
    else tecnicos.push({ lado: p.lado, rol: p.rol || 'Técnico', nombre: p.nombre || p.alias });
  }
  const goles = [];
  const tarjetas = [];
  const cambios = [];
  const ordenados = [...eventos].sort((a, b) => a.orden - b.orden);
  for (const e of ordenados) {
    const jugador = nombreDe.get(String(e.jugador_lp_id)) ?? null;
    if (e.tipo === 'gol') {
      // En externo el lado del gol es el BENEFICIADO; el importador quiere el del goleador (y le da la vuelta él).
      const subtipo = e.subtipo ?? 'normal';
      const lado = subtipo === 'propia-puerta' ? ({ local: 'visitante', visitante: 'local' })[e.lado] ?? null : e.lado;
      goles.push({ jugador, minuto: e.minuto, lado, tipo: subtipo, ladoBeneficiado: e.lado ?? undefined });
    }
    else if (e.tipo === 'amarilla') tarjetas.push({ tipo: 'amarilla', jugador, minuto: e.minuto, lado: e.lado });
    else if (e.tipo === 'roja') {
      // LP pone la doble amarilla como «roja»: si el mismo jugador ya tenía una amarilla antes, es doble amarilla.
      const antes = ordenados.some((x) => x.tipo === 'amarilla' && String(x.jugador_lp_id) === String(e.jugador_lp_id) && (x.minuto ?? 0) <= (e.minuto ?? 999));
      tarjetas.push({ tipo: antes ? 'doble-amarilla' : 'roja', jugador, minuto: e.minuto, lado: e.lado });
    } else if (e.tipo === 'cambio') {
      cambios.push({ saliente: jugador, entrante: nombreDe.get(String(e.entra_lp_id)) ?? null, minuto: e.minuto, lado: e.lado });
    }
  }
  return { lineups, tecnicos, goles, tarjetas, cambios };
}

/** Escribe la cola. `datos`: { temporada, competiciones: [{ comp, partidos, participaciones, eventos }] }. */
export function construyeCola(ruta, { temporada, competiciones }) {
  const cola = abreColaLp(ruta, temporada);
  for (const c of competiciones) cola.escribe(c);
  return cola.cierra();
}

/**
 * La cola de una temporada, de competición en competición (para no tener una temporada entera en memoria:
 * Cataluña son ~1.500 competiciones y, con fichas, millones de filas de alineación).
 */
export function abreColaLp(ruta, temporada) {
  const temporal = `${ruta}.construyendo`;
  // Restos de una pasada que se cortó: se empieza de cero (si no, «insert or ignore» mezclaría lo viejo).
  for (const sufijo of ['', '-wal', '-shm']) rmSync(`${temporal}${sufijo}`, { force: true });
  const db = abreBase(temporal);
  const t = `lp${temporada.slice(0, 4)}`;
  const ahora = new Date().toISOString();
  db.prepare('insert or ignore into temporadas(codigo, etiqueta, origen, comprobada_en) values (?,?,?,?)').run(t, temporada, 'lapreferente', ahora);
  db.prepare("insert or replace into metadatos(clave, valor) values ('origen', 'lapreferente')").run();
  const resumen = { competiciones: 0, partidos: 0, actas: 0, jugadores: 0, eventos: 0 };
  const escribe = ({ comp, partidos, participaciones, eventos }) => {
    const c = `lp${comp.id}`;
    db.prepare('insert or ignore into competiciones(temporada, codigo, nombre, origen, comprobada_en, grupos_comprobados_en) values (?,?,?,?,?,?)')
      .run(t, c, nombreParaImportador(comp), 'lapreferente', ahora, ahora);
    const jornadas = [...new Set(partidos.map((p) => Number(p.jornada)))].sort((a, b) => a - b);
    db.prepare('insert or ignore into grupos(temporada, competicion, codigo, nombre, estado, jornadas, comprobado_en, jornadas_comprobadas_en) values (?,?,?,?,?,?,?,?)')
      .run(t, c, c, comp.grupo || 'Grupo Único', 'presente', jornadas.length, ahora, ahora);
    for (const j of jornadas) {
      const fechas = partidos.filter((p) => Number(p.jornada) === j).map((p) => p.fecha).filter(Boolean).map((f) => String(f).slice(0, 10)).sort();
      db.prepare('insert or ignore into jornadas(temporada, competicion, grupo, numero, fecha, comprobada_en) values (?,?,?,?,?,?)').run(t, c, c, j, fechas[0] ?? null, ahora);
    }
    const orden = new Map();
    for (const p of [...partidos].sort((a, b) => a.jornada - b.jornada || String(a.clave).localeCompare(String(b.clave)))) {
      const n = (orden.get(p.jornada) ?? 0) + 1;
      orden.set(p.jornada, n);
      const el = codigoEquipo(p.local_id, p.local_nombre);
      const ev = codigoEquipo(p.visitante_id, p.visitante_nombre);
      for (const [codigo, nombre] of [[el, p.local_nombre], [ev, p.visitante_nombre]]) {
        db.prepare('insert or ignore into equipos(temporada, codigo, nombre, primera_jornada) values (?,?,?,?)').run(t, codigo, nombre, p.jornada);
      }
      const suyas = participaciones.filter((x) => x.partido_clave === p.clave);
      const susEventos = eventos.filter((x) => x.partido_clave === p.clave);
      const acta = suyas.length ? `lp${p.clave}` : null;
      db.prepare(`insert or replace into partidos(temporada, competicion, grupo, jornada, orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo,
          local, visitante, goles_local, goles_visitante, fecha, hora, campo, campo_codigo, arbitro, actualizado_en)
        values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(t, c, c, p.jornada, n, acta, el, ev, p.local_nombre, p.visitante_nombre,
        p.goles_local ?? null, p.goles_visitante ?? null, p.fecha ? String(p.fecha).slice(0, 10) : null, null, p.estadio ?? null,
        p.estadio_lp_id ? `lp${p.estadio_lp_id}` : null, p.arbitro ?? null, ahora);
      resumen.partidos += 1;
      if (!acta) continue;
      const menores = suyas.some((x) => x.menores);
      const titularesPorLado = ['local', 'visitante'].map((l) => suyas.filter((x) => x.lado === l && x.condicion === 'titular').length);
      const calidad = titularesPorLado.every((n) => n > 0) ? 'correcta' : 'parcial';
      db.prepare(`insert or replace into actas(codigo, temporada, competicion, grupo, jornada, menores, estado, archivo, hash, datos, comprobada_en, version_parser, calidad, incidencias)
        values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(acta, t, c, c, p.jornada, menores ? 1 : 0, 'hecha', null, null,
        JSON.stringify({ local: p.local_nombre, visitante: p.visitante_nombre, golesLocal: p.goles_local, golesVisitante: p.goles_visitante, fuente: 'lapreferente', clave: p.clave }),
        ahora, 1, calidad, JSON.stringify(['fuente:lapreferente']));
      const r = guardaActaEstructura(db, { temporada: t, competicion: c, grupo: c, jornada: p.jornada, acta }, { menores }, parseadaDesdeFicha(suyas, susEventos));
      resumen.actas += 1; resumen.jugadores += r.jugadores; resumen.eventos += r.eventos;
    }
    resumen.competiciones += 1;
  };
  const cierra = () => { db.close(); renameSync(temporal, ruta); return resumen; };
  return { escribe, cierra, resumen };
}

/** Lo que hay que proyectar de una federación y temporada, de competición en competición (generador). */
export async function* sinContraparte(cliente, { federacion, temporada }) {
  const comps = (await cliente.query(`select c.* from externo.lp_competicion c join core.federation f on f.id = c.federation_id
      join externo.lp_emparejado e on e.competicion_id = c.id
     where f.codigo = $1 and c.temporada = $2 and e.estado = 'sin_contraparte' order by c.id`, [federacion, temporada])).rows;
  for (const comp of comps) {
    const partidos = (await cliente.query('select * from externo.lp_partido where competicion_id = $1', [comp.id])).rows;
    const claves = partidos.map((p) => p.clave);
    const participaciones = (await cliente.query('select * from externo.lp_participacion where partido_clave = any($1)', [claves])).rows;
    const eventos = (await cliente.query('select * from externo.lp_evento where partido_clave = any($1)', [claves])).rows;
    yield { comp, partidos, participaciones, eventos };
  }
}

/** Lo mismo, todo junto (para pruebas y temporadas pequeñas). */
export async function leeSinContraparte(cliente, opciones) {
  const salida = [];
  for await (const c of sinContraparte(cliente, opciones)) salida.push(c);
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
  if (process.argv.includes('--pendientes')) {
    // Una línea por federación y temporada con competiciones «sin_contraparte» (para ciclo-lapreferente.ps1 -Todas).
    const { Client } = pg();
    const cliente = new Client({ connectionString: urlBase() });
    await cliente.connect();
    try {
      const filas = (await cliente.query(`select f.codigo federacion, c.temporada, count(*)::int n
          from externo.lp_competicion c join core.federation f on f.id = c.federation_id
          join externo.lp_emparejado e on e.competicion_id = c.id
         where e.estado = 'sin_contraparte' group by 1, 2 order by 1, 2`)).rows;
      for (const r of filas) console.log(`${r.federacion} ${r.temporada} ${r.n}`);
    } finally { await cliente.end(); }
    process.exit(0);
  }
  const federacion = arg('federacion');
  const temporada = arg('temporada');
  if (!federacion || !/^\d{4}-\d{2}$/.test(temporada ?? '')) throw new Error('Uso: --federacion <codigo> --temporada AAAA-AA');
  const salida = fileURLToPath(new URL(arg('salida') ?? `_traspaso/lapreferente/${federacion}-${temporada}.sqlite`, RAIZ));
  // Se rehace entera cada vez (construyeCola escribe aparte y sustituye al final): la anterior no hace falta.
  const { Client } = pg();
  const cliente = new Client({ connectionString: urlBase() });
  await cliente.connect();
  let cola = null;
  try {
    for await (const c of sinContraparte(cliente, { federacion, temporada })) {
      cola ??= abreColaLp(salida, temporada);
      cola.escribe(c);
    }
  } finally { await cliente.end(); }
  if (!cola) { console.log(`Nada que proyectar de ${federacion} ${temporada} (ninguna competición «sin_contraparte»).`); process.exit(0); }
  console.log(`Cola de LP para ${federacion} ${temporada}:`, cola.cierra(), '→', salida);
  console.log(`Importar:\n  $env:FACYLF_ORIGEN = 'lapreferente'\n  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\importar-temporada.ps1 -Federacion ${federacion} -Temporada ${temporada} -Paquete ${salida}`);
}
