/**
 * La Preferente: lectores de CALENDARIO (toda la temporada en una página) y de FICHA DE PARTIDO (el acta).
 *
 * Escrito por Claude el 25/10/2026, probado contra páginas reales en el navegador (ver
 * `docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md` §5). TODAVÍA NO SE USA EN LA RECOGIDA: el adaptador
 * vivo (`lapreferente.mjs`, no federado y veteranos) sigue igual. Estas funciones son para el adaptador nuevo
 * (`lapreferente-historico` / fichas de competiciones nacionales) que monte DeepSeek.
 *
 * Estructura medida (25/10/2026):
 *  · Calendario `index.php?comp={id}&accion=calendario`: una tabla `panelResultados{id}-{jor}` POR JORNADA, con las
 *    mismas filas `<tr id="filaPartido" onClick="window.location='P{partido}C{comp}/…'" title="… Ficha Disponible">`
 *    que la página de jornada. La jornada en curso sale dos veces (div y tabla con el mismo id): se lee una.
 *  · Ficha `P{partido}C{comp}/{temporada}/{local-vs-visitante}`, dentro de `#divDatosPartido`:
 *      - `#datosFichaPartido`: «Fecha: Sábado, 09 De Mayo De 2026 a las 17:30», «Estadio: <a …IDestadio=…>».
 *      - `#tableAlineados{idEquipo}` (uno por equipo): cabecera «TITULARES {EQUIPO}», luego «SUPLENTES» y
 *        «CUERPO TÉCNICO». Fila de jugador: `tdDorsalJugador`, enlace `J{idJugador}C{comp}/…`, alias
 *        (`span.v13…`) y nombre completo (`span.v11…`). El que ENTRA va en la fila siguiente a la del que sale, con
 *        una primera celda «<p></p><p>m.81</p>».
 *      - `#divGoleadoresPartido`: una tabla por equipo («GOLEADORES {EQUIPO}»): jugador, «1 - 0», «Min.12».
 *      - `#divTarjetasPartido`: la tabla del árbitro (`A{id}C{comp}/arbitro/…`, nombre y delegación) y una por
 *        equipo («TARJETAS {EQUIPO}») con `yellowcard.png` / `redcard.png` y «Min.43». El dorsal puede ser una
 *        letra (E, D…) si la tarjeta es para un técnico.
 *  · La doble amarilla sale como roja (tiene su propia fila): al comparar con la federación hay que normalizarlo.
 *  · Codificación ISO-8859-1 (windows-1252), como el resto de la web.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const iso = (f) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f ?? ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const num = (t) => { const m = /-?\d+/.exec(String(t ?? '')); return m ? Number(m[0]) : null; };

/** Trozo de HTML desde la etiqueta con ese id hasta su cierre equilibrado (div o table). */
export function bloquePorId(html, id, etiqueta = null) {
  const re = new RegExp(`<(${etiqueta ?? '[a-z]+'})\\b[^>]*\\bid="${id}"[^>]*>`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const abre = new RegExp(`<${tag}\\b`, 'gi');
  const cierra = new RegExp(`</${tag}>`, 'gi');
  let nivel = 0;
  let i = m.index;
  const marcas = [];
  for (const x of html.slice(i).matchAll(abre)) marcas.push([x.index + i, 1]);
  for (const x of html.slice(i).matchAll(cierra)) marcas.push([x.index + i, -1, x[0].length]);
  marcas.sort((a, b) => a[0] - b[0]);
  for (const [pos, d, largo] of marcas) {
    nivel += d;
    if (nivel === 0) return html.slice(m.index, pos + largo);
  }
  return html.slice(m.index);
}

/** Filas `filaPartido` de un trozo de HTML (jornada o calendario). */
export function filasDePartido(trozo) {
  const out = [];
  for (const f of String(trozo).split(/<tr id="filaPartido"/).slice(1)) {
    const fila = f.slice(0, f.search(/<tr\b/i) > 0 ? f.search(/<tr\b/i) : undefined);
    const eq = [...fila.matchAll(/escudo-(\d+)\.[a-z]+[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g)];
    if (eq.length < 2) continue;
    const res = limpia(/class="v11redb"[^>]*>([\s\S]*?)<\/td>/.exec(fila)?.[1] ?? '');
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(res);
    const ficha = /window\.location='(P(\d+)C(\d+)\/[^']*)'/.exec(fila);
    const titulo = decodificaEntidades(/title="([^"]*)"/.exec(fila)?.[1] ?? '');
    out.push({
      local: { id: eq[0][1], nombre: limpia(eq[0][2]) },
      visitante: { id: eq[1][1], nombre: limpia(eq[1][2]) },
      goles_local: m ? Number(m[1]) : null,
      goles_visitante: m ? Number(m[2]) : null,
      jugado: Boolean(m),
      marcador_texto: m ? undefined : (res || undefined),
      partido_id: ficha ? ficha[2] : null,
      ficha_url: ficha ? ficha[1] : null,
      ficha_disponible: /Ficha Disponible/i.test(titulo),
    });
  }
  return out;
}

