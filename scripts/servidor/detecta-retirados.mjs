#!/usr/bin/env node
/*
 * ── DETECTOR DE EQUIPOS RETIRADOS ───────────────────────────────────────────────────────────────────────
 *
 * Cuando un equipo se retira a mitad de temporada, sus partidos se quedan en el calendario y **nunca
 * tienen acta**. Hoy eso engorda el contador de «partidos sin acta» y hace pensar que la ingesta falla.
 *
 * La señal más fiable (la propuso Claude el 18/11/2026) no es una palabra en el HTML sino el patrón del
 * calendario: desde una fecha, NINGÚN partido de ese equipo tiene acta mientras sus rivales sí la tienen
 * en esas mismas jornadas. Se exigen al menos 3 jornadas seguidas para no confundirlo con un aplazamiento.
 *
 * Uso:
 *   node scripts/servidor/detecta-retirados.mjs --cola <ruta> [--temporada 2026-27] [--minimo 3] [--json]
 *
 * No modifica nada: sólo informa. La decisión de marcar los partidos se toma después, con la lista delante.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

export const MINIMO_POR_DEFECTO = 3;

/**
 * Decide si un equipo está retirado a partir de sus partidos ya jugados.
 *
 * @param {Array<{fecha: string, tieneActa: boolean, jornada: string}>} partidos
 * @param {number} minimo  jornadas seguidas sin acta que se exigen
 * @returns {{retirado: boolean, sinActa: number, conActa: number, desde: string|null}}
 */
export function analizaEquipo(partidos, minimo = MINIMO_POR_DEFECTO) {
  const jugados = partidos
    .filter((p) => p.fecha != null && p.fecha !== '')
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const sinActa = jugados.filter((p) => !p.tieneActa);
  const conActa = jugados.filter((p) => p.tieneActa);
  if (sinActa.length < minimo) return { retirado: false, sinActa: sinActa.length, conActa: conActa.length, desde: null };

  // Las que faltan tienen que ser las ÚLTIMAS (racha al final), no fallos sueltos en medio.
  const ultimas = jugados.slice(-sinActa.length);
  const rachaFinal = ultimas.every((p) => !p.tieneActa);
  /*
   * Si NUNCA tuvo acta pero el grupo sí las tiene para los demás, también es candidato: el equipo se retiró
   * antes de que se guardara ninguna suya. Comprobado el 18/11/2026 en el grupo 24218948: 90 partidos, 80
   * con acta, y un equipo con sus 10 partidos sin ninguna mientras los otros nueve sí la tienen.
   */
  if (conActa.length === 0) {
    return { retirado: true, sinActa: sinActa.length, conActa: 0, desde: String(jugados[0]?.fecha ?? ''), motivo: 'nunca' };
  }
  if (!rachaFinal) {
    return { retirado: false, sinActa: sinActa.length, conActa: conActa.length, desde: null };
  }
  return { retirado: true, sinActa: sinActa.length, conActa: conActa.length, desde: String(ultimas[0].fecha), motivo: 'despues' };
}

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

function main() {
  const ruta = arg('cola');
  const json = process.argv.includes('--json');
  const minimo = Number(arg('minimo', MINIMO_POR_DEFECTO));
  const temporada = arg('temporada');
  if (!ruta || !existsSync(ruta)) {
    console.error(`No existe la cola: ${ruta ?? '(sin ruta)'}`);
    process.exit(1);
  }
  const db = new DatabaseSync(ruta, { readOnly: true });
  const hoy = new Date().toISOString().slice(0, 10);

  // Todos los partidos ya jugados (fecha pasada) con su equipo local y visitante, y si tienen acta.
  const filas = db.prepare(`
    select p.temporada, p.grupo, p.jornada, p.fecha,
           p.equipo_local_codigo l, p.equipo_visitante_codigo v,
           coalesce(p.codigo_acta, '') acta
      from partidos p
     where p.fecha is not null and p.fecha < ?
       ${temporada ? 'and p.temporada in (select codigo from temporadas where etiqueta = ?)' : ''}
  `).all(hoy, ...(temporada ? [temporada] : []));

  const porEquipo = new Map(); // grupo|equipo -> [partidos]
  for (const f of filas) {
    const tieneActa = f.acta !== '';
    for (const [codigo, lado] of [[f.l, 'l'], [f.v, 'v']]) {
      if (!codigo) continue;
      const clave = `${f.grupo}|${codigo}`;
      if (!porEquipo.has(clave)) porEquipo.set(clave, []);
      porEquipo.get(clave).push({ fecha: f.fecha, jornada: String(f.jornada), tieneActa });
    }
  }

  // Actas por grupo: un equipo sólo es candidato si SU GRUPO tiene actas de otros. Si el grupo entero
  // carece de actas, el problema es de esa competición (no publica actas), no del equipo.
  const actasPorGrupo = new Map();
  for (const f of filas) {
    if (f.acta === '') continue;
    actasPorGrupo.set(f.grupo, (actasPorGrupo.get(f.grupo) ?? 0) + 1);
  }
  const retirados = [];
  for (const [clave, partidos] of porEquipo) {
    const [grupo, equipo] = clave.split('|');
    const a = analizaEquipo(partidos, minimo);
    if (!a.retirado) continue;
    if (a.motivo === 'nunca' && !(actasPorGrupo.get(grupo) > 0)) continue;
    retirados.push({ grupo, equipo, ...a });
  }

  if (json) {
    console.log(JSON.stringify({ cuando: new Date().toISOString(), cola: ruta, candidatos: retirados.length, retirados }, null, 2));
  } else {
    console.log(`EQUIPOS RETIRADOS (candidatos) · ${retirados.length}`);
    for (const r of retirados.slice(0, 40)) {
      console.log(`  grupo ${r.grupo} · equipo ${r.equipo} · ${r.sinActa} partidos sin acta desde ${r.desde} (${r.conActa} con acta antes)`);
    }
    if (retirados.length > 40) console.log(`  ... y ${retirados.length - 40} más`);
  }
  return retirados;
}

if (process.argv[1]?.endsWith('detecta-retirados.mjs')) {
  try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
