/**
 * Parser de la ficha de partido / acta (`NFG_CmpPartido`). Extrae TODO lo que hay en el acta:
 * temporada, jornada, fecha, hora, competición, grupo, equipos, marcador, árbitro, estadio,
 * ciudad, goles (minuto + jugador), titulares/suplentes (dorsal + nombre), cuerpo técnico y
 * sustituciones. (En algunos actas no hay tarjetas/amarillas; si están, también se intentan.)
 *
 * El marcador y jugadores van ofuscados (scripts `ntype()`/`eval()`, dígitos en `<span hidden>`):
 * se quitan `<script>/<style>` y se lee del DOM.
 */

import { parse, type HTMLElement } from 'node-html-parser';
import { numeroOfuscadoHtml } from './ofuscacion.js';
import { normalizaTextoFederacion } from '../texto.js';

/** Se incrementa cuando una mejora exige volver a procesar los HTML ya guardados. */
export const VERSION_PARSER_ACTA = 19;

export interface JugadorActa { dorsal: number | null; nombre: string; codigoJugador?: string | null }
export interface GolActa { minuto: number | null; minutoBase: number | null; minutoAnadido: number | null; jugador: string; tipo: 'normal' | 'penalti' | 'propia-puerta'; lado?: 'local' | 'visitante' | null; ladoBeneficiado?: 'local' | 'visitante' | null }
export interface CambioActa { dorsalSaliente: number | null; saliente: string; minuto: number | null; minutoBase: number | null; minutoAnadido: number | null; dorsalEntrante: number | null; entrante: string; lado: 'local' | 'visitante' | null }
export interface TarjetaActa { tipo: 'amarilla' | 'roja' | 'doble-amarilla'; minuto: number | null; minutoBase: number | null; minutoAnadido: number | null; jugador: string; lado: 'local' | 'visitante' | null }
export interface TecnicoActa { lado: 'local' | 'visitante' | null; rol: string; nombre: string }
export interface LineupEquipo { titulares: JugadorActa[]; suplentes: JugadorActa[]; portero: string | null }

export interface ActaPartido {
  temporada: string | null;
  jornada: number | null;
  competicion: string | null;
  grupo: string | null;
  fecha: string | null;
  hora: string | null;
  local: string | null;
  visitante: string | null;
  golesLocal: number | null;
  golesVisitante: number | null;
  arbitro: string | null;
  estadio: string | null;
  municipio: string | null;
  lineups: { local: LineupEquipo; visitante: LineupEquipo };
  goles: GolActa[];
  cambios: CambioActa[];
  /** Cuerpo técnico: rol → nombre (Entrenador, 2º Entrenador, Delegado de Equipo, etc.) */
  tecnico: Record<string, string>;
  tecnicos: TecnicoActa[];
  tarjetas: TarjetaActa[];
}

/** Repara el mojibake latin-1/UTF-8 (p. ej. "San AndrÃ©s" → "San Andrés") SOLO cuando la
 *  cadena lo contiene de verdad, para no corromper texto ya correcto ("León" se deja igual).
 *  Los marcadores `Ã`/`Â` no aparecen nunca en texto legítimo, así que bastan de disparador. */
function arreglaMojibake(s: string): string {
  return normalizaTextoFederacion(s);
}

function codigoJugadorDe(onclick: string): string | null {
  return /(?:[?&]|\b)jugador=(\d+)/i.exec(onclick.replace(/&amp;/g, '&'))?.[1] ?? null;
}

const texto = (el: HTMLElement | null | undefined) =>
  arreglaMojibake((el?.textContent ?? '').replace(/\s+/g, ' ').trim());