/**
 * Calendario completo: todas las jornadas con sus partidos, de UNA petición.
 * Devuelve [{ jornada, fecha, partidos: [...] , descansa }].
 */
export function calendario(html, comp) {
  const fechas = new Map();
  for (const m of html.matchAll(new RegExp(`<option[^>]*value="index\\.php\\?comp=${comp}&(?:amp;)?accion=calendario&(?:amp;)?jor=(\\d+)"[^>]*>([^<]*)`, 'g'))) {
    fechas.set(Number(m[1]), iso(m[2]));
  }
  const vistas = new Set();
  const out = [];
  for (const m of html.matchAll(new RegExp(`<table[^>]*id="panelResultados${comp}-(\\d+)"`, 'g'))) {
    const jor = Number(m[1]);
    if (vistas.has(jor)) continue;
    vistas.add(jor);
    const fin = html.indexOf('</table>', m.index);
    const tabla = html.slice(m.index, fin < 0 ? undefined : fin);
    const cab = limpia(tabla.slice(0, 2000));
    const fecha = iso(/JORNADA\s+\d+\s*-\s*([\d/]+)/i.exec(cab)?.[1]) ?? fechas.get(jor) ?? null;
    out.push({ jornada: jor, fecha, partidos: filasDePartido(tabla), descansa: limpia(/Descansa:\s*([^<]*)/.exec(tabla)?.[1] ?? '') || null });
  }
  return out.sort((a, b) => a.jornada - b.jornada);
}

const persona = (fila) => {
  const a = /href="\/?J(\d+)C?\d*\/[^"]*"/.exec(fila);
  const alias = limpia(/<span class="v13[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(fila)?.[1] ?? '') || null;
  const nombre = limpia(/<span class="v11[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(fila)?.[1] ?? '') || null;
  const dorsalTxt = limpia(/id="tdDorsalJugador"[^>]*>([\s\S]*?)<\/td>/.exec(fila)?.[1] ?? '');
  const rol = decodificaEntidades(/id="tdDorsalJugador"[^>]*title="([^"]*)"/.exec(fila)?.[1] ?? '') || null;
  return { id: a ? a[1] : null, alias, nombre, dorsal: /^\d+$/.test(dorsalTxt) ? Number(dorsalTxt) : null, codigo: /^\d+$/.test(dorsalTxt) ? null : (dorsalTxt || null), rol };
};

