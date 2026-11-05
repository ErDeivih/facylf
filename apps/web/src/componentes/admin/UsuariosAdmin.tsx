import Link from 'next/link';
import type { Route } from 'next';
import type { FilaAuditoria, FilaUsuarioAdmin } from '@/consultas/admin';
import {
  camposCambiados, etiquetaAccion, etiquetaCapacidad, etiquetaEstadoUsuario, etiquetaPaquete,
  etiquetaRol, etiquetaTabla, ESTADOS_USUARIO,
} from '@/lib/admin';
import { fechaHora, numero } from '@/lib/presentacion-canonico';
import { MarcoAdmin } from './MarcoAdmin';

/**
 * Lista de usuarios (Admin) de sólo lectura.
 *
 * Enseña lo que hay en `app.usuario` y `app.usuario_capacidad`: estado, rol, paquete, permisos sueltos,
 * último acceso y favoritos. **No hay botones de aprobar, rechazar, bloquear ni cambiar paquete**: esas
 * acciones tienen funciones SQL (0043) pero no están conectadas a la interfaz todavía, y un botón que
 * no hace nada sería peor que no tenerlo. Se dice en la propia pantalla.
 *
 * Los filtros van por URL (`?estado=&q=`) y la búsqueda sólo mira el nombre; no se acepta ningún
 * `user_id` por la URL. La lista se corta en 100 filas: se avisa en vez de fingir una paginación
 * completa.
 */

const ESTADOS = ESTADOS_USUARIO;

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';

function etiquetaDeEstado(estado: string): string {
  return ESTADOS.includes(estado as (typeof ESTADOS)[number]) ? etiquetaEstadoUsuario(estado) : 'Todos';
}

function enlaceDePagina(pagina: number, filtros: { estado: string | null; texto: string | null }): string {
  const parametros = new URLSearchParams();
  if (filtros.estado) parametros.set('estado', filtros.estado);
  if (filtros.texto) parametros.set('q', filtros.texto);
  if (pagina > 1) parametros.set('pagina', String(pagina));
  const consulta = parametros.toString();
  return consulta ? `/admin/usuarios?${consulta}` : '/admin/usuarios';
}

