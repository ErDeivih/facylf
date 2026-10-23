/**
 * FEB «autonómicas» (competiciones.feb.es/autonomicas/?a=N): la web antigua de la FEB donde cada federación
 * autonómica publicaba (y algunas publican aún) sus competiciones: ligas regionales, copas, junior, cadete…, con
 * histórico desde 2004/05. Sólo marcadores (no hay página de partido ni acta). Sondeo del 05/10/2026:
 *   Resultados.aspx?a=N                  → desplegables de temporada y de categoría (competición, `c`)
 *   POST (temporadasDropDownList)        → las categorías de otra temporada (los `c` son de cada temporada)
 *   Calendarios.aspx?a=N&c=C&med=0       → 10 jornadas por página del grupo elegido: «LOCAL - VISITANTE»,
 *                                          marcador «56-64» o «-», fecha y hora
 *   POST (calendarioDataGrid…)           → «Jornadas posteriores» (página siguiente)
 *   POST (gruposDropDownList)            → otro grupo de la misma categoría
 * Se dejan fuera las competiciones nacionales (LF, LEB, EBA, Segunda/Tercera FEB, Copa de España…): aparecen
 * repetidas bajo cada federación y las nacionales no profesionales ya entran por el adaptador `feb`.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://competiciones.feb.es/autonomicas/';
/** Federaciones (`a`) con algo publicado (catálogo del 30/09/2026). Las «obsoletas» guardan su histórico. */
export const FEDERACIONES = [
  [2, 'Andalucía'], [3, 'Aragón'], [4, 'Asturias'], [5, 'Baleares'], [6, 'Canarias'], [7, 'Cantabria'], [9, 'Castilla y León'],
  [10, 'Castilla-La Mancha'], [12, 'Extremadura'], [13, 'Galicia'], [14, 'Madrid'], [15, 'Melilla'], [16, 'Murcia'],
  [17, 'Navarra'], [18, 'La Rioja'], [19, 'Comunidad Valenciana'], [20, 'País Vasco'], [30, 'Huesca'], [32, 'Zaragoza'], [71, 'Bizkaia'],
];
const NACIONAL = /^(liga\s+)?(l\.?f\.?\b|lf\b|leb\b|eba\b|liga femenina|liga eba|adecco|segunda feb|tercera feb|primera feb|copa\s+(de\s+)?espa|supercopa\s+(lf|endesa|de espa)|acb|endesa|cto\.?\s+espa|campeonato de espa|lf challenge)/i;
export const esNacional = (nombre) => NACIONAL.test(String(nombre ?? '').trim()) || /\bLEB\b|\bEBA\b|L\.F\.-?\s?2/.test(String(nombre ?? ''));

