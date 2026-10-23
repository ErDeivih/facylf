/**
 * Lector de las actas PDF de balonmano de iSquad (`acta_completa_pdf.php?id_partido=N`, generadas con TCPDF).
 *
 * No hace falta ninguna librería de PDF: TCPDF escribe cada texto como `BT x y Td [(texto)] TJ ET` con fuentes
 * estándar (Helvetica, WinAnsi), dentro de flujos comprimidos con Flate. Se descomprimen con zlib, se sacan los
 * textos con su posición y el acta se reconstruye por coordenadas: la cabecera «Nº · NOMBRE Y APELLIDOS · G · A ·
 * 2 · 2 · D · DD» da la columna de cada dato para el local (mitad izquierda) y el visitante (mitad derecha).
 *
 * Columnas: G = goles; A = amonestación (minuto); 2 y 2 = exclusiones de 2 minutos (minuto de cada una); D =
 * descalificación (minuto); DD = descalificación con informe. «*» junto al dorsal = cupo adicional.
 * Medido el 05/10/2026 contra un acta real: la suma de goles por jugador coincide con el marcador (27-18).
 *
 * Desde el 05/10/2026 se leen todos los jugadores, también en categorías de menores (decisión de David: instancia
 * privada, como en las federaciones); `menores` marca el acta para que la capa que publique no los enseñe.
 */
import { inflateSync } from 'node:zlib';

const WIN1252 = new TextDecoder('windows-1252');

/** Texto de una cadena PDF literal «(…)» con sus escapes. */
function cadena(lit) {
  const bytes = [];
  for (let i = 0; i < lit.length; i += 1) {
    const c = lit[i];
    if (c !== '\\') { bytes.push(lit.charCodeAt(i) & 0xff); continue; }
    const n = lit[i + 1];
    if (/[0-7]/.test(n)) { const o = /^[0-7]{1,3}/.exec(lit.slice(i + 1))[0]; bytes.push(parseInt(o, 8) & 0xff); i += o.length; continue; }
    const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[n];
    bytes.push(esc ?? n.charCodeAt(0)); i += 1;
  }
  return WIN1252.decode(Uint8Array.from(bytes));
}

/** Textos con posición de todas las páginas: [{ x, y, t }]. */
export function textosDelPdf(bruto) {
  const s = bruto.toString('latin1');
  const salida = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const desde = m.index + m[0].length;
    const hasta = s.indexOf('endstream', desde);
    if (hasta < 0) break;
    const dic = s.slice(Math.max(0, s.lastIndexOf('<<', m.index)), m.index);
    let contenido;
    try { contenido = /FlateDecode/.test(dic) ? inflateSync(bruto.subarray(desde, hasta)).toString('latin1') : s.slice(desde, hasta); }
    catch { continue; }
    for (const t of contenido.matchAll(/BT\s+([\d.]+)\s+([\d.]+)\s+Td\s*\[\s*(\((?:\\.|[^\\)])*\)|<[0-9a-fA-F]*>)\s*\]\s*TJ\s*ET/g)) {
      const crudo = t[3];
      const texto = crudo.startsWith('(') ? cadena(crudo.slice(1, -1)) : WIN1252.decode(Buffer.from(crudo.slice(1, -1), 'hex'));
      if (texto.trim()) salida.push({ x: Number(t[1]), y: Number(t[2]), t: texto.trim() });
    }
    re.lastIndex = hasta;
  }
  return salida;
}

const RE_MENORES = /\b(pre-?benjam[ií]n|benjam[ií]n|alev[ií]n|infantil|cadete|juvenil|minibalonmano|escolar|sub-?\s?(?:[6-9]|1[0-8]))\b/i;
const minuto = (v) => (/^\d{1,3}:\d{2}$/.test(v ?? '') ? v : null);

