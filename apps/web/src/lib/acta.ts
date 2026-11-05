/**
 * Reglas de la pantalla del acta (WALL objetivo 1): qué se puede enseñar, cómo se lee un minuto, cómo
 * se agrupan los cambios y qué marcas tiene cada jugador.
 *
 * Las etiquetas de calidad y las explicaciones salen de `CONTENIDO-MICROCOPIA.md` §3, que es el glosario
 * del producto: «A revisar» no es «error», el dato de la fuente se señala y no se corrige. Todo lo que
 * no es un dato publicado se queda vacío o dice que no está publicado; nunca se convierte en cero.
 */

import type { EventoDeActa, JugadorDeActa, TecnicoDeActa } from '@/consultas/partidos';

/** La ruta del acta de un partido. La usa la jornada para enlazar y la propia pantalla. */
export const rutaDeActa = (matchId: number): string => `/explorar/acta/${matchId}`;

/**
 * ¿Esta calidad permite enseñar el acta? `unavailable` significa que se comprobó que la federación no
 * ofrece el acta de este partido: no hay nada que enseñar y la pantalla es un 404.
 */
export function tieneActa(calidad: string | null | undefined): boolean {
  return typeof calidad === 'string' && calidad !== 'unavailable';
}

const CALIDAD: Record<string, { etiqueta: string; nota: string | null }> = {
  correct: { etiqueta: 'Correcta', nota: null },
  administrative: {
    etiqueta: 'Administrativa',
    nota: 'Resultado decidido por el comité, sin desarrollo deportivo normal.',
  },
  review: {
    etiqueta: 'A revisar',
    nota: 'El acta contiene datos que no cuadran; se conserva tal cual se publicó.',
  },
  partial: { etiqueta: 'Parcial', nota: 'La federación sólo publica una parte del acta.' },
  unavailable: {
    etiqueta: 'No disponible',
    nota: 'Se ha comprobado que la federación no ofrece el acta de este partido.',
  },
};

/** Etiqueta visible de la calidad del acta (`CONTENIDO-MICROCOPIA.md` §3). */
export function etiquetaCalidad(calidad: string): string {
  return CALIDAD[calidad]?.etiqueta ?? 'Sin clasificar';
}

/** Explicación de una calidad que no es «correcta»; `null` cuando no hay nada que explicar. */
export function notaCalidad(calidad: string): string | null {
  return CALIDAD[calidad]?.nota ?? null;
}

const ESTADO: Record<string, string> = {
  played: 'Final',
  scheduled: 'Programado',
  postponed: 'Aplazado',
  cancelled: 'Anulado',
  administrative: 'Administrativo',
};

/** Estado del partido en palabras; `null` si el estado no se entiende (no se disfraza). */
export function etiquetaEstado(estado: string | null | undefined): string | null {
  return (estado !== null && estado !== undefined && ESTADO[estado]) || null;
}

const OFICIAL: Record<string, string> = {
  principal: 'Árbitro principal',
  asistente1: 'Árbitro asistente 1',
  asistente2: 'Árbitro asistente 2',
  cuarto: 'Cuarto árbitro',
  otro: 'Árbitro',
};

/** Función del árbitro en palabras; el valor que no se conoce se queda en «Árbitro». */
export function etiquetaOficial(rol: string): string {
  return OFICIAL[rol] ?? 'Árbitro';
}

/** Minuto del acta: `17′`, `90+3′` o `null` si la fuente no lo publicó (nunca `0′`). */
export function minutoTexto(minuto: number | null, minutoExtra: number | null): string | null {
  if (minuto === null) return null;
  return minutoExtra !== null && minutoExtra > 0 ? `${minuto}+${minutoExtra}′` : `${minuto}′`;
}

/** Fecha del acta en castellano (`sáb 12 sept 2026`), o `null` si no hay fecha publicada. */
export function fechaDeActa(fecha: string | null): string | null {
  if (!fecha) return null;
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).formatToParts(d);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  const dia = valor('day');
  const mes = valor('month');
  const anio = valor('year');
  const semana = valor('weekday');
  if (dia === '' || mes === '' || anio === '') return null;
  return `${semana} ${dia} ${mes} ${anio}`.replace(/\s+/g, ' ').trim();
}

/** Título de la pestaña del navegador: el partido y su jornada, no el título genérico del sitio. */
export function tituloDeActa(x: { local: string; visitante: string; jornada: number }): string {
  return `${x.local} - ${x.visitante} · Jornada ${x.jornada} — Cantera`;
}

/** Resultado de un partido en texto (`2 - 1`), o «—» si no está publicado. */
export function resultadoTexto(golesLocal: number | null, golesVisitante: number | null): string {
  if (golesLocal === null || golesVisitante === null) return '—';
  return `${golesLocal} - ${golesVisitante}`;
}

