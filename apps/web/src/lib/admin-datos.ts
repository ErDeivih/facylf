import { ejecutaConsulta } from '@/consultas/adaptadores/postgres/conexion';
import {
  ACCESOS_SENSIBLES, AUDITORIA_ADMIN, CUENTAS_RESUMEN, INVITACIONES_ADMIN, PANEL_RESUMEN, PROCESOS,
  USUARIOS_ADMIN,
  type FilaAccesoSensible, type FilaAuditoria, type FilaCuentasResumen, type FilaInvitacion,
  type FilaPanelResumen, type FilaProcesos, type FilaUsuarioAdmin,
} from '@/consultas/admin';
import { MODO_REGISTRO } from '@/consultas/cuentas';

/**
 * Lectura del panel de administración con el rol `facylf_app` (0050).
 *
 * Todas las consultas están declaradas en `consultas/admin.ts` con su presupuesto; aquí sólo se
 * eligen los parámetros y se juntan. No hay caché: son datos de cuentas y de operación que cambian y
 * que no deben reutilizarse entre usuarios. La guardia de sesión y capacidad la pone `admin-servidor`.
 */

export type DatosPanelAdmin = {
  panel: FilaPanelResumen;
  cuentas: FilaCuentasResumen;
  pendientes: FilaUsuarioAdmin[];
  invitaciones: FilaInvitacion[];
  accesos: FilaAccesoSensible[];
  procesos: FilaProcesos[];
  auditoria: FilaAuditoria[];
  modoRegistro: string | null;
};

async function primera<T extends Record<string, unknown>>(
  consulta: { sql: string; presupuestoMs: number; rol?: 'lector' | 'app' },
  parametros: readonly unknown[] = [],
): Promise<T | null> {
  const filas = await ejecutaConsulta<T>(consulta, parametros);
  return filas[0] ?? null;
}

export async function cargaPanelAdmin(): Promise<DatosPanelAdmin> {
  const [panel, cuentas, pendientes, invitaciones, accesos, procesos, auditoria, modo] = await Promise.all([
    primera<FilaPanelResumen>(PANEL_RESUMEN),
    primera<FilaCuentasResumen>(CUENTAS_RESUMEN),
    ejecutaConsulta<FilaUsuarioAdmin>(USUARIOS_ADMIN, ['pendiente', null, 10, 0]),
    ejecutaConsulta<FilaInvitacion>(INVITACIONES_ADMIN, [false, 10]),
    ejecutaConsulta<FilaAccesoSensible>(ACCESOS_SENSIBLES, [30]),
    ejecutaConsulta<FilaProcesos>(PROCESOS),
    ejecutaConsulta<FilaAuditoria>(AUDITORIA_ADMIN, [null, null, null, 10]),
    primera<{ modo: string }>(MODO_REGISTRO),
  ]);

  if (!panel || !cuentas) throw new Error('El panel de administración no devolvió su resumen.');
  return {
    panel, cuentas, pendientes, invitaciones, accesos, procesos, auditoria,
    modoRegistro: modo?.modo ?? null,
  };
}

export type DatosUsuariosAdmin = {
  usuarios: FilaUsuarioAdmin[];
  pendientes: FilaUsuarioAdmin[];
  auditoria: FilaAuditoria[];
  pagina: number;
  haySiguiente: boolean;
};

/** Tamaño de página de la lista de usuarios. Se pide una fila de más para saber si hay siguiente. */
export const USUARIOS_POR_PAGINA = 50;

export async function cargaUsuariosAdmin(filtros: {
  estado: string | null;
  texto: string | null;
  pagina: number;
}): Promise<DatosUsuariosAdmin> {
  const pagina = Math.max(1, Math.trunc(filtros.pagina));
  const [filas, pendientes, auditoria] = await Promise.all([
    ejecutaConsulta<FilaUsuarioAdmin>(USUARIOS_ADMIN, [
      filtros.estado, filtros.texto, USUARIOS_POR_PAGINA + 1, (pagina - 1) * USUARIOS_POR_PAGINA,
    ]),
    ejecutaConsulta<FilaUsuarioAdmin>(USUARIOS_ADMIN, ['pendiente', null, 10, 0]),
    ejecutaConsulta<FilaAuditoria>(AUDITORIA_ADMIN, [null, null, null, 15]),
  ]);
  const haySiguiente = filas.length > USUARIOS_POR_PAGINA;
  return {
    usuarios: filas.slice(0, USUARIOS_POR_PAGINA),
    pendientes,
    auditoria,
    pagina,
    haySiguiente,
  };
}
