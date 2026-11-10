import type { Metadata } from 'next';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { PARTIDOS_DEL_CANONICO, type FilaPartidoListado } from '@/consultas/entidades';
import { SinCanonico } from '@/componentes/SinCanonico';
import { InicioContenido, type PartidoDeEjemplo } from '@/componentes/inicio/InicioContenido';
import type { FilaAcceso } from '@/consultas/usuario';
import { misAccesos } from '@/lib/cuentas-db';
import { competicionesDePortada, FEDERACION_DE_LA_PORTADA } from '@/lib/inicio';
import { sesionActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inicio — Fondo Popular',
};

/**
 * Portada de Fondo Popular.
 *
 * Tres bloques, como el prototipo:
 *  · búsqueda por nombre de equipo, jugador o club (la misma consulta canónica que `/buscar`);
 *  · «Explorar una competición»: una selección real de competiciones de Castilla y León y el acceso al
 *    selector completo, donde se puede pedir cualquier temporada, también histórica;
 *  · «Tus equipos»: si hay sesión, los favoritos de `app.mis_accesos`; si no, se invita a entrar y NO
 *    se pinta ningún equipo inventado.
 *
 * No se cuentan tablas de hechos en cada visita: la portada pide los grupos del catálogo y, sólo con
 * sesión, los favoritos. Si el canónico no responde, lo dice; si los favoritos fallan, lo dice sin
 * tirar la portada.
 */
export default async function Inicio() {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Inicio" motivo={motivo} volver={false} />;

  let filas: FilaGrupoSelector[] = [];
  try {
    filas = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
      FEDERACION_DE_LA_PORTADA, null, null, null, null, null, null, [], 60, 0,
    ], { presupuestoMs: GRUPOS_DEL_SELECTOR.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Inicio" motivo={error.message} volver={false} />;
    }
    throw error;
  }

  const competiciones = competicionesDePortada(filas);

// Jornada de ejemplo de la portada: los últimos partidos jugados de la temporada de la portada. Si la consulta
// falla, la portada sigue sin ese bloque (no se inventa nada).
let jornada: PartidoDeEjemplo[] = [];
try {
  const partidos = await consulta<FilaPartidoListado>(PARTIDOS_DEL_CANONICO.sql, [
    FEDERACION_DE_LA_PORTADA, '2026-27', null, 25, 0,
  ], { presupuestoMs: PARTIDOS_DEL_CANONICO.presupuestoMs });
  const iso = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
  const cuando = (v: unknown): number => (v instanceof Date ? v.getTime() : (Date.parse(String(v ?? '')) || 0));
  const jugados = partidos
    .filter((f) => f.goles_local !== null && f.goles_visitante !== null)
    .sort((a, b) => cuando(b.jugado_en) - cuando(a.jugado_en));
  // Los que tengan acta publicada primero: «Ver partido» siempre abre una ficha.
  const conActa = jugados.filter((f) => f.calidad_acta !== null);
  jornada = (conActa.length > 0 ? conActa : jugados)
    .slice(0, 4)
    .map((f) => ({
      partidoId: f.partido_id,
      grupoId: f.grupo_id,
      jornadaNumero: f.jornada_numero,
      fechaTexto: iso(f.jugado_en) || iso(f.fecha_prevista),
      jornada: f.jornada_numero,
      edicion: f.edicion ?? '',
      local: f.local,
      visitante: f.visitante,
      golesLocal: f.goles_local as number,
      golesVisitante: f.goles_visitante as number,
    }));
} catch (error) {
  // Si la consulta falla, la portada sigue sin el bloque, pero se deja rastro en el registro del servidor.
  console.error('[portada] no se pudo cargar la jornada de ejemplo:', error);
  jornada = [];
}

const sesion = await sesionActual();
  let accesos: FilaAcceso[] = [];
  let errorAccesos = false;
  if (sesion) {
    try {
      accesos = await misAccesos(sesion.userId);
    } catch {
      errorAccesos = true;
    }
  }

  return (
    <InicioContenido
      competiciones={competiciones}
      jornada={jornada}
      sesion={sesion ? { nombre: sesion.nombre } : null}
      accesos={accesos}
      errorAccesos={errorAccesos}
    />
  );
}