/* ── Cronología ───────────────────────────────────────────────────────────────────────────────────── */

export type LineaCronologia = {
  clave: string;
  tipo: 'gol' | 'penalti' | 'propia' | 'amarilla' | 'doble-amarilla' | 'roja' | 'cambio';
  lado: 'local' | 'visitante' | null;
  minuto: string | null;
  /** Nombre visible: el jugador del evento o, en un cambio, «Entra …». */
  quien: string;
  /** Qué pasó: «Gol», «Penalti», «Sale …», «Amarilla»… */
  detalle: string;
};

const SIN_NOMBRE = 'No publicado';

const nombre = (e: EventoDeActa): string => (e.persona !== null && e.persona.trim() !== '' ? e.persona : SIN_NOMBRE);

const esTecnico = (e: EventoDeActa): boolean => e.sujeto_tipo === 'tecnico';

const sufijoTecnico = (e: EventoDeActa): string => (esTecnico(e) ? ' · cuerpo técnico' : '');

/**
 * Los eventos del acta convertidos en líneas de cronología.
 *
 * Lo que se agrupa y lo que se descarta:
 *  · un cambio son DOS eventos (`sale` y `entra`) del mismo lado y el mismo minuto: se leen como una
 *    línea «Entra X / Sale Y»; si sólo se publicó una mitad, se enseña esa mitad y no se inventa la otra;
 *  · un gol en propia puerta se coloca en el lado que SUMA el gol (`lado_beneficiado`), no en el equipo
 *    del jugador que la mete;
 *  · `otro` no se enseña: el esquema no dice qué significa y adivinar sería inventar.
 *
 * El orden es el de la fuente (`source_order`), que es el orden del acta: no se reordena por minuto.
 */
export function construyeCronologia(eventos: readonly EventoDeActa[]): LineaCronologia[] {
  const usados = new Set<number>();
  const lineas: LineaCronologia[] = [];

  for (const evento of eventos) {
    if (usados.has(evento.evento_id)) continue;
    const minuto = minutoTexto(evento.minuto, evento.minuto_extra);

    if (evento.tipo === 'sale' || evento.tipo === 'entra') {
      if (evento.tipo === 'sale') {
        // Buscar la otra mitad del cambio: mismo lado y mismo minuto, publicada después.
        const entra = eventos.find((otro) => otro.tipo === 'entra'
          && !usados.has(otro.evento_id)
          && otro.evento_id !== evento.evento_id
          && otro.lado === evento.lado
          && otro.minuto === evento.minuto
          && otro.minuto_extra === evento.minuto_extra);
        if (entra) {
          usados.add(entra.evento_id);
          lineas.push({
            clave: `c-${evento.evento_id}`,
            tipo: 'cambio',
            lado: evento.lado,
            minuto,
            quien: `Entra ${nombre(entra)}`,
            detalle: `Sale ${nombre(evento)}`,
          });
          continue;
        }
        lineas.push({
          clave: `s-${evento.evento_id}`, tipo: 'cambio', lado: evento.lado, minuto,
          quien: `Sale ${nombre(evento)}`, detalle: 'Cambio',
        });
        continue;
      }
      lineas.push({
        clave: `e-${evento.evento_id}`, tipo: 'cambio', lado: evento.lado, minuto,
        quien: `Entra ${nombre(evento)}`, detalle: 'Cambio',
      });
      continue;
    }

    if (evento.tipo === 'gol') {
      const lado = evento.lado_beneficiado ?? evento.lado;
      if (lado === null) continue;
      if (evento.subtipo === 'penalti') {
        lineas.push({ clave: `g-${evento.evento_id}`, tipo: 'penalti', lado, minuto, quien: nombre(evento), detalle: 'Penalti' });
      } else if (evento.subtipo === 'propia_puerta') {
        lineas.push({ clave: `g-${evento.evento_id}`, tipo: 'propia', lado, minuto, quien: nombre(evento), detalle: 'En propia puerta' });
      } else {
        lineas.push({ clave: `g-${evento.evento_id}`, tipo: 'gol', lado, minuto, quien: nombre(evento), detalle: 'Gol' });
      }
      continue;
    }

    if (evento.tipo === 'tarjeta_amarilla') {
      if (evento.lado === null) continue;
      lineas.push({
        clave: `a-${evento.evento_id}`, tipo: 'amarilla', lado: evento.lado, minuto, quien: nombre(evento),
        detalle: `Amarilla${sufijoTecnico(evento)}`,
      });
      continue;
    }

    if (evento.tipo === 'tarjeta_roja') {
      if (evento.lado === null) continue;
      const doble = evento.subtipo === 'doble_amarilla';
      lineas.push({
        clave: `r-${evento.evento_id}`, tipo: doble ? 'doble-amarilla' : 'roja', lado: evento.lado, minuto,
        quien: nombre(evento),
        detalle: `${doble ? '2ª amarilla' : 'Roja'}${sufijoTecnico(evento)}`,
      });
    }
  }

  return lineas;
}

