import 'server-only';
import {
  FEDERACIONES_LOCALES, datosFederacion, listarGruposLocal, listarEquiposLocal,
  listarJugadoresLocal, listarTecnicosAdultos, slugJugador,
  type FederacionCodigo,
} from './repositorio-local';

export type TipoResultado = 'competicion' | 'equipo' | 'jugador' | 'tecnico';

export interface ResultadoBusqueda {
  tipo: TipoResultado;
  federacion: FederacionCodigo;
  territorio: string;
  titulo: string;
  subtitulo: string;
  meta: string;
  url: string;
}

export interface BusquedaGlobal {
  consulta: string;
  total: number;
  cuenta: Record<TipoResultado, number>;
  resultados: ResultadoBusqueda[];
}

const CERO: Record<TipoResultado, number> = { competicion: 0, equipo: 0, jugador: 0, tecnico: 0 };

/** Búsqueda única sobre las 14 bases: competiciones/grupos, equipos, jugadores y técnicos.
 *  Respeta el aislamiento federativo (cada código vive en su federación). */
export function buscarGlobal(
  consulta: string,
  opciones: { porTipo?: number; federacion?: FederacionCodigo | 'todas' } = {},
): BusquedaGlobal {
  const q = consulta.trim();
  const porTipo = opciones.porTipo ?? 15;
  const cuenta = { ...CERO };
  const resultados: ResultadoBusqueda[] = [];
  if (q.length < 2) return { consulta: q, total: 0, cuenta, resultados };

  const feds = (!opciones.federacion || opciones.federacion === 'todas')
    ? FEDERACIONES_LOCALES
    : FEDERACIONES_LOCALES.filter((f) => f.codigo === opciones.federacion);
  const qMin = q.toLowerCase();

  for (const f of feds) {
    const nom = datosFederacion(f.codigo).nombre;

    for (const g of listarGruposLocal(porTipo, 0, q, f.codigo)) {
      resultados.push({
        tipo: 'competicion', federacion: f.codigo, territorio: nom,
        titulo: `${g.nombre} · ${g.grupo}`,
        subtitulo: `${g.temporada} · ${g.categoria}`,
        meta: `${g.partidos.toLocaleString('es-ES')} partidos`,
        url: `/competicion/${g.slug}`,
      });
      cuenta.competicion += 1;
    }

    for (const e of listarEquiposLocal(porTipo, 0, q, f.codigo)) {
      resultados.push({
        tipo: 'equipo', federacion: f.codigo, territorio: nom,
        titulo: e.nombre,
        subtitulo: `${e.competicion} · ${e.grupo} · ${e.temporada}`,
        meta: `${e.jugados}/${e.partidos} partidos`,
        url: `/equipo/${e.slug}`,
      });
      cuenta.equipo += 1;
    }

    for (const j of listarJugadoresLocal(porTipo, q, f.codigo)) {
      resultados.push({
        tipo: 'jugador', federacion: f.codigo, territorio: nom,
        titulo: j.nombre,
        subtitulo: `${j.temporadas} temporada(s) · ${nom}`,
        meta: `${j.partidos} PJ · ${j.goles} goles`,
        url: `/jugador/${slugJugador(j.codigo, j.federacion)}`,
      });
      cuenta.jugador += 1;
    }

    for (const t of listarTecnicosAdultos(250, f.codigo)) {
      if (cuenta.tecnico >= porTipo * feds.length) break;
      if (!t.nombre.toLowerCase().includes(qMin)) continue;
      resultados.push({
        tipo: 'tecnico', federacion: f.codigo, territorio: nom,
        titulo: t.nombre, subtitulo: `${t.rol} · ${nom}`,
        meta: `${t.partidos} partidos`,
        url: `/tecnicos?q=${encodeURIComponent(t.nombre)}`,
      });
      cuenta.tecnico += 1;
    }
  }

  return { consulta: q, total: resultados.length, cuenta, resultados };
}
