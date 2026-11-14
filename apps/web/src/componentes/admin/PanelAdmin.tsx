import Link from 'next/link';
import type { Route } from 'next';
import type {
  FilaAccesoSensible, FilaAuditoria, FilaCuentasResumen, FilaInvitacion, FilaPanelResumen,
  FilaProcesos, FilaUsuarioAdmin,
} from '@/consultas/admin';
import { camposCambiados, etiquetaAccion, etiquetaCapacidadSensible, etiquetaEstadoInvitacion, etiquetaModoRegistro, etiquetaPaquete, etiquetaProceso, etiquetaTabla } from '@/lib/admin';
import { fechaHora, numero } from '@/lib/presentacion-canonico';
import { MarcoAdmin } from './MarcoAdmin';

/**
 * Portada del panel (AdminInicio). Resumen con datos reales de `consultas/admin.ts`.
 *
 * No hay gráficos inventados ni tendencias: cada tarjeta es una cifra que viene de la base o dice
 * «sin medir». Lo que necesita atención se enlaza sólo a las pantallas que existen (usuarios); el
 * resto se enuncia sin un enlace muerto. La página es de consulta: no tiene botones de acción.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className={`${TARJETA} flex flex-col gap-1 p-4`}>
      <span className="text-etiqueta font-semibold text-[var(--texto-suave)]">{etiqueta}</span>
      <strong className="text-titulo font-extrabold leading-none tabular-nums text-[var(--texto)]">{valor}</strong>
      {detalle && <span className="text-nota text-[var(--texto-suave)]">{detalle}</span>}
    </div>
  );
}

function plural(n: number, singular: string, plural_: string): string {
  return `${numero(n)} ${n === 1 ? singular : plural_}`;
}

export function PanelAdmin({
  panel, cuentas, pendientes, invitaciones, accesos, procesos, auditoria, modoRegistro,
}: {
  panel: FilaPanelResumen;
  cuentas: FilaCuentasResumen;
  pendientes: readonly FilaUsuarioAdmin[];
  invitaciones: readonly FilaInvitacion[];
  accesos: readonly FilaAccesoSensible[];
  procesos: readonly FilaProcesos[];
  auditoria: readonly FilaAuditoria[];
  modoRegistro: string | null;
}) {
  const atenciones: Array<{ texto: string; detalle: string; href?: string }> = [];
  if (cuentas.pendientes > 0) {
    atenciones.push({
      texto: plural(cuentas.pendientes, 'cuenta espera aprobación', 'cuentas esperan aprobación'),
      detalle: cuentas.esperando_mas_de_3_dias > 0
        ? `${numero(cuentas.esperando_mas_de_3_dias)} lleva más de 3 días`
        : 'Ninguna lleva más de 3 días',
      href: '/admin/usuarios?estado=pendiente',
    });
  }
  if (panel.alertas_fallo > 0) {
    atenciones.push({
      texto: plural(panel.alertas_fallo, 'alerta en fallo', 'alertas en fallo'),
      detalle: `${numero(panel.alertas_aviso)} avisos abiertos más`,
    });
  }
  if (panel.casos_graves > 0) {
    atenciones.push({
      texto: plural(panel.casos_graves, 'caso de datos grave', 'casos de datos graves'),
      detalle: `${numero(panel.casos_abiertos)} casos abiertos en total`,
    });
  }
  if (cuentas.cuentas_frenadas > 0) {
    atenciones.push({
      texto: plural(cuentas.cuentas_frenadas, 'cuenta frenada', 'cuentas frenadas'),
      detalle: 'Por contraseñas fallidas en la última hora',
    });
  }

  return (
    <MarcoAdmin activo="inicio">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Administración</h1>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Cuentas, invitaciones, avisos y procesos. Solo lectura.
          </p>
        </div>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Registro: <b className="text-[var(--texto)]">{etiquetaModoRegistro(modoRegistro)}</b>
        </p>
      </header>

      <section aria-labelledby="atencion" className="flex flex-col gap-2">
        <h2 id="atencion" className="m-0 text-bloque font-bold text-[var(--texto)]">Lo que necesita atención</h2>
        {atenciones.length === 0
          ? <p className={`${TARJETA} m-0 p-4 text-tabla text-[var(--texto-suave)]`}>Nada urgente ahora mismo.</p>
          : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {atenciones.map((a) => {
                const contenido = (
                  <>
                    <span className="min-w-0 flex-1">
                      <b className="block text-bloque text-[var(--texto)]">{a.texto}</b>
                      <span className="text-nota text-[var(--texto-suave)]">{a.detalle}</span>
                    </span>
                    {a.href && <span className="text-tabla font-semibold text-[var(--accion)]">Ver usuarios</span>}
                  </>
                );
                return (
                  <li key={a.texto}>
                    {a.href
                      ? <Link href={a.href as Route} className={`${TARJETA} flex min-h-11 items-center gap-3 p-3 hover:bg-[var(--fondo-sutil)]`}>{contenido}</Link>
                      : <div className={`${TARJETA} flex min-h-11 items-center gap-3 p-3`}>{contenido}</div>}
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      <section aria-labelledby="cuentas" className={`${TARJETA} p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cuentas" className="m-0 text-bloque font-bold text-[var(--texto)]">Cuentas</h2>
          <Link href={'/admin/usuarios' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ir a usuarios
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Dato etiqueta="Pendientes" valor={numero(cuentas.pendientes)}
            detalle={`${numero(cuentas.esperando_mas_de_3_dias)} esperan más de 3 días`} />
          <Dato etiqueta="Invitaciones vigentes" valor={numero(cuentas.invitaciones_vigentes)} />
          <Dato etiqueta="Altas últimos 7 días" valor={numero(cuentas.altas_7_dias)} />
          <Dato etiqueta="Cuentas bloqueadas" valor={numero(cuentas.bloqueados)} />
          <Dato etiqueta="Frenadas por intentos" valor={numero(cuentas.cuentas_frenadas)} detalle="Última hora" />
          <Dato etiqueta="Paquetes que vencen" valor={numero(cuentas.caducan_en_30_dias)} detalle="En los próximos 30 días" />
        </div>
      </section>

      <section aria-labelledby="resumen" className={`${TARJETA} p-4`}>
        <h2 id="resumen" className="m-0 text-bloque font-bold text-[var(--texto)]">Resumen de la plataforma</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Dato etiqueta="Usuarios activos (7 días)" valor={numero(panel.activos_7d)} />
          <Dato etiqueta="Avisos enviados (24 h)" valor={numero(panel.avisos_24h)}
            detalle={panel.avisos_ultima_pasada ? `Última pasada: ${fechaHora(panel.avisos_ultima_pasada)}` : 'Sin pasada registrada'} />
          <Dato etiqueta="Última copia" valor={panel.ultima_copia ? fechaHora(panel.ultima_copia) : 'Sin copia registrada'} />
          <Dato etiqueta="Grupos por proyectar" valor={numero(panel.grupos_pendientes)} />
          <Dato etiqueta="Casos de datos abiertos" valor={numero(panel.casos_abiertos)}
            detalle={`${numero(panel.casos_graves)} graves`} />
          <Dato etiqueta="Alertas abiertas" valor={numero(panel.alertas_fallo + panel.alertas_aviso)}
            detalle={`${numero(panel.alertas_fallo)} en fallo · ${numero(panel.alertas_aviso)} en aviso`} />
        </div>
      </section>

      <section aria-labelledby="invitaciones" className={`${TARJETA} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h2 id="invitaciones" className="m-0 text-bloque font-bold text-[var(--texto)]">Invitaciones</h2>
          <span className="text-nota text-[var(--texto-suave)]">
            {modoRegistro === 'abierto' ? 'El registro está abierto; no hacen falta para entrar.' : 'Registro con invitación.'}
          </span>
        </div>
        {invitaciones.length === 0
          ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3 text-tabla text-[var(--texto-suave)]">No hay invitaciones creadas.</p>
          : (
            <ul className="m-0 list-none p-0">
              {invitaciones.map((i) => (
                <li key={i.codigo}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                  <code className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 font-semibold text-[var(--texto)]">
                    {i.codigo}
                  </code>
                  <span className="min-w-0 flex-1 text-[var(--texto-suave)]">
                    {etiquetaPaquete(i.paquete)} · {numero(i.usos)} de {numero(i.usos_max)} usos · {i.personal ? 'para un correo concreto' : 'para cualquiera'}
                  </span>
                  <span className="text-nota text-[var(--texto-suave)]">
                    {etiquetaEstadoInvitacion(i.estado)}
                    {i.estado === 'vigente' && i.caduca_en ? ` hasta ${fechaHora(i.caduca_en)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {pendientes.length > 0 && (
        <section aria-labelledby="pendientes" className={`${TARJETA} p-4`}>
          <h2 id="pendientes" className="m-0 text-bloque font-bold text-[var(--texto)]">Cuentas pendientes de aprobación</h2>
          <ul className="m-0 mt-2 list-none p-0">
            {pendientes.map((u) => (
              <li key={u.user_id} className="border-t border-[var(--fondo-sutil)] py-2 text-tabla first:border-t-0">
                <b className="text-[var(--texto)]">{u.nombre ?? 'Sin nombre'}</b>
                <span className="text-[var(--texto-suave)]">
                  {' · '}{fechaHora(u.creado_en)}
                  {u.dias_esperando !== null ? ` · ${numero(u.dias_esperando)} días esperando` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-nota text-[var(--texto-suave)]">
            Aprobar y rechazar desde el panel todavía no está implementado. Esta pantalla es de consulta.
          </p>
        </section>
      )}

      <section aria-labelledby="accesos" className={`${TARJETA} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h2 id="accesos" className="m-0 text-bloque font-bold text-[var(--texto)]">Accesos sensibles · 30 días</h2>
          <span className="text-nota text-[var(--texto-suave)]">Nombres de menores y exportaciones</span>
        </div>
        {accesos.length === 0
          ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3 text-tabla text-[var(--texto-suave)]">Sin accesos sensibles en los últimos 30 días.</p>
          : (
            <ul className="m-0 list-none p-0">
              {accesos.map((a) => (
                <li key={`${a.user_id}-${a.capacidad}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                  <span className="min-w-0 flex-1">
                    <b className="text-[var(--texto)]">{a.nombre ?? 'Cuenta sin nombre'}</b>
                    <span className="block text-nota text-[var(--texto-suave)]">{etiquetaCapacidadSensible(a.capacidad)}</span>
                  </span>
                  <span className="tabular-nums text-[var(--texto)]">{numero(a.accesos)} accesos · {numero(a.entidades)} fichas</span>
                  <span className="text-nota text-[var(--texto-suave)]">{fechaHora(a.ultimo)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="procesos" className={`${TARJETA} overflow-hidden`}>
        <h2 id="procesos" className="m-0 px-4 py-3 text-bloque font-bold text-[var(--texto)]">Procesos automáticos</h2>
        <ul className="m-0 list-none p-0">
          {procesos.map((p) => (
            <li key={p.proceso} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
              <span className="min-w-0 flex-1">
                <b className="text-[var(--texto)]">{etiquetaProceso(p.proceso)}</b>
                {p.detalle && <span className="block text-nota text-[var(--texto-suave)]">{p.detalle}</span>}
              </span>
              <span className="text-nota text-[var(--texto-suave)]">
                {p.ultima ? fechaHora(p.ultima) : 'Sin pasada registrada'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="auditoria" className={`${TARJETA} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h2 id="auditoria" className="m-0 text-bloque font-bold text-[var(--texto)]">Auditoría reciente</h2>
          <Link href={'/admin/usuarios#auditoria' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver más
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
                      {camposCambiados(a.cambios) && <span className="block text-nota text-[var(--texto-suave)]">Campos: {camposCambiados(a.cambios)}</span>}
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
