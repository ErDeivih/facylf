/**
 * Tenis en iSquad (resultadostenis.isquad.es): la RFET (1) y unas 13 territoriales (ids 1-20). Llamadas
 * grabadas con el sondeo de navegador del 01/10/2026; se piden directamente a tenis.isquad.es:
 *   POST /json/api/call.php/campeonato/calendar  id_ambito=F … start/end   → campeonatos (torneos) del periodo
 *   POST /json/api/call.php/campeonato/matches   id_campeonatos[]=… fecha[start|end] → partidos con sets
 *
 * ⚠ NUNCA `competicion/inscritos/datatable`: esa API devuelve DNI, correo, teléfono y fecha de nacimiento de
 * los inscritos (también niños). Tampoco se guardan licencias, fotos ni coordenadas de los partidos.
 * Menores (alevín, infantil, cadete, junior, sub-N ≤ 18, benjamín, minitenis): el partido se guarda con sus
 * sets y su categoría, pero SIN nombres de jugadores (sólo un identificador interno no reversible).
 */
import { createHash } from 'node:crypto';

const API = 'https://tenis.isquad.es/json/api/call.php';
export const FEDERACIONES = Array.from({ length: 20 }, (_, i) => String(i + 1));
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

export function esDeMenores(p) {
  const t = `${p.edad_nombre ?? ''} ${p.categoria_nombre ?? ''} ${p.competicion_nombre ?? ''}`.toLowerCase();
  if (/(alev[ií]n|infantil|cadete|junior|j[uú]nior|benjam[ií]n|minitenis|baby|escuela|menores)/.test(t)) return true;
  const sub = /sub[\s-]?(\d{1,2})/.exec(t);
  return Boolean(sub && Number(sub[1]) <= 18);
}

/** Identificador estable y no reversible de un jugador (para unir partidos sin guardar su nombre). */
const seudonimo = (id) => (id && id !== '0' ? createHash('sha256').update(`isquad-tenis:${id}`).digest('hex').slice(0, 16) : null);

export function partidoMinimo(p) {
  const menores = esDeMenores(p);
  const jugador = (lado) => {
    const id = p[`id_jugador_${lado}1`] ?? p[`id_${lado === 'local' ? 'local' : 'visitante'}`];
    // Desde el 05/10/2026 también con nombre en menores (decisión de David: instancia privada, se recoge todo como
    // en las federaciones; NO se publica). `menores` queda marcado en el partido para la capa que publique.
    return { ref: seudonimo(id), id: id && id !== '0' ? String(id) : null,
      nombre: (p[`${lado}_nombre`] ?? '').replace(/\s+/g, ' ').trim() || null, club: p[`club_${lado}_nombre`] ?? null };
  };
  const sets = [];
  for (let i = 1; i <= 6; i += 1) {
    const a = p[`resultado_local${i}`]; const b = p[`resultado_visitante${i}`];
    if (a == null && b == null) continue;
    sets.push([a == null ? null : Number(a), b == null ? null : Number(b)]);
  }
  const finalizado = p.is_finished === '1';
  return {
    id_partido: p.id_partido, campeonato: { id: p.id_campeonato, nombre: p.campeonato_nombre },
    competicion: { id: p.id_competicion, nombre: p.competicion_nombre ?? null }, torneo: p.id_torneo,
    categoria: p.categoria_nombre ?? null, edad: p.edad_nombre ?? null, menores, fase: p.fase_nombre ?? null,
    ronda: p.nombre_jornada ?? null, fecha: p.fecha_partido && !p.fecha_partido.startsWith('0000') ? p.fecha_partido : null,
    estado: p.estado_partido_nombre ?? p.estado_partido ?? null, finalizado,
    dobles: p.tipo_integrante_partido !== '1',
    local: jugador('local'), visitante: jugador('visitante'),
    sets_local: finalizado ? (p.resultado_local == null ? null : Number(p.resultado_local)) : null,
    sets_visitante: finalizado ? (p.resultado_visitante == null ? null : Number(p.resultado_visitante)) : null,
    parciales: finalizado ? sets : [],
    ganador: p.id_ganador && p.id_ganador !== '0' ? seudonimo(p.id_ganador) : null,
    instalacion: p.instalacion_nombre ?? null, poblacion: p.poblacion ?? p.campo_poblacion ?? null,
  };
}

export function creaAdaptadorIsquadTenis({ federaciones = FEDERACIONES, anios = [2026, 2025, 2024], ahora = () => new Date() } = {}) {
  const anioActual = () => ahora().getUTCFullYear();
  return {
    nombre: 'isquad-tenis', deporte: 'tenis',
    semillas: () => federaciones.flatMap((f) => anios.map((a) => ({
      tipo: 'calendario', url: `${API}/campeonato/calendar`, prioridad: a === anioActual() ? 10 : 20 + (anioActual() - a) * 10,
      cuerpo: new URLSearchParams({ id_ambito: f, id_ambito_visible: '0', pestana: '1', ano: '1', start: `${a}-01-01`, end: `${a + 1}-01-01` }).toString(),
      contexto: { federacion: f, anio: a } }))),
    tipos: {
      calendario: {
        interpreta(texto, { contexto }) {
          const lista = json(texto);
          if (!Array.isArray(lista)) throw new Error('el calendario no es JSON');
          const vivo = contexto.anio >= anioActual();
          return {
            registros: lista.map((c) => ({ tipo: 'campeonato', clave: c.id, datos: { federacion_ambito: contexto.federacion, id: c.id, nombre: c.title,
              federacion: c.federacion, siglas: c.siglas_ambito, inicio: c.start, fin: c.end, provincia: c.nombre_provincia ?? null } })),
            enlaces: lista.map((c) => {
              const fin = new Date(new Date(String(c.end).replace(' ', 'T') + 'Z').getTime() + 86_400_000).toISOString().slice(0, 10);
              const cuerpo = new URLSearchParams();
              cuerpo.append('id_campeonatos[]', c.id);
              cuerpo.append('fecha[start]', String(c.start).slice(0, 10));
              cuerpo.append('fecha[end]', fin);
              return { tipo: 'partidos', url: `${API}/campeonato/matches`, cuerpo: cuerpo.toString(), prioridad: 30,
                contexto: { campeonato: c.id, fin } };
            }),
            revisitarHoras: vivo ? 24 * 3 : undefined,
          };
        },
      },
      partidos: {
        interpreta(texto, { contexto }) {
          const lista = json(texto);
          if (!Array.isArray(lista)) throw new Error('los partidos no son JSON');
          const abiertos = lista.some((p) => p.is_finished !== '1');
          const terminado = new Date(contexto.fin) < ahora();
          return {
            registros: lista.map((p) => ({ tipo: 'partido', clave: p.id_partido, datos: partidoMinimo(p) })),
            revisitarHoras: !terminado || abiertos ? 24 : undefined,
          };
        },
      },
    },
  };
}
export default creaAdaptadorIsquadTenis();