export function opciones(html, nombre) {
  const m = new RegExp(`<select[^>]*name="[^"]*${nombre}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  return m ? [...m[1].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)/g)]
    .map((o) => ({ valor: o[2], texto: limpia(decodificaEntidades(o[3])), elegido: /selected/.test(o[1]) })) : [];
}
const ocultos = (html) => Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g)]
  .map((m) => [m[1], decodificaEntidades(m[2])]));
/** Cuerpo de un «postback»: los campos ocultos y los desplegables tal como están, más lo que cambie. */
export function postback(html, objetivo, cambios = {}) {
  const sel = {};
  for (const n of ['controlNavegacion:categoriasDropDownList', 'controlNavegacion:temporadasDropDownList', 'gruposDropDownList']) {
    const o = opciones(html, n.replace(/^.*:/, ''));
    const e = o.find((x) => x.elegido) ?? o[0];
    if (e) sel[n] = e.valor;
  }
  return new URLSearchParams({ ...ocultos(html), ...sel, __EVENTTARGET: objetivo, __EVENTARGUMENT: '', ...cambios }).toString();
}
export const siguientePagina = (html) => /__doPostBack\(&#39;([^&]+)&#39;,&#39;&#39;\)">Jornadas Posteriores/.exec(html)?.[1] ?? null;

/** Partidos de una página del calendario. Los equipos vienen juntos («LOCAL - VISITANTE»). */
export function partidosDeCalendario(html) {
  const salida = [];
  const titulos = [...html.matchAll(/calendarioDataGrid_tituloLabel_(\d+)"[^>]*>([^<]*)</g)];
  for (const [, idx, titulo] of titulos) {
    const jornada = Number(/Jornada\s+(\d+)/i.exec(titulo)?.[1]) || null;
    const re = new RegExp(`partidosDataGrid_${idx}_Label1_(\\d+)">([^<]*)<\\/span>[\\s\\S]*?partidosDataGrid_${idx}_Label2_\\1">([^<]*)<\\/span>[\\s\\S]*?partidosDataGrid_${idx}_Label3_\\1">([^<]*)<\\/span>(?:[\\s\\S]*?partidosDataGrid_${idx}_Label4_\\1">([^<]*)<\\/span>)?`, 'g');
    for (const m of html.matchAll(re)) {
      const cruce = limpia(decodificaEntidades(m[2]));
      const res = /^\s*(\d+)\s*-\s*(\d+)/.exec(m[3]);
      const f = /(\d{2})\/(\d{2})\/(\d{4})/.exec(m[4]);
      salida.push({ jornada, cruce, resultado_texto: limpia(m[3]) || null,
        puntos_local: res ? Number(res[1]) : null, puntos_visitante: res ? Number(res[2]) : null, jugado: Boolean(res),
        fecha: f ? `${f[3]}-${f[2]}-${f[1]}` : null, hora: /^\s*(\d{1,2}:\d{2})/.exec(m[5] ?? '')?.[1] ?? null });
    }
  }
  // Separar «LOCAL - VISITANTE»: si hay más de un « - », se elige el corte cuyos dos lados son equipos que
  // aparecen en otros cruces sin ambigüedad. Si no se puede saber, se deja el cruce tal cual (sin inventar).
  const conocidos = new Set(salida.filter((p) => p.cruce.split(' - ').length === 2).flatMap((p) => p.cruce.split(' - ')));
  return salida.map((p) => {
    const trozos = p.cruce.split(' - ');
    let par = trozos.length === 2 ? trozos : null;
    if (!par && trozos.length > 2) {
      for (let i = 1; i < trozos.length && !par; i += 1) {
        const l = trozos.slice(0, i).join(' - '); const v = trozos.slice(i).join(' - ');
        if (conocidos.has(l) || conocidos.has(v)) par = [l, v];
      }
    }
    return { ...p, local: par ? { nombre: par[0].trim() } : null, visitante: par ? { nombre: par[1].trim() } : null };
  });
}

const temporadaEnCurso = (d = new Date()) => d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0);

export function creaAdaptadorFebAutonomicas({ federaciones = FEDERACIONES, desde = 2004, ahora = () => new Date() } = {}) {
  const enCurso = () => temporadaEnCurso(ahora());
  const categorias = (html, contexto) => opciones(html, 'categoriasDropDownList').filter((c) => !esNacional(c.texto)).map((c) => ({
    tipo: 'calendario', prioridad: 20 + Math.max(0, enCurso() - contexto.temporada), url: `${BASE}Calendarios.aspx?a=${contexto.a}&c=${c.valor}&med=0`,
    contexto: { ...contexto, c: c.valor, competicion: c.texto, pagina: 1 } }));
  return {
    nombre: 'febauto', deporte: 'baloncesto',
    semillas: () => federaciones.map(([a, nombre]) => ({ tipo: 'portada', url: `${BASE}Resultados.aspx?a=${a}`, prioridad: 5, contexto: { a, federacion: nombre } })),
    tipos: {
      // Portada: temporada actual (sus categorías) y un «postback» por cada temporada pasada.
      portada: {
        revisitarHoras: 24 * 7,
        interpreta(html, { contexto }) {
          const temps = opciones(html, 'temporadasDropDownList');
          const actual = Number(temps.find((t) => t.elegido)?.valor ?? temps[0]?.valor);
          const enlaces = categorias(html, { ...contexto, temporada: actual });
          for (const t of temps.filter((x) => Number(x.valor) !== actual && Number(x.valor) >= desde)) {
            enlaces.push({ tipo: 'temporada', prioridad: 10 + Math.max(0, actual - Number(t.valor)), url: `${BASE}Resultados.aspx?a=${contexto.a}`,
              identidad: `${contexto.a}|t${t.valor}`,
              cuerpo: postback(html, 'controlNavegacion$temporadasDropDownList', { 'controlNavegacion:temporadasDropDownList': t.valor }),
              contexto: { ...contexto, temporada: Number(t.valor) } });
          }
          return { enlaces };
        },
      },
      temporada: {
        interpreta(html, { contexto }) {
          const marcada = Number(opciones(html, 'temporadasDropDownList').find((t) => t.elegido)?.valor);
          if (marcada && marcada !== contexto.temporada) throw new Error(`la web devolvió la temporada ${marcada} y se pidió ${contexto.temporada}`);
          return { enlaces: categorias(html, contexto), revisitarHoras: contexto.temporada >= enCurso() ? 24 * 7 : undefined };
        },
      },
      calendario: {
        interpreta(html, { contexto, url }) {
          const grupos = opciones(html, 'gruposDropDownList');
          const grupo = grupos.find((g) => g.elegido) ?? grupos[0] ?? null;
          const ps = partidosDeCalendario(html);
          const enlaces = [];
          const sig = siguientePagina(html);
          if (sig) {
            enlaces.push({ tipo: 'calendario', prioridad: 25, url, identidad: `${contexto.c}|${grupo?.valor}|p${contexto.pagina + 1}`,
              cuerpo: postback(html, sig), contexto: { ...contexto, grupo: grupo && { id: grupo.valor, nombre: grupo.texto }, pagina: contexto.pagina + 1 } });
          }
          // Los demás grupos, sólo desde la primera página del grupo que viene por defecto.
          if (contexto.pagina === 1 && !contexto.grupo) {
            for (const g of grupos.filter((x) => x !== grupo)) {
              enlaces.push({ tipo: 'calendario', prioridad: 22, url, identidad: `${contexto.c}|${g.valor}|p1`,
                cuerpo: postback(html, 'gruposDropDownList', { gruposDropDownList: g.valor }),
                contexto: { ...contexto, grupo: { id: g.valor, nombre: g.texto }, pagina: 1 } });
            }
          }
          const g = contexto.grupo ?? (grupo && { id: grupo.valor, nombre: grupo.texto });
          if (!ps.length && !enlaces.length) return { sinPublicar: true };
          const vivo = contexto.temporada >= enCurso() && ps.some((p) => !p.jugado);
          return {
            registros: ps.map((p) => ({ tipo: 'partido', clave: `${contexto.c}|${g?.id}|${p.jornada}|${p.cruce}`,
              datos: { a: contexto.a, federacion: contexto.federacion, temporada: contexto.temporada, c: contexto.c, competicion: contexto.competicion, grupo: g, ...p } })),
            enlaces, revisitarHoras: vivo ? 48 : undefined,
          };
        },
      },
    },
  };
}
export default creaAdaptadorFebAutonomicas();
