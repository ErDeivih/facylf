/*
 * calendario-html.mjs — lee la página de calendario de un grupo (`NFG_VisCalendario_Vis`) y devuelve los
 * cruces de TODAS sus jornadas, con el código de cada equipo.
 *
 * Es una función pura sobre el texto del HTML: no usa red, ni disco, ni ningún paquete. Así se puede
 * probar sola y el guion que la llama (`scripts/calendario-desde-html.mjs`) puede comparar su recuento
 * con el del extractor del recolector antes de escribir nada.
 *
 * Cómo se lee:
 *   · cada jornada empieza en un encabezado «Jornada N», seguido a veces de «(dd-mm-aaaa)»;
 *   · dentro de una jornada, cada equipo es un enlace a `NFG_VisEquipos` con su `Codigo_Equipo`;
 *   · los enlaces van de dos en dos, local y visitante, en el orden en que se publican.
 *
 * Lo que NO hace: adivinar. Si una jornada tiene un número impar de equipos enlazados, o un equipo
 * juega dos veces en ella, la página no es la que se esperaba y se devuelve el motivo en `problemas`;
 * el guion no escribe ese grupo.
 */

const RE_JORNADA = /Jornada\s+(\d{1,3})\b/gi;
const RE_FECHA = /\(\s*(\d{2})-(\d{2})-(\d{4})\s*\)/;
const RE_EQUIPO = /<a\b[^>]*href=["'][^"']*NFG_VisEquipos[^"']*?(?:Codigo_Equipo|codequipo)=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const DESCANSO = /^(?:descansa|descanso)$/i;

const limpia = (html) => String(html)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'")
  .replace(/\s+/g, ' ').trim();

/** `dd-mm-aaaa` → `aaaa-mm-dd`, o `null` si la fecha no existe o es absurda. */
function fechaIso(dia, mes, anio) {
  const iso = `${anio}-${mes}-${dia}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  const a = Number(anio);
  return a >= 2000 && a <= 2100 ? iso : null;
}

/**
 * @param {string} html
 * @returns {{ jornadas: { numero: number, fecha: string | null,
 *                         partidos: { orden: number, local: string, visitante: string,
 *                                     codLocal: string, codVisitante: string }[] }[],
 *             problemas: string[] }}
 */
export function calendarioDeHtml(html) {
  const texto = String(html ?? '');
  const cortes = [];
  for (const m of texto.matchAll(RE_JORNADA)) cortes.push({ numero: Number(m[1]), inicio: m.index, fin: m.index + m[0].length });

  const jornadas = [];
  const problemas = [];
  const vistas = new Set();
  for (let i = 0; i < cortes.length; i += 1) {
    const { numero, fin } = cortes[i];
    const hasta = i + 1 < cortes.length ? cortes[i + 1].inicio : texto.length;
    const trozo = texto.slice(fin, hasta);
    const enlaces = [...trozo.matchAll(RE_EQUIPO)].map((m) => ({ codigo: m[1], nombre: limpia(m[2]) }));
    // Un «Jornada N» suelto en un desplegable o en un título no trae equipos: no es una jornada.
    if (enlaces.length === 0) continue;
    if (vistas.has(numero)) { problemas.push(`la jornada ${numero} aparece dos veces con partidos`); continue; }
    vistas.add(numero);

    const mf = RE_FECHA.exec(trozo.slice(0, 200));
    const fecha = mf ? fechaIso(mf[1], mf[2], mf[3]) : null;
    if (enlaces.length % 2 !== 0) {
      problemas.push(`la jornada ${numero} tiene ${enlaces.length} equipos enlazados (impar)`);
      continue;
    }
    const partidos = [];
    const juegan = new Set();
    let repetido = null;
    for (let k = 0; k < enlaces.length; k += 2) {
      const local = enlaces[k];
      const visitante = enlaces[k + 1];
      // La federación da de alta un equipo «Descansa» con código propio: no es un partido.
      if (DESCANSO.test(local.nombre) || DESCANSO.test(visitante.nombre)) continue;
      if (local.codigo === visitante.codigo) { repetido = local.nombre; break; }
      if (juegan.has(local.codigo) || juegan.has(visitante.codigo)) {
        repetido = juegan.has(local.codigo) ? local.nombre : visitante.nombre;
        break;
      }
      juegan.add(local.codigo); juegan.add(visitante.codigo);
      partidos.push({
        orden: partidos.length + 1,
        local: local.nombre, visitante: visitante.nombre,
        codLocal: local.codigo, codVisitante: visitante.codigo,
      });
    }
    if (repetido !== null) {
      problemas.push(`en la jornada ${numero}, «${repetido}» juega dos veces`);
      continue;
    }
    jornadas.push({ numero, fecha, partidos });
  }
  jornadas.sort((a, b) => a.numero - b.numero);
  if (jornadas.length === 0 && problemas.length === 0) problemas.push('la página no trae ninguna jornada con equipos enlazados');
  return { jornadas, problemas };
}

/** Total de cruces, para comparar con otro extractor. */
export const totalDeCruces = (calendario) => calendario.jornadas.reduce((s, j) => s + j.partidos.length, 0);