/* ── Marcas de un jugador ────────────────────────────────────────────────────────────────────────── */

export type MarcaJugador = {
  tipo: 'gol' | 'penalti' | 'propia' | 'amarilla' | 'doble-amarilla' | 'roja' | 'entra' | 'sale';
  minuto: string | null;
};

/**
 * Lo que el acta apunta de un jugador: goles (normal, penalti o en propia), tarjetas y cambios.
 * Se calcula de los eventos del propio partido; un jugador sin eventos no tiene marcas (no se rellena).
 */
export function marcasDeJugador(personaId: number, eventos: readonly EventoDeActa[]): MarcaJugador[] {
  const marcas: MarcaJugador[] = [];
  for (const evento of eventos) {
    if (evento.persona_id !== personaId) continue;
    const minuto = minutoTexto(evento.minuto, evento.minuto_extra);
    switch (evento.tipo) {
      case 'gol':
        marcas.push({
          tipo: evento.subtipo === 'penalti' ? 'penalti' : evento.subtipo === 'propia_puerta' ? 'propia' : 'gol',
          minuto,
        });
        break;
      case 'tarjeta_amarilla':
        marcas.push({ tipo: 'amarilla', minuto });
        break;
      case 'tarjeta_roja':
        marcas.push({ tipo: evento.subtipo === 'doble_amarilla' ? 'doble-amarilla' : 'roja', minuto });
        break;
      case 'entra':
        marcas.push({ tipo: 'entra', minuto });
        break;
      case 'sale':
        marcas.push({ tipo: 'sale', minuto });
        break;
      default:
        break;
    }
  }
  return marcas;
}

/** Texto visible de una marca. Los cambios llevan flecha; los goles, su clase entre paréntesis. */
export function textoMarca(marca: MarcaJugador): string {
  const minuto = marca.minuto ?? '';
  switch (marca.tipo) {
    case 'gol': return `Gol ${minuto}`.trim();
    case 'penalti': return `Gol (p) ${minuto}`.trim();
    case 'propia': return `En propia puerta ${minuto}`.trim();
    case 'amarilla': return `Amarilla ${minuto}`.trim();
    case 'doble-amarilla': return `2ª amarilla ${minuto}`.trim();
    case 'roja': return `Roja ${minuto}`.trim();
    case 'entra': return `↑ ${minuto}`.trim();
    case 'sale': return `↓ ${minuto}`.trim();
  }
}

/* ── Alineaciones ────────────────────────────────────────────────────────────────────────────────── */

export type AlineacionDeLado = {
  lado: 'local' | 'visitante';
  titulares: JugadorDeActa[];
  suplentes: JugadorDeActa[];
  /** Convocados sin condición publicada: ni titulares ni suplentes. */
  convocados: JugadorDeActa[];
  entrenador: string | null;
};

/**
 * ¿El rol del cuerpo técnico es el del entrenador principal? Se comparan palabras normalizadas, no se
 * busca «entrenador» dentro de cualquier rol: «2ºEntrenador» no es el primero y no se presenta como él.
 */
export function esEntrenadorPrincipal(rol: string): boolean {
  const normalizado = rol.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ');
  return normalizado === 'entrenador'
    || normalizado === 'entrenadora'
    || normalizado === 'entrenatzailea'
    || normalizado === 'entrenador principal'
    || normalizado === 'primer entrenador';
}

/** La alineación de cada lado, con sus tres grupos y el entrenador cuando está publicado. */
export function alineacionesPorLado(
  alineaciones: readonly JugadorDeActa[],
  cuerpoTecnico: readonly TecnicoDeActa[],
): AlineacionDeLado[] {
  const deLado = (lado: 'local' | 'visitante'): AlineacionDeLado => {
    const propios = alineaciones
      .filter((j) => j.lado === lado)
      .sort((a, b) => a.orden - b.orden);
    const entrenador = cuerpoTecnico.find((t) => t.lado === lado && esEntrenadorPrincipal(t.rol))?.persona ?? null;
    return {
      lado,
      titulares: propios.filter((j) => j.condicion === 'starter'),
      suplentes: propios.filter((j) => j.condicion === 'substitute'),
      convocados: propios.filter((j) => j.condicion !== 'starter' && j.condicion !== 'substitute'),
      entrenador,
    };
  };
  return [deLado('local'), deLado('visitante')];
}
