#!/usr/bin/env node
// B1 del encargo del 27/10 · ¿ESTÁ FRESCA LA BASE? Compara, federación por federación y temporada por temporada,
// lo que hay en la COLA (lo descargado) con lo que hay en el CANÓNICO (lo importado). SOLO LEE.
//
//   node scripts/frescura-canonico.mjs            → escribe estado/vigia/frescura.txt y frescura.json
//   node scripts/frescura-canonico.mjs --consola  → además lo enseña
//
// Las colas se buscan en `descargas-*/recolector-local/cola-v2.sqlite` (las del PC; las del servidor llegan por
// `copiar-datos`/`extrae`, y si no están, la fila sale con «cola no disponible» en vez de inventar un cero).
// Regla del proyecto: lo que no se sabe es `null`, nunca 0.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const RAIZ = process.cwd();
const DIR = join(RAIZ, 'estado', 'vigia');
mkdirSync(DIR, { recursive: true });
const consola = process.argv.includes('--consola');

function enCanonico() {
  const sql = `
    select f.codigo federacion, se.etiqueta temporada,
           count(*) partidos,
           sum(case when m.goles_local is not null then 1 else 0 end) conResultado,
           sum(case when r.match_id is not null then 1 else 0 end) conActa
      from core.match m
      join core.phase_group pg on pg.id = m.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season se on se.id = ce.season_id
      join core.federation f on f.id = ce.federation_id
      left join core.match_report r on r.match_id = m.id
     group by 1, 2`;
  const salida = execFileSync('docker', ['exec', 'facylf-postgres', 'psql', '-tAF', '|', '-U', 'facylf_admin', '-d', 'facylf', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const mapa = new Map();
  for (const linea of salida.trim().split('\n').filter(Boolean)) {
    const [fed, temp, partidos, conResultado, conActa] = linea.split('|');
    mapa.set(`${fed}|${temp}`, { partidos: Number(partidos), conResultado: Number(conResultado), conActa: Number(conActa) });
  }
  return mapa;
}

function enCola(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
  const filas = db.prepare(`select temporada t, count(*) partidos,
      sum(case when goles_local is not null then 1 else 0 end) conResultado
    from partidos group by 1`).all();
  const actas = db.prepare(`select temporada t, count(*) n from actas where estado = 'hecha' group by 1`).all();
  const mapa = new Map();
  for (const f of filas) mapa.set(etiquetas.get(String(f.t)) ?? String(f.t), { partidos: f.partidos, conResultado: f.conResultado, conActa: 0 });
  for (const a of actas) {
    const k = etiquetas.get(String(a.t)) ?? String(a.t);
    const previo = mapa.get(k) ?? { partidos: 0, conResultado: 0, conActa: 0 };
    mapa.set(k, { ...previo, conActa: a.n });
  }
  db.close();
  return mapa;
}

const canonico = enCanonico();
const lineas = [];
function anota(fed, temp, cola, can) {
  const c = cola ?? null;
  const k = can ?? null;
  const dif = (a, b) => (a == null || b == null ? null : a - b);
  const difPartidos = dif(c?.partidos, k?.partidos);
  const difActas = dif(c?.conActa, k?.conActa);
  const pct = c?.partidos && difPartidos !== null ? (100 * Math.abs(difPartidos)) / c.partidos : null;
  lineas.push({ federacion: fed, temporada: temp, colaPartidos: c?.partidos ?? null, canonicoPartidos: k?.partidos ?? null,
    colaActas: c?.conActa ?? null, canonicoActas: k?.conActa ?? null, difPartidos, difActas,
    pctDiferencia: pct === null ? null : Number(pct.toFixed(1)), alDia: pct !== null && pct < 2 });
}

const colas = readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).map((d) => join(RAIZ, d, 'recolector-local', 'cola-v2.sqlite')).filter((p) => existsSync(p));
const vistas = new Set();
for (const ruta of colas) {
  const fed = basename(join(ruta, '..', '..')).replace('descargas-', '');
  const cola = enCola(ruta);
  for (const [temp, c] of [...cola].sort((a, b) => b[0].localeCompare(a[0]))) {
    anota(fed, temp, c, canonico.get(`${fed}|${temp}`));
    vistas.add(`${fed}|${temp}`);
  }
}
// Lo que está en el canónico y no tiene cola en este PC (las del servidor, si no se han traído).
for (const [clave, k] of canonico) {
  if (vistas.has(clave)) continue;
  const [fed, temp] = clave.split('|');
  anota(fed, temp, null, k);
}

lineas.sort((a, b) => a.federacion.localeCompare(b.federacion) || b.temporada.localeCompare(a.temporada));
const cabecera = 'federación            temporada  cola: partidos/actas   canónico: partidos/actas   dif.partidos  dif.actas  %dif   ¿al día?';
const texto = [cabecera, ...lineas.map((l) => [
  String(l.federacion).padEnd(20), String(l.temporada).padEnd(9),
  `${String(l.colaPartidos ?? '—').padStart(7)}/${String(l.colaActas ?? '—').padEnd(7)}`,
  `${String(l.canonicoPartidos ?? '—').padStart(9)}/${String(l.canonicoActas ?? '—').padEnd(8)}`,
  String(l.difPartidos ?? '—').padStart(11), String(l.difActas ?? '—').padStart(9),
  String(l.pctDiferencia ?? '—').padStart(6), l.alDia ? '  sí' : (l.colaPartidos === null ? '  sin cola' : '  NO'),
].join(' '))].join('\n');
writeFileSync(join(DIR, 'frescura.txt'), `${texto}\n`);
writeFileSync(join(DIR, 'frescura.json'), JSON.stringify({ generado: new Date().toISOString(), filas: lineas }, null, 1));
const atrasadas = lineas.filter((l) => l.alDia === false && l.colaPartidos !== null);
console.log(`${lineas.length} filas federación×temporada · ${atrasadas.length} con más del 2 % de diferencia`);
for (const l of atrasadas.slice(0, 15)) console.log(`  ${l.federacion} ${l.temporada}: cola ${l.colaPartidos} vs canónico ${l.canonicoPartidos} (${l.pctDiferencia}%)`);
if (consola) console.log(`\n${texto}`);
