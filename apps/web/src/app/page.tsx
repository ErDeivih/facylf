import type { Metadata } from 'next';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { SinCanonico } from '@/componentes/SinCanonico';
import { InicioContenido } from '@/componentes/inicio/InicioContenido';
import type { FilaAcceso } from '@/consultas/usuario';
import { misAccesos } from '@/lib/cuentas-db';
import { competicionesDePortada, FEDERACION_DE_LA_PORTADA } from '@/lib/inicio';
import { sesionActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inicio — Balompié',
};

/**
 * Portada de Balompié.
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
      sesion={sesion ? { nombre: sesion.nombre } : null}
      accesos={accesos}
      errorAccesos={errorAccesos}
    />
  );
}