/** El acta entera, o null si el PDF no es un acta (o viene vacía). */
export function leeActaBalonmano(bruto) {
  const items = textosDelPdf(bruto);
  if (!items.length) return null;
  const busca = (re) => items.find((i) => re.test(i.t));
  const cab = items.filter((i) => i.t === 'Nº' || /^NOMBRE Y APELLIDOS$/.test(i.t) || /^(G|A|2|D|DD)$/.test(i.t));
  const filaCab = items.find((i) => i.t === 'Nº');
  if (!filaCab) return null;
  const yCab = filaCab.y;
  const enCab = cab.filter((i) => Math.abs(i.y - yCab) < 1).sort((a, b) => a.x - b.x);
  const nums = enCab.filter((i) => i.t === 'Nº');
  const mitad = nums.length > 1 ? nums[1].x - 2 : 300;
  const columnas = (lado) => {
    const xs = enCab.filter((i) => (lado === 'L' ? i.x < mitad : i.x >= mitad));
    const nombres = ['dorsal', 'nombre', 'goles', 'amonestacion', 'exclusion1', 'exclusion2', 'descalificacion', 'descalificacion_informe'];
    return xs.map((i, k) => ({ campo: nombres[k], x: i.x }));
  };
  const cols = { L: columnas('L'), V: columnas('V') };
  const yStaff = busca(/^Staff T[ée]cnico$/)?.y ?? 0;
  const filas = new Map();
  for (const i of items.filter((x) => x.y < yCab - 15 && x.y > yStaff + 2)) {
    const y = Math.round(i.y * 10) / 10;
    if (!filas.has(y)) filas.set(y, []);
    filas.get(y).push(i);
  }
  const jugadores = { L: [], V: [] };
  for (const [, celdas] of [...filas.entries()].sort((a, b) => b[0] - a[0])) {
    for (const lado of ['L', 'V']) {
      const mias = celdas.filter((c) => (lado === 'L' ? c.x < mitad : c.x >= mitad));
      if (!mias.length) continue;
      const j = {};
      for (const c of mias) {
        const col = cols[lado].reduce((best, k) => (Math.abs(k.x - c.x) < Math.abs(best.x - c.x) ? k : best), cols[lado][0]);
        if (Math.abs(col.x - c.x) > 10) continue;
        j[col.campo] = c.t;
      }
      const d = /^(\d+)\s*(\*)?$/.exec(j.dorsal ?? '');
      if (!d || !j.nombre) continue;
      jugadores[lado].push({
        dorsal: Number(d[1]), cupo_adicional: Boolean(d[2]), nombre: j.nombre,
        goles: /^\d+$/.test(j.goles ?? '') ? Number(j.goles) : 0,
        amonestacion: minuto(j.amonestacion),
        exclusiones: [minuto(j.exclusion1), minuto(j.exclusion2)].filter(Boolean),
        descalificacion: minuto(j.descalificacion), descalificacion_informe: minuto(j.descalificacion_informe),
      });
    }
  }
  // Equipos y marcador: la fila justo encima de la cabecera (nombre a la izquierda, goles a la derecha de cada mitad).
  const sobre = items.filter((i) => i.y > yCab + 5 && i.y < yCab + 40);
  const equipo = (lado) => {
    const mias = sobre.filter((i) => (lado === 'L' ? i.x < mitad : i.x >= mitad));
    const nombre = mias.filter((i) => !/^\d+$/.test(i.t)).sort((a, b) => a.x - b.x)[0]?.t ?? null;
    const goles = mias.filter((i) => /^\d+$/.test(i.t)).sort((a, b) => b.x - a.x)[0]?.t;
    return { nombre, goles: goles != null ? Number(goles) : null };
  };
  const staff = (lado) => items.filter((i) => i.y < yStaff && i.y > yStaff - 60 && (lado === 'L' ? i.x < mitad : i.x >= mitad))
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .reduce((acc, i) => { if (/^[A-ZÁÉÍÓÚÑ ]+$/.test(i.t) && !i.t.startsWith(':')) acc.push({ rol: i.t, nombre: null }); else if (i.t.startsWith(':') && acc.length) acc.at(-1).nombre = i.t.slice(1).trim(); return acc; }, []);
  const linea = (re) => items.filter((i) => re.test(i.t)).map((i) => i.t.replace(re, '').trim()).filter(Boolean);
  const titulo = busca(/^Temporada\s+\d{4}\/\d{4}/)?.t ?? null;
  const fecha = /(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{1,2}:\d{2})/.exec(busca(/^El \d{2}\/\d{2}\/\d{4}/)?.t ?? '');
  const terreno = items.find((i) => i.t === 'TERRENO DE JUEGO');
  const pabellon = terreno ? items.filter((i) => Math.abs(i.y - terreno.y) < 1 && i.x > terreno.x && i.x < mitad).map((i) => i.t).join(' ') || null : null;
  const local = equipo('L'); const visitante = equipo('V');
  return {
    titulo, temporada: /Temporada\s+(\d{4}\/\d{4})/.exec(titulo ?? '')?.[1] ?? null,
    jornada: Number(/JORNADA\s+(\d+)/.exec(busca(/^JORNADA\s+\d+/)?.t ?? '')?.[1]) || null,
    fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null, hora: fecha?.[4] ?? null, pabellon,
    menores: RE_MENORES.test(titulo ?? ''),
    local: { ...local, jugadores: jugadores.L, tecnicos: staff('L') },
    visitante: { ...visitante, jugadores: jugadores.V, tecnicos: staff('V') },
    arbitros: linea(/^Arbitro:\s*/), delegado_campo: linea(/^Delegado de Campo:\s*/)[0] ?? null,
    // Control: la suma de goles por jugador frente al marcador del acta (si no cuadra, se sabe).
    cuadra: local.goles == null || visitante.goles == null ? null
      : jugadores.L.reduce((s, j) => s + j.goles, 0) === local.goles && jugadores.V.reduce((s, j) => s + j.goles, 0) === visitante.goles,
  };
}