const numeroDe = (s: string | null | undefined) => { if (!s) return null; const m = /(\d+)/.exec(s); return m ? Number(m[1]) : null; };
// En actas antiguas muchos nombres están en formato título, otros en mayúsculas y alguno
// es un nombre federativo como "León 8". Se preserva tal como lo publica la fuente.
const esNombre = (s: string) => /^[\p{L}][\p{L}\p{M}\p{N} ,.'’\-]{1,}$/u.test(s.trim());

/** Rótulos de sección, en los idiomas que publican las territoriales. Euskadi sirve sus actas en
 *  euskera, y con los rótulos sólo en castellano se leían las alineaciones y el marcador pero ni un
 *  gol, ni una tarjeta, ni un técnico: la sección quedaba vacía sin avisar de nada. */
const ES_GOLES = /^(?:Goles|Golak)$/i;
const ES_TECNICOS = /^(?:Cuerpo\s+T[ée]cnico|Langile\s+Teknikoak|Talde\s+Teknikoa)$/i;
const ES_TARJETAS = /^(?:Tarjetas|Txartelak)$/i;
// Los portales escriben estos textos dentro del mismo campo reservado para el nombre del técnico.
// Son ausencia de una persona, no una persona llamada "No presenta". Euskadi usa la primera forma.
const ES_AUSENCIA_PERSONA = /^(?:ez\s+du\s+aurkezten|no\s+presenta|no\s+se\s+presenta|sin\s+presentar|—|-)$/i;

/** Marcador "A - B" del encabezado. Nunca cae al texto global, porque allí aparece
 * la temporada 2025-2026 y podría confundirse con el resultado. */
function marcadorDe(raiz: HTMLElement): [number | null, number | null] {
  const h = raiz.querySelector('h2.ntype');
  if (!h) return [null, null];
  const partes = h.innerHTML.split(/\s+[-–]\s+/);
  if (partes.length !== 2) return [null, null];
  // La tabla de sustitución suele declararse una sola vez, antes del marcador
  // local, aunque ambos lados hagan llamadas ntype(). Se añade como contexto a
  // cada mitad para poder resolver también el resultado visitante.
  const tabla = /\[((?:\d+\s*,\s*){9,}\d+)\]/.exec(h.innerHTML)?.[0] ?? '';
  const contexto = tabla ? `<script>${tabla}</script>` : '';
  return [numeroOfuscadoHtml(`${contexto}${partes[0] ?? ''}`),
    numeroOfuscadoHtml(`${contexto}${partes[1] ?? ''}`)];
}

/** Recupera el marcador acumulado que precede a cada goleador. Es especialmente útil en actas
 * sin alineaciones: aun sin ficha de jugador, el salto 1-0 -> 1-1 identifica el equipo que se
 * benefició del gol. Se ejecuta antes de retirar scripts/estilos porque ahí vive la ofuscación. */
function ladosPorMarcadorDeGoles(raiz: HTMLElement): Array<'local' | 'visitante' | null> {
  const lados: Array<'local' | 'visitante' | null> = [];
  let anteriorLocal = 0;
  let anteriorVisitante = 0;
  for (const titulo of raiz.querySelectorAll('.number').filter((n) => ES_GOLES.test(texto(n)))) {
    const tarjeta = titulo.parentNode as HTMLElement;
    for (const fila of tarjeta.querySelectorAll('tr')) {
      const marcador = fila.querySelectorAll('td')[0]?.innerHTML ?? '';
      const partes = marcador.split(/\s+[-–]\s+/);
      const local = partes.length === 2 ? numeroOfuscadoHtml(partes[0] ?? '') : null;
      const visitante = partes.length === 2 ? numeroOfuscadoHtml(partes[1] ?? '') : null;
      let lado: 'local' | 'visitante' | null = null;
      if (local != null && visitante != null) {
        if (local === anteriorLocal + 1 && visitante === anteriorVisitante) lado = 'local';
        else if (visitante === anteriorVisitante + 1 && local === anteriorLocal) lado = 'visitante';
        anteriorLocal = local;
        anteriorVisitante = visitante;
      }
      lados.push(lado);
    }
  }
  return lados;
}

function detalleMinutoDe(s: string) {
  // La Federación usa ambas variantes: (90'+2) y (90+2').
  const m = /\(\s*(\d+)\s*['’′]?\s*(?:\+\s*(\d+)\s*)?['’′]?\s*\)/.exec(s);
  let minutoBase = m ? Number(m[1]) : null;
  let minutoAnadido = m?.[2] ? Number(m[2]) : null;
  // La federación emplea 999 como sentinel y también contiene erratas como
  // 881'. Ningún partido puede alcanzar esos valores: se conserva el HTML
  // original, pero el dato estructurado queda sin minuto para no contaminar
  // cálculos de sustituciones, tarjetas o minutos jugados.
  if (minutoBase != null && minutoBase > 130) {
    minutoBase = null;
    minutoAnadido = null;
  }
  return {
    minuto: minutoBase == null ? null : minutoBase + (minutoAnadido ?? 0),
    minutoBase,
    minutoAnadido,
  };
}

function nombreTrasMinuto(s: string): string {
  return arreglaMojibake(s.replace(/^.*?\(\s*\d+\s*['’′]?\s*(?:\+\s*\d+\s*)?['’′]?\s*\)\s*/, '')
    .replace(/^\(\s*['’′]?\s*\)\s*/, '')
    .replace(/\s+/g, ' ').trim());
}

function ladoDeSeccion(cabecera: HTMLElement, indice: number): 'local' | 'visitante' {
  let actual: HTMLElement | null = cabecera;
  while (actual) {
    const clase = actual.getAttribute?.('class') ?? '';
    if (/\bcol-sm-pull-4\b/.test(clase)) return 'local';
    if (/\bcol-sm-4\b/.test(clase) && !/\bcol-sm-push-4\b/.test(clase)) return 'visitante';
    actual = actual.parentNode as HTMLElement | null;
  }
  return indice % 2 === 0 ? 'local' : 'visitante';
}

function hermanosDeSeccion(cabecera: HTMLElement): HTMLElement[] {
  const hermanos = cabecera.parentNode?.childNodes ?? [];
  const inicio = hermanos.indexOf(cabecera);
  const salida: HTMLElement[] = [];
  for (let i = inicio + 1; i < hermanos.length; i++) {
    const nodo = hermanos[i] as HTMLElement;
    if (!nodo?.tagName) continue;
    if (nodo.tagName.toLowerCase() === 'h4') break;
    salida.push(nodo);
  }
  return salida;
}

/** Extrae un patrón con captura del texto plano (normalizado). */
function captura(texto: string, re: RegExp): string | null {
  const m = re.exec(texto);
  return m?.[1]?.replace(/[«»"']/g, '').trim() || null;
}

export function parseaActa(html: string): ActaPartido {
  const raiz = parse(html);
  // El marcador debe leerse antes de retirar estilos y scripts: algunas de sus
  // variantes guardan ahí el único dígito verdadero.
  const [golesLocal, golesVisitante] = marcadorDe(raiz);
  const ladosGoles = ladosPorMarcadorDeGoles(raiz);
  for (const s of raiz.querySelectorAll('script, style')) s.remove();
  const plano = texto(raiz);

  // Cabecera: temporada, jornada, fecha, hora, competición, grupo
  // Euskadi y sus tres forales titulan en euskera: «Denboraldia 2010-2011   Jardunaldia 26».
  const temporada = captura(plano, /(?:Temporada|Denboraldia)\s*([\d\/-]+)/i);
  const jornadaRaw = captura(plano, /(?:Jornada|Jardunaldia)\s*(\d+)/i);
  const jornada = jornadaRaw ? Number(jornadaRaw) : null;
  const fecha = captura(plano, /\b(\d{1,2}-\d{1,2}-\d{4})\b/);
  const hora = captura(plano, /\b(\d{1,2}:\d{2})\s*h\b/i);
  const competicion = captura(plano, /(?:de\s)?(?:1ª|2ª|3ª|Tercera|Copa|Liga|Divisi[oó]n)[^·|]*/i);
  const grupo = captura(plano, /\(([^)]*Primera[^)]*|[^)]*Única[^)]*|[^)]*Grupo[^)]*)\)/i);

  // Equipos (elementos font_widget) y árbitro / estadio / ciudad
  const equipos = [...new Set(
    raiz.querySelectorAll('.font_widget1, .font_widgetV, .font_widgetL, .font_widget')
      .map((e) => texto(e)).filter((s) => s.length > 2),
  )];
  const local = equipos[0] ?? null;
  const visitante = equipos[1] ?? null;
  /*
   * FILA DE CABECERA CON EL NOMBRE DEL EQUIPO (18/11/2026, grupo 24219109 de Castilla y León).
   *
   * Algunas actas meten en la tabla de alineación una fila cuyo "nombre de jugador" es en realidad el
   * nombre del equipo. Se colaba como un jugador más y el acta acababa con 739 alineaciones donde hay 738,
   * así que el grupo entero se quedaba sin importar. Se descarta cualquier fila cuyo nombre coincida con
   * el de los dos equipos.
   */
  const normEquipo = (t: string | null): string => (t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nombresEquipo = new Set([local, visitante].map(normEquipo).filter((t) => t.length > 0));
  let arbitro: string | null = null;
  for (const strong of raiz.querySelectorAll('strong')) {
    // La etiqueta cambia entre territoriales: "Árbitro", "Árbitro Principal" y, en
    // Canarias, "Árbitro/a Principal". El nombre sigue estando en el nodo de texto hermano.
    if (!/^[ÁA]rbitro(?:\/a)?(?:\s+Principal)?\s*:?\s*$/i.test(texto(strong))) continue;
    const hermano = arreglaMojibake((strong.nextSibling?.textContent ?? '').replace(/\s+/g, ' ').trim());
    if (hermano && hermano.length < 100) {
      arbitro = hermano;
      break;
    }
    const contenido = texto(strong.parentNode as HTMLElement);
    const candidato = contenido
      .replace(/^[ÁA]rbitro(?:\/a)?(?:\s+Principal)?\s*:?\s*/i, '').trim();
    arbitro = candidato.length < 100 ? candidato || null : null;
    if (arbitro) break;
  }
  if (!arbitro) {
    arbitro = captura(plano,
      /[ÁA]rbitro(?:\/a)?(?:\s+Principal)?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.'’\-]{3,}?)(?=\s+(?:Goles|Estadio|Ciudad|Titulares|Suplentes|Cuerpo)\b|$)/i);
  }
  // Campo y ciudad. En euskera son «Futbol Zelaia:» (en un <strong>, con el nombre del campo en el enlace
  // de al lado) y «Hiria: Tolosa» (en un <h4>). Sin estos rótulos las ~22.000 actas de Euskadi se
  // guardaban sin campo ni ciudad (muestras de la petición 152, 16/10/2026). Se leen del DOM porque en
  // esa maqueta no hay separadores (•, ·, |) que acoten el texto plano.
  let estadio = captura(plano, /Estadio\s*:?\s*([^·|•]{2,70}?)(?=\s*(?:Ciudad|•|·|\|)|$)/i);
  let municipio = captura(plano, /(?:Ciudad|Municipio)\s*:?\s*([^·|•]{2,40}?)(?=\s*(?:[•·|])|$)/i);
  if (!estadio) {
    const rotulo = raiz.querySelectorAll('strong')
      .find((n) => /^(?:Futbol\s+Zelaia|Zelaia|Estadio|Campo(?:\s+de\s+juego)?)\s*:?\s*$/i.test(texto(n)));
    let siguiente = rotulo?.nextElementSibling as HTMLElement | null | undefined;
    if (siguiente && siguiente.tagName?.toLowerCase() === 'br') siguiente = siguiente.nextElementSibling as HTMLElement | null;
    const nombreCampo = siguiente ? texto(siguiente) : '';
    if (nombreCampo && nombreCampo.length <= 70) estadio = nombreCampo;
  }
  if (!municipio) {
    for (const n of raiz.querySelectorAll('h4, h5, td')) {
      const m = /^(?:Hiria|Ciudad|Municipio)\s*:\s*(.{2,40})$/i.exec(texto(n));
      if (m?.[1]) { municipio = m[1].trim(); break; }
    }
  }

  // Alineaciones POR EQUIPO: local y visitante, cada una con titulares y suplentes.
  //
  // Las fichas antiguas no repiten el nombre del equipo junto a la alineación: presentan
  // dos columnas consecutivas, cada una con sus encabezados Titulares/Suplentes. Recorrer
  // todo el árbol y buscar el nombre del equipo en el texto de cada ancestro hacía que los
  // contenedores grandes cambiasen de lado de forma espuria y se perdieran muchas filas.
  // Los encabezados de sección, en cambio, son estables en capturas nuevas y antiguas.
  const lineups = {
    local: { titulares: [] as JugadorActa[], suplentes: [] as JugadorActa[], portero: null as string | null },
    visitante: { titulares: [] as JugadorActa[], suplentes: [] as JugadorActa[], portero: null as string | null },
  };
  let ladoActual: 'local' | 'visitante' = 'local';
  let bloquesTitulares = 0;
  const cabecerasAlineacion = raiz.querySelectorAll('h1,h2,h3,h4,h5,h6')
    .filter((nodo) => /^(?:titulares|suplentes|titularrak|ordezkoak)$/i.test(texto(nodo)));
  for (const cabecera of cabecerasAlineacion) {
    const seccion = /^(?:titulares|titularrak)$/i.test(texto(cabecera)) ? 'titulares' : 'suplentes';
    if (seccion === 'titulares') {
      ladoActual = bloquesTitulares === 0 ? 'local' : 'visitante';
      bloquesTitulares++;
    }
    let siguiente = cabecera.nextElementSibling;
    let tabla: HTMLElement | null = null;
    while (siguiente) {
      if (/^h[1-6]$/i.test(siguiente.tagName)) break;
      if (siguiente.tagName.toLowerCase() === 'table') tabla = siguiente;
      else tabla = siguiente.querySelector('table');
      if (tabla) break;
      siguiente = siguiente.nextElementSibling;
    }
    if (!tabla) continue;
    const vistos = new Set(lineups[ladoActual][seccion].map((j) =>
      `${j.codigoJugador ?? ''}|${j.dorsal ?? ''}|${j.nombre}`));
    for (const tr of tabla.querySelectorAll('tr[onclick*="jugador="]')) {
      const celdas = tr.querySelectorAll('td');
      if (celdas.length < 2) continue;
      const dorsal = numeroDe(texto(celdas[0]));
      const nombre = [...celdas].map(texto).find((s) => esNombre(s)) ?? '';
      if (!nombre) continue;
      if (nombresEquipo.has(normEquipo(nombre))) continue;
      const codigoJugador = codigoJugadorDe(tr.getAttribute('onclick') ?? '');
      const clave = `${codigoJugador ?? ''}|${dorsal ?? ''}|${nombre}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lineups[ladoActual][seccion].push({ dorsal, nombre, codigoJugador });
    }
  }
  // Segunda vía ESTRUCTURAL, para las fichas que no rotulan las alineaciones.
  //
  // Hay territoriales cuyas actas publican las alineaciones en tablas SIN el encabezado
  // "Titulares"/"Suplentes" y, a veces, sin `onclick="jugador="`. La primera vía no ve nada y esas
  // actas se quedaban sin plantilla aunque la página la traiga: 942 en Navarra y 109 en Murcia, con
  // goles y tarjetas pero sin un solo jugador, más las de Euskadi, que titula en euskera
  // ("Langile Teknikoak", "Ordezkapenak").
  //
  // Regla, comprobada sobre actas reales de Navarra, Murcia y Euskadi: las tablas de alineación van
  // ANTES del bloque "Cuerpo Técnico" de su equipo, así que el número de encabezados de cuerpo
  // técnico ya vistos dice de qué lado son — 0 → local, 1 o más → visitante. Dentro de cada lado, la
  // primera tabla son los titulares y la segunda los suplentes. Los recuentos salen bien: 11+7 en
  // fútbol 11 y 5+9 en fútbol sala.
  const totalLineups = lineups.local.titulares.length + lineups.local.suplentes.length +
    lineups.visitante.titulares.length + lineups.visitante.suplentes.length;
  if (totalLineups === 0) {
    const CABECERA_TECNICOS = /cuerpo\s*t[eé]cnico|langile\s*teknikoa|teknikoa/i;
    // Una lista de goles o de sustituciones también tiene números y nombres, pero el número es un
    // minuto con apóstrofo. Se descartan esas tablas para no inventar una plantilla.
    const pareceListaDeEventos = (filas: HTMLElement[]) =>
      filas.filter((f) => /\d\s*['’´]/.test(texto(f))).length > filas.length / 2;
    let tecnicosVistos = 0;
    const porLado: Record<'local' | 'visitante', JugadorActa[][]> = { local: [], visitante: [] };
    for (const nodo of raiz.querySelectorAll('table, h1, h2, h3, h4, h5, h6')) {
      if (nodo.tagName.toLowerCase() !== 'table') {
        if (CABECERA_TECNICOS.test(texto(nodo))) tecnicosVistos += 1;
        continue;
      }
      const filas = nodo.querySelectorAll('tr');
      if (pareceListaDeEventos(filas)) continue;
      const jugadores: JugadorActa[] = [];
      for (const tr of filas) {
        const celdas = tr.querySelectorAll('td');
        if (celdas.length < 2) continue;
        const valores = celdas.map((c) => texto(c));
        const dorsalTexto = valores.find((v) => /^\d{1,2}$/.test(v));
        const nombre = valores.find((v) => /\p{L}{4,}/u.test(v) && !/^\d/.test(v));
        if (!dorsalTexto || !nombre) continue;
        jugadores.push({
          dorsal: Number(dorsalTexto), nombre,
          codigoJugador: codigoJugadorDe(tr.getAttribute('onclick') ?? ''),
        });
      }
      // Una alineación tiene al menos cinco jugadores; con menos, esa tabla es otra cosa.
      if (jugadores.length < 5) continue;
      porLado[tecnicosVistos === 0 ? 'local' : 'visitante'].push(jugadores);
    }
    for (const eq of ['local', 'visitante'] as const) {
      const [titulares = [], suplentes = []] = porLado[eq];
      const vistos = new Set<string>();
      for (const [destino, lista] of [['titulares', titulares], ['suplentes', suplentes]] as const) {
        for (const j of lista) {
          const clave = `${j.dorsal ?? ''}|${j.nombre}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          lineups[eq][destino].push(j);
        }
      }
    }
  }
  // Los dorsales 1 y 13 son señales útiles de portero en fútbol 11. No se asigna
  // arbitrariamente el primer titular si ninguno de ellos aparece como titular.
  for (const eq of ['local', 'visitante'] as const) {
    const porteroJug = lineups[eq].titulares.find((j) => j.dorsal === 1) ??
      lineups[eq].titulares.find((j) => j.dorsal === 13);
    lineups[eq].portero = porteroJug?.nombre ?? null;
  }

  const goles: GolActa[] = [];
  const cambios: CambioActa[] = [];
  const tecnico: Record<string, string> = {};
  const tecnicos: TecnicoActa[] = [];
  const tarjetas: TarjetaActa[] = [];

  // Sustituciones: cada cambio es una tabla de dos filas. La flecha verde señala
  // quién entra y la roja quién sale; el minuto puede aparecer en cualquiera.
  const cabecerasCambios = raiz.querySelectorAll('h4')
    .filter((h) => /^(?:Sustituciones|Ordezkapenak)$/i.test(texto(h)));
  for (const [indice, cabecera] of cabecerasCambios.entries()) {
    const lado = ladoDeSeccion(cabecera, indice);
    for (const tabla of hermanosDeSeccion(cabecera).filter((n) => n.tagName.toLowerCase() === 'table')) {
      const filas = tabla.querySelectorAll('tr');
      if (filas.length < 2) continue;
      const datos = filas.map((fila) => {
        const celdas = fila.querySelectorAll('td');
        const contenido = texto(celdas[1]);
        return {
          dorsal: numeroDe(texto(celdas[0])), nombre: nombreTrasMinuto(contenido),
          ...detalleMinutoDe(contenido), entra: Boolean(fila.querySelector('.font-green-meadow')),
          sale: Boolean(fila.querySelector('.font-red')),
        };
      });
      const entrante = datos.find((d) => d.entra) ?? datos[0]!;
      const saliente = datos.find((d) => d.sale) ?? datos[1]!;
      const detalleMinuto = saliente.minuto != null ? saliente : entrante;
      if (!entrante.nombre || !saliente.nombre) continue;
      cambios.push({ dorsalSaliente: saliente.dorsal, saliente: saliente.nombre,
        minuto: detalleMinuto.minuto, minutoBase: detalleMinuto.minutoBase,
        minutoAnadido: detalleMinuto.minutoAnadido,
        dorsalEntrante: entrante.dorsal, entrante: entrante.nombre, lado });
    }
  }

  // Cuerpo técnico: pares "Rol: nombre" (Entrenador, 2º Entrenador, Delegado de Equipo,
  // Delegado de Campo, Preparador Físico, Fisioterapeuta, Médico, Ayudante…). "No presenta"
  // se guarda como tal.
  // En el HTML real cada equipo tiene su propio encabezado y cada cargo es un h5.
  const cabecerasTecnico = raiz.querySelectorAll('h4')
    .filter((h) => ES_TECNICOS.test(texto(h)));
  for (const [indice, cabecera] of cabecerasTecnico.entries()) {
    const lado = indice % 2 === 0 ? 'local' : 'visitante';
    const seccion = hermanosDeSeccion(cabecera);
    for (const h5 of seccion.filter((n) => n.tagName.toLowerCase() === 'h5')) {
      const strong = h5.querySelector('strong');
      if (!strong) continue;
      const etiqueta = texto(strong);
      const rol = etiqueta.replace(/\s*:\s*$/, '').trim();
      const completo = texto(h5);
      const nombreTabla = h5.querySelectorAll('td').map((td) => texto(td)).filter(Boolean).at(-1);
      const nombre = nombreTabla ?? completo.slice(etiqueta.length).trim();
      if (!rol || !nombre || ES_AUSENCIA_PERSONA.test(nombre)) continue;
      tecnicos.push({ lado, rol, nombre });
      if (!tecnico[rol]) tecnico[rol] = nombre;
    }
    // Algunas capturas antiguas conservan HTML inválido: el navegador separa
    // el <strong> del cargo y el <tr> con el nombre, dejándolos como hermanos
    // directos del documento. Se recompone la pareja sin depender del anidado.
    for (const [posicion, nodo] of seccion.entries()) {
      if (nodo.tagName.toLowerCase() !== 'strong') continue;
      const etiqueta = texto(nodo);
      if (!/:\s*$/.test(etiqueta)) continue;
      const rol = etiqueta.replace(/\s*:\s*$/, '').trim();
      const siguiente = seccion.slice(posicion + 1)
        .find((n) => ['tr', 'table', 'h5', 'strong'].includes(n.tagName.toLowerCase()));
      if (!siguiente || siguiente.tagName.toLowerCase() === 'strong') continue;
      const nombre = siguiente.querySelectorAll('td').map((td) => texto(td)).filter(Boolean).at(-1)
        ?? texto(siguiente);
      if (!rol || !nombre || ES_AUSENCIA_PERSONA.test(nombre)) continue;
      tecnicos.push({ lado, rol, nombre });
      if (!tecnico[rol]) tecnico[rol] = nombre;
    }
  }

  // Tarjetas (amarillas/rojas, con minuto; doble amarilla): sección tras "Tarjeta(s)".
  const cabecerasTarjetas = raiz.querySelectorAll('h4').filter((h) => ES_TARJETAS.test(texto(h)));
  for (const [indice, cabecera] of cabecerasTarjetas.entries()) {
    const lado = ladoDeSeccion(cabecera, indice);
    for (const tabla of hermanosDeSeccion(cabecera).filter((n) => n.tagName.toLowerCase() === 'table')) {
      for (const fila of tabla.querySelectorAll('tr')) {
        const celdas = fila.querySelectorAll('td');
        const detalle = texto(celdas[1]);
        const jugador = nombreTrasMinuto(detalle);
        if (!jugador) continue;
        const src = fila.querySelector('img')?.getAttribute('src') ?? '';
        const tipo = /roja/i.test(src) ? 'roja' : 'amarilla';
        tarjetas.push({ tipo, ...detalleMinutoDe(detalle), jugador, lado });
      }
    }
  }
  // La web representa una expulsión por doble amarilla como dos filas amarillas
  // para el mismo jugador. La segunda se etiqueta de forma explícita; una fila roja
  // se conserva como roja porque el acta no permite distinguir su causa con seguridad.
  const amarillasVistas = new Set<string>();
  for (const tarjeta of tarjetas) {
    if (tarjeta.tipo !== 'amarilla') continue;
    const clave = `${tarjeta.lado ?? ''}|${tarjeta.jugador.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (amarillasVistas.has(clave)) tarjeta.tipo = 'doble-amarilla';
    else amarillasVistas.add(clave);
  }

  // Todos los goles están en una tarjeta dashboard cuya cabecera exacta es "Goles".
  let indiceGol = 0;
  for (const titulo of raiz.querySelectorAll('.number').filter((n) => ES_GOLES.test(texto(n)))) {
    const tarjeta = titulo.parentNode as HTMLElement;
    for (const fila of tarjeta.querySelectorAll('tr')) {
      const celdas = fila.querySelectorAll('td');
      const detalle = texto(celdas.at(-1));
      const jugador = nombreTrasMinuto(detalle);
      // El tipo de gol va en el icono: su CLASE (`lgol`, `lpenalti`, `lgolpp`) es la misma en todas las
      // maquetas y su `title` cambia con el idioma. En euskera es «helburu normala», «Penaltiaren gola» y
      // «Norberaren gola» (en propia puerta): mirando sólo `title^="Gol"` los penaltis y los goles en
      // propia puerta de Euskadi salían como goles normales, y el de propia puerta se le apuntaba a un
      // jugador del equipo contrario (petición 152, 16/10/2026).
      const icono = fila.querySelector('a.lgolpp, a.lpenalti, a.lgol, a[title^="Gol"]');
      const claseTipo = icono?.getAttribute('class') ?? '';
      const tituloTipo = icono?.getAttribute('title') ?? '';
      const tipo = /\blgolpp\b/.test(claseTipo) || /propia|norberaren|bere\s+atean/i.test(tituloTipo) ? 'propia-puerta' as const
        : /\blpenalti\b/.test(claseTipo) || /penalti/i.test(tituloTipo) ? 'penalti' as const : 'normal' as const;
      const ladoBeneficiado = ladosGoles[indiceGol++] ?? null;
      const lado = tipo === 'propia-puerta'
        ? ladoBeneficiado === 'local' ? 'visitante'
          : ladoBeneficiado === 'visitante' ? 'local' : null
        : ladoBeneficiado;
      if (jugador) goles.push({ ...detalleMinutoDe(detalle), jugador, tipo,
        ...(lado ? { lado } : {}), ...(ladoBeneficiado ? { ladoBeneficiado } : {}) });
    }
  }

  return { temporada, jornada, competicion, grupo, fecha, hora, local, visitante,
    golesLocal, golesVisitante, arbitro, estadio, municipio, lineups,
    goles, cambios, tecnico, tecnicos, tarjetas };
}