export function UsuariosAdmin({
  usuarios, pendientes, auditoria, filtros, pagina, haySiguiente,
}: {
  usuarios: readonly FilaUsuarioAdmin[];
  pendientes: readonly FilaUsuarioAdmin[];
  auditoria: readonly FilaAuditoria[];
  filtros: { estado: string | null; texto: string | null };
  pagina: number;
  haySiguiente: boolean;
}) {
  return (
    <MarcoAdmin activo="usuarios">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Usuarios</h1>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Consulta de cuentas y de la auditoría reciente. Solo lectura.
          </p>
        </div>
        <Link href={'/admin' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
          Volver al resumen
        </Link>
      </header>

      <p className="m-0 border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-3 text-tabla leading-6 text-[var(--texto)]">
        Aprobar, rechazar, bloquear o cambiar paquetes desde el panel todavía no está implementado.
        Esta pantalla es de consulta y no tiene botones que finjan lo contrario.
      </p>

      {pendientes.length > 0 && (
        <section aria-labelledby="pendientes" className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <h2 id="pendientes" className="m-0 text-bloque font-bold text-[var(--texto)]">
              Pendientes de aprobación · {numero(pendientes.length)}
            </h2>
            <Link href={'/admin/usuarios?estado=pendiente' as Route}
              className="text-tabla font-semibold text-[var(--accion)] hover:underline">
              Ver sólo pendientes
            </Link>
          </div>
          <ul className="m-0 list-none p-0">
            {pendientes.map((u) => (
              <li key={u.user_id} className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                <span className="min-w-0 flex-1">
                  <b className="text-[var(--texto)]">{u.nombre ?? 'Sin nombre'}</b>
                  <span className="block text-nota text-[var(--texto-suave)]">
                    Se registró {fechaHora(u.creado_en)}
                    {u.dias_esperando !== null ? ` · ${numero(u.dias_esperando)} días esperando` : ''}
                  </span>
                </span>
                <span className="text-nota text-[var(--texto-suave)]">{etiquetaPaquete(u.paquete)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action="/admin/usuarios" method="get"
        className={`${TARJETA} flex flex-wrap items-end gap-3 p-4`}>
        <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1.5">
          <label htmlFor="admin-estado" className="text-tabla font-semibold text-[var(--texto)]">Estado</label>
          <select id="admin-estado" name="estado" defaultValue={filtros.estado ?? ''}
            className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-bloque text-[var(--texto)]">
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{etiquetaEstadoUsuario(e)}</option>)}
          </select>
        </div>
        <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1.5">
          <label htmlFor="admin-q" className="text-tabla font-semibold text-[var(--texto)]">Buscar por nombre</label>
          <input id="admin-q" name="q" type="search" defaultValue={filtros.texto ?? ''} maxLength={60}
            className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-bloque text-[var(--texto)]" />
        </div>
        <button type="submit"
          className="inline-flex h-11 items-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-sm font-bold text-[var(--texto-inverso)]">
          Filtrar
        </button>
        {(filtros.estado || filtros.texto) && (
          <Link href={'/admin/usuarios' as Route}
            className="inline-flex h-11 items-center text-tabla font-semibold text-[var(--accion)] underline underline-offset-2">
            Quitar filtros
          </Link>
        )}
      </form>

      <section aria-labelledby="lista-usuarios" className={`${TARJETA} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h2 id="lista-usuarios" className="m-0 text-bloque font-bold text-[var(--texto)]">
            Cuentas {filtros.estado ? `· ${etiquetaDeEstado(filtros.estado)}` : ''}
          </h2>
          <span className="text-nota text-[var(--texto-suave)]">
            Página {numero(pagina)} · {numero(usuarios.length)} {usuarios.length === 1 ? 'cuenta' : 'cuentas'}
          </span>
        </div>

        {usuarios.length === 0
          ? (
            <div className="border-t border-[var(--fondo-sutil)] px-4 py-6 text-center">
              <p className="m-0 text-bloque font-semibold text-[var(--texto)]">No hay cuentas con estos filtros</p>
              <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
                Quita los filtros para ver todas las cuentas.
              </p>
              <p className="m-0 mt-3">
                <Link href={'/admin/usuarios' as Route}
                  className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
                  Quitar filtros
                </Link>
              </p>
            </div>
          )
          : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de cuentas">
              <table className="w-full min-w-[820px] border-collapse text-left text-tabla">
                <caption className="sr-only">Cuentas de la plataforma con su estado, permisos y actividad</caption>
                <thead>
                  <tr className="border-b border-[var(--borde)]">
                    {['Cuenta', 'Rol · paquete', 'Permisos', 'Estado', 'Último acceso', 'Favoritos'].map((c) => (
                      <th key={c} scope="col"
                        className="whitespace-nowrap px-3 py-2 text-etiqueta font-semibold uppercase tracking-[0.06em] text-[var(--texto-suave)]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const capacidades = u.capacidades.slice(0, 3);
                    const restantes = u.capacidades.length - capacidades.length;
                    return (
                      <tr key={u.user_id} className="border-b border-[var(--borde)] last:border-b-0 hover:bg-[var(--fondo-sutil)]">
                        <td className="max-w-[22rem] px-3 py-2">
                          <b className="block truncate text-[var(--texto)]">{u.nombre ?? 'Sin nombre'}</b>
                          <span className="block text-nota text-[var(--texto-suave)]">
                            Alta: {fechaHora(u.creado_en)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block text-[var(--texto)]">{etiquetaRol(u.rol)}</span>
                          <span className="text-nota text-[var(--texto-suave)]">{etiquetaPaquete(u.paquete)}</span>
                        </td>
                        <td className="px-3 py-2 text-nota text-[var(--texto-suave)]">
                          {u.capacidades.length === 0
                            ? '—'
                            : (
                              <span>
                                {capacidades.map(etiquetaCapacidad).join(', ')}
                                {restantes > 0 ? ` y ${numero(restantes)} más` : ''}
                              </span>
                            )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[var(--texto)]">{etiquetaEstadoUsuario(u.estado)}</span>
                          {u.dias_esperando !== null && (
                            <span className="block text-nota text-[var(--texto-suave)]">
                              {numero(u.dias_esperando)} días esperando
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--texto-suave)]">
                          {u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca'}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--texto)]">{numero(u.favoritos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        {(pagina > 1 || haySiguiente) && (
          <nav aria-label="Paginación de usuarios"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--borde)] px-4 py-3">
            {pagina > 1
              ? (
                <Link href={enlaceDePagina(pagina - 1, filtros) as Route}
                  className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
                  Anterior
                </Link>
              )
              : <span />}
            <span className="text-nota text-[var(--texto-suave)]">Página {numero(pagina)}</span>
            {haySiguiente
              ? (
                <Link href={enlaceDePagina(pagina + 1, filtros) as Route}
                  className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
                  Siguiente
                </Link>
              )
              : <span />}
          </nav>
        )}
      </section>

      <section id="auditoria" aria-labelledby="auditoria-titulo" className={`${TARJETA} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h2 id="auditoria-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Auditoría · últimos cambios</h2>
          <Link href={'/admin' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Volver al resumen
          </Link>
        </div>
        {auditoria.length === 0
          ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3 text-tabla text-[var(--texto-suave)]">Sin cambios registrados.</p>
          : (
            <ul className="m-0 list-none p-0">
              {auditoria.map((a) => (
                <li key={a.id} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                  <div className="flex flex-wrap gap-x-2">
                    <span className="w-[5.5rem] shrink-0 text-nota text-[var(--texto-suave)]">{fechaHora(a.en)}</span>
                    <span className="min-w-0 flex-1">
                      <b className="text-[var(--texto)]">{a.usuario === 'facylf_admin' ? 'Sistema' : 'Cuenta'}</b>
                      {' '}{etiquetaAccion(a.accion)} en {etiquetaTabla(a.tabla)}
                      {camposCambiados(a.cambios) && (
                        <span className="block text-nota text-[var(--texto-suave)]">Campos: {camposCambiados(a.cambios)}</span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>
    </MarcoAdmin>
  );
}