function alineacion(tabla) {
  const nombre = limpia(/TITULARES\s+([^<]+)</i.exec(tabla)?.[1] ?? '') || null;
  const titulares = [];
  const suplentes = [];
  const tecnicos = [];
  const cambios = [];
  let seccion = 'titulares';
  let ultimoTitular = null;
  for (const fila of tabla.split(/<tr\b/i).slice(1)) {
    if (/<th\b/i.test(fila)) {
      if (/SUPLENTES/i.test(fila)) seccion = 'suplentes';
      else if (/CUERPO\s+T/i.test(fila)) seccion = 'tecnicos';
      else if (/TITULARES/i.test(fila)) seccion = 'titulares';
      continue;
    }
    if (!/href="\/?J\d+/.test(fila)) continue;
    const p = persona(fila);
    // El que entra: icono `imgSustitucion` con «Minuto 81» y/o el texto «m.81» en la primera celda.
    const entra = /id="imgSustitucion"[^>]*title="Minuto\s*(\d+)"/i.exec(fila) ?? />\s*m\.(\d+)\s*</i.exec(fila);
    if (seccion === 'titulares' && entra) {
      cambios.push({ minuto: Number(entra[1]), entra: p, sale: ultimoTitular });
      continue;
    }
    if (seccion === 'titulares') { titulares.push(p); ultimoTitular = p; }
    else if (seccion === 'suplentes') suplentes.push(p);
    else tecnicos.push(p);
  }
  return { nombre, titulares, suplentes, tecnicos, cambios };
}

/** La ficha del partido: equipos, alineaciones, cambios, goles, tarjetas, árbitro, fecha y estadio. */
export function fichaPartido(html) {
  const zona = bloquePorId(html, 'divDatosPartido', 'div') ?? html;
  const datos = limpia(bloquePorId(zona, 'datosFichaPartido', 'div') ?? '');
  const f = /Fecha:\s*\S+,\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})(?:\s+a\s+las\s+(\d{1,2}:\d{2}))?/i.exec(datos);
  const fecha = f && MESES[f[2].toLowerCase()] ? `${f[3]}-${String(MESES[f[2].toLowerCase()]).padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
  const est = /IDestadio=(\d+)"[^>]*>([^<]*)</.exec(zona);
  const equipos = [];
  for (const m of zona.matchAll(/<table\b[^>]*id="tableAlineados(\d+)"/g)) {
    const tabla = bloquePorId(zona.slice(m.index), `tableAlineados${m[1]}`, 'table');
    equipos.push({ id: m[1], ...alineacion(tabla) });
  }
  const goles = [];
  const golesZona = bloquePorId(zona, 'divGoleadoresPartido', 'div') ?? '';
  for (const t of golesZona.split(/GOLEADORES\s+/i).slice(1)) {
    const equipo = limpia(t.slice(0, t.indexOf('<')));
    for (const fila of t.split(/<tr\b/i).slice(1)) {
      if (!/href="\/?J\d+/.test(fila)) continue;
      const parcial = /<p>\s*(\d+)\s*-\s*(\d+)\s*<\/p>/.exec(fila);
      goles.push({ equipo, ...persona(fila), minuto: num(/Min\.\s*(\d+)/i.exec(fila)?.[1]), parcial: parcial ? [Number(parcial[1]), Number(parcial[2])] : null,
        propia: /propia|p\.p\./i.test(limpia(fila)) || undefined, penalti: /penalti|\(p\)/i.test(limpia(fila)) || undefined });
    }
  }
  const tarjetas = [];
  const tz = bloquePorId(zona, 'divTarjetasPartido', 'div') ?? '';
  for (const t of tz.split(/TARJETAS\s+/i).slice(1)) {
    const equipo = limpia(t.slice(0, t.indexOf('<')));
    for (const fila of t.split(/<tr\b/i).slice(1)) {
      if (!/href="\/?J\d+/.test(fila)) continue;
      const color = /redcard/i.test(fila) ? 'roja' : /yellowcard/i.test(fila) ? 'amarilla' : null;
      tarjetas.push({ equipo, ...persona(fila), tipo: color, minuto: num(/Min\.\s*(\d+)/i.exec(fila)?.[1]) });
    }
  }
  const arb = /href="\/?A(\d+)C?\d*\/arbitro\/[^"]*"[^>]*>\s*<span[^>]*>([^<]*)<\/span>\s*<br>\s*<span[^>]*>([^<]*)<\/span>/.exec(tz);
  // Marcador: el último parcial de cada equipo (los goles ya traen el marcador acumulado).
  const ult = goles.filter((g) => g.parcial).sort((a, b) => (a.parcial[0] + a.parcial[1]) - (b.parcial[0] + b.parcial[1])).at(-1);
  return {
    fecha, hora: f?.[4] ?? null,
    estadio: est ? { id: est[1], nombre: limpia(est[2]) } : null,
    arbitro: arb ? { id: arb[1], nombre: limpia(arb[2]), delegacion: limpia(arb[3]) || null } : null,
    equipos, goles, tarjetas,
    marcador_por_goles: ult ? ult.parcial : (goles.length ? null : [0, 0]),
  };
}
