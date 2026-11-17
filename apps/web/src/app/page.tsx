import type { Metadata } from 'next';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { PARTIDOS_DEL_CANONICO, type FilaPartidoListado } from '@/consultas/entidades';
import {
  PROXIMOS_DEL_CALENDARIO, PROXIMOS_PARTIDOS, TEMPORADA_EN_CURSO,
  type FilaCrucePrevisto, type FilaProximoPartido,
} from '@/consultas/partidos';
import { agrupaProximos, conCrucesPrevistos, type CompeticionConProximos } from '@/lib/proximas';
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
 * Cuatro bloques, en el orden en que se buscan:
 *  · «Próximos partidos»: lo que se juega esta semana en las ligas de aficionados, por competición;
 *  · «Últimos resultados»;
 *  · «Competiciones»: las ligas sénior de mayor a menor nivel y el acceso por categoría;
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
      // Aficionados: la portada enseña primero las ligas sénior (Tercera, regionales, provinciales). El
      // resto de categorías se alcanza con los accesos de categoría.
      FEDERACION_DE_LA_PORTADA, null, 'aficionados', null, null, null, null, [], 60, 0,
    ], { presupuestoMs: GRUPOS_DEL_SELECTOR.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Inicio" motivo={error.message} volver={false} />;
    }
    throw error;
  }

  // De mayor a menor nivel competitivo; sin nivel publicado, al final.
  const porNivel = [...filas].sort((a, b) => (a.nivel ?? 99) - (b.nivel ?? 99));
  const competiciones = competicionesDePortada(porNivel);

  // Lo próximo: partidos con fila y cruces del calendario previsto, de aficionados y de los próximos
  // siete días. Va aparte: si falla (o el calendario no está cargado), la portada sigue sin ese bloque.
  let proximos: CompeticionConProximos[] = [];
  try {
    const parametros = [TEMPORADA_EN_CURSO, 7, 'aficionados'];
    const [conFila, previstos] = await Promise.all([
      consulta<FilaProximoPartido>(PROXIMOS_PARTIDOS.sql, parametros).catch(() => [] as FilaProximoPartido[]),
      consulta<FilaCrucePrevisto>(PROXIMOS_DEL_CALENDARIO.sql, parametros).catch(() => [] as FilaCrucePrevisto[]),
    ]);
    proximos = agrupaProximos(conCrucesPrevistos(conFila, previstos), []).con.slice(0, 3);
  } catch {
    proximos = [];
  }

// Últimos resultados de la portada: los últimos partidos jugados de la temporada de la portada. Si la consulta
// falla, la portada sigue sin ese bloque (no se inventa nada).
let jornada: PartidoDeEjemplo[] = [];
try {
  const partidos = await consulta<FilaPartidoListado>(PARTIDOS_DEL_CANONICO.sql, [
    FEDERACION_DE_LA_PORTADA, TEMPORADA_EN_CURSO, null, 25, 0,
  ], { presupuestoMs: PARTIDOS_DEL_CANONICO.presupuestoMs });
  const iso = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
  const cuando = (v: unknown): number => (v instanceof Date ? v.getTime() : (Date.parse(String(v ?? '')) || 0));
  const jugados = partidos
    .filter((f) => f.goles_local !== null && f.goles_visitante !== null)
    .sort((a, b) => cuando(b.jugado_en) - cuando(a.jugado_en));
  // Los más recientes, sin reordenarlos por tener predicción: «Últimos resultados» debe enseñar los
  // últimos de verdad. Si el más reciente no tiene acta, se sigue mostrando; el enlace abre la jornada.
  const conActa = jugados.filter((f) => f.calidad_acta !== null);
  jornada = (conActa.length > 0 ? conActa : jugados).slice(0, 4)
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
      predLocal: f.pred_local ?? null,
      predEmpate: f.pred_empate ?? null,
      predVisitante: f.pred_visitante ?? null,
      predMarcador: f.pred_marcador ?? null,
    }));
} catch (error) {
  // Si la consulta falla, la portada sigue sin el bloque, pero se deja rastro en el registro del servidor.
  console.error('[portada] no se pudieron cargar los últimos resultados:', error);
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
      proximos={proximos}
      jornada={jornada}
      sesion={sesion ? { nombre: sesion.nombre } : null}
      accesos={accesos}
      errorAccesos={errorAccesos}
    />
  );
}
