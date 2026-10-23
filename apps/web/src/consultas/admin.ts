import type { Consulta } from './contratos';

/**
 * Consultas del PANEL DE ADMINISTRACIÓN (migraciones 0027, 0030-0035). Pantallas del prototipo 12, 15, 16, 17.
 *
 * Permisos: antes de cada una, la web comprueba `app.puede(usuario_de_la_sesion, capacidad)`:
 *   · administrar_usuarios  → panel-resumen, usuarios, invitaciones, auditoría, avisos, publicidad, accesos, salud
 *   · confirmar_identidades → casos de datos (lectura y revisión)
 *   · cualquiera con sesión → cobertura (es información útil para todos)
 * Todas leen tablas pequeñas (app.*, ops.*, analytics.edicion_capacidad): ninguna agrega tablas de hechos.
 * Las escrituras van al final del fichero; todas dejan rastro en app.auditoria porque la web hace antes
 * `select set_config('facylf.usuario', <user_id>, true)` dentro de la misma transacción.
 */

// ── Portada del panel ──────────────────────────────────────────────────────────────────────────────
export type FilaPanelResumen = {
  alertas_fallo: number; alertas_aviso: number; usuarios_pendientes: number; usuarios_activos: number; activos_7d: number;
  casos_graves: number; casos_abiertos: number; avisos_24h: number; avisos_ultima_pasada: string | null;
  ultima_copia: string | null; grupos_pendientes: number; huecos_anuncio_activos: number;
};
export const PANEL_RESUMEN: Consulta<FilaPanelResumen> = {
  nombre: 'admin-panel-resumen',
  rol: 'app',
  descripcion: 'Una fila con lo que el administrador mira al entrar: alertas, pendientes, casos, avisos, copias.',
  plan: 'agregado',
  presupuestoMs: 150,
  columnas: ['alertas_fallo', 'alertas_aviso', 'usuarios_pendientes', 'usuarios_activos', 'activos_7d', 'casos_graves',
    'casos_abiertos', 'avisos_24h', 'avisos_ultima_pasada', 'ultima_copia', 'grupos_pendientes', 'huecos_anuncio_activos'],
  sql: `select alertas_fallo::int, alertas_aviso::int, usuarios_pendientes::int, usuarios_activos::int, activos_7d::int,
       casos_graves::int, casos_abiertos::int, avisos_24h::int, avisos_ultima_pasada::text, ultima_copia::text,
       grupos_pendientes::int, huecos_anuncio_activos::int from ops.panel_resumen`,
};

// ── Usuarios ───────────────────────────────────────────────────────────────────────────────────────
export type FilaUsuarioAdmin = {
  user_id: string; nombre: string | null; rol: string; estado: string; paquete: string | null; valido_hasta: string | null;
  creado_en: string; ultimo_acceso: string | null; invitacion: string | null; capacidades: string[]; favoritos: number;
  avisos_sin_leer: number; push: boolean; motivo_estado: string | null; dias_esperando: number | null;
};
/** Parámetros: (1) estado o null, (2) texto o null (busca en nombre e id), (3) límite. */
export const USUARIOS_ADMIN: Consulta<FilaUsuarioAdmin> = {
  nombre: 'admin-usuarios',
  rol: 'app',
  descripcion: 'Usuarios con estado, paquete, caducidad, permisos sueltos, favoritos y último acceso. Pendientes primero.',
  plan: 'agregado',
  presupuestoMs: 200,
  columnas: ['user_id', 'nombre', 'rol', 'estado', 'paquete', 'valido_hasta', 'creado_en', 'ultimo_acceso', 'invitacion',
    'capacidades', 'favoritos', 'avisos_sin_leer', 'push', 'motivo_estado', 'dias_esperando'],
  sql: `
    select u.user_id, u.nombre_visible as nombre, u.rol, u.estado, u.paquete, u.valido_hasta::text, u.creado_en::text,
           u.ultimo_acceso::text, u.invitacion,
           coalesce((select array_agg(uc.capacidad order by uc.capacidad) from app.usuario_capacidad uc
                      where uc.user_id = u.user_id and (uc.hasta is null or uc.hasta >= current_date)), '{}') as capacidades,
           (select count(*) from app.favorito f where f.user_id = u.user_id)::int as favoritos,
           (select count(*) from app.notificacion n where n.user_id = u.user_id and n.leida_en is null)::int as avisos_sin_leer,
           exists (select 1 from app.suscripcion_push s where s.user_id = u.user_id) as push,
           u.motivo_estado,                                                  -- 0043: por qué está rechazado o bloqueado
           case when u.estado = 'pendiente' then (current_date - u.creado_en::date) end as dias_esperando
      from app.usuario u
     where ($1::text is null or u.estado = $1)
       and ($2::text is null or u.nombre_visible ilike '%' || $2 || '%' or u.user_id = $2)
     order by (u.estado = 'pendiente') desc, u.ultimo_acceso desc nulls last, u.creado_en desc
     limit $3`,
};

// ── Cuentas (0043) ─────────────────────────────────────────────────────────────────────────────────
export type FilaCuentasResumen = { pendientes: number; esperando_mas_de_3_dias: number; admins_sin_2fa: number; cuentas_frenadas: number;
  invitaciones_vigentes: number; caducan_en_30_dias: number; bloqueados: number; altas_7_dias: number };
/** Tarjeta «Cuentas» de la portada del panel. Sin parámetros. */
export const CUENTAS_RESUMEN: Consulta<FilaCuentasResumen> = {
  nombre: 'admin-cuentas-resumen',
  rol: 'app',
  descripcion: 'Resumen de cuentas: pendientes (y cuántos esperan más de 3 días), administradores sin doble verificación, cuentas frenadas, invitaciones vigentes, caducidades próximas, bloqueados y altas de la semana.',
  plan: 'agregado',
  presupuestoMs: 80,
  columnas: ['pendientes', 'esperando_mas_de_3_dias', 'admins_sin_2fa', 'cuentas_frenadas', 'invitaciones_vigentes', 'caducan_en_30_dias', 'bloqueados', 'altas_7_dias'],
  sql: `
    with c as (select nombre, valor from ops.chequeos_cuentas())
    select (select count(*) from app.usuario where estado = 'pendiente')::int as pendientes,
           coalesce((select valor from c where nombre = 'pendientes_esperando'), 0)::int as esperando_mas_de_3_dias,
           coalesce((select valor from c where nombre = 'administradores_sin_2fa'), 0)::int as admins_sin_2fa,
           coalesce((select valor from c where nombre = 'cuentas_frenadas'), 0)::int as cuentas_frenadas,
           (select count(*) from app.invitacion where anulada_en is null and usos < usos_max
               and (caduca_en is null or caduca_en > now()))::int as invitaciones_vigentes,
           (select count(*) from app.usuario where estado = 'activo' and valido_hasta between current_date and current_date + 30)::int as caducan_en_30_dias,
           (select count(*) from app.usuario where estado = 'bloqueado')::int as bloqueados,
           (select count(*) from app.usuario where creado_en > now() - interval '7 days')::int as altas_7_dias`,
};

export type FilaCaducidad = { user_id: string; nombre: string | null; paquete: string | null; valido_hasta: string; dias: number };
/** Usuarios activos cuyo paquete vence en los próximos N días (para renovar a tiempo). Parámetro: (1) días. */
export const CADUCIDADES: Consulta<FilaCaducidad> = {
  nombre: 'admin-caducidades',
  rol: 'app',
  descripcion: 'Usuarios activos cuyo paquete vence pronto, del más urgente al menos.',
  plan: 'agregado',
  presupuestoMs: 60,
  columnas: ['user_id', 'nombre', 'paquete', 'valido_hasta', 'dias'],
  sql: `
    select user_id, nombre_visible as nombre, paquete, valido_hasta::text, (valido_hasta - current_date)::int as dias
      from app.usuario
     where estado = 'activo' and valido_hasta between current_date and current_date + $1::int
     order by valido_hasta, user_id`,
};

// ── Invitaciones ───────────────────────────────────────────────────────────────────────────────────
export type FilaInvitacion = {
  codigo: string; paquete: string; usos: number; usos_max: number; caduca_en: string | null; creada_por: string;
  creada_en: string; nota: string | null; estado: 'vigente' | 'agotada' | 'caducada' | 'anulada'; personal: boolean;
};
/** Parámetros: (1) solo vigentes (boolean), (2) límite. */
export const INVITACIONES_ADMIN: Consulta<FilaInvitacion> = {
  nombre: 'admin-invitaciones',
  rol: 'app',
  descripcion: 'Códigos de invitación con usos, caducidad, si son personales y estado calculado (vigente, agotada, caducada, anulada).',
  plan: 'agregado',
  presupuestoMs: 80,
  columnas: ['codigo', 'paquete', 'usos', 'usos_max', 'caduca_en', 'creada_por', 'creada_en', 'nota', 'estado', 'personal'],
  sql: `
    select * from (
      select i.codigo, i.paquete, i.usos, i.usos_max, i.caduca_en::text, i.creada_por, i.creada_en::text, i.nota,
             case when i.anulada_en is not null then 'anulada'
                  when i.caduca_en is not null and i.caduca_en < now() then 'caducada'
                  when i.usos >= i.usos_max then 'agotada' else 'vigente' end as estado,
             i.correo_sha is not null as personal          -- atada a un correo (0043); el correo no se guarda
        from app.invitacion i) x
     where not $1::boolean or x.estado = 'vigente'
     order by x.estado = 'vigente' desc, x.creada_en desc
     limit $2`,
};

// ── Auditoría ──────────────────────────────────────────────────────────────────────────────────────
export type FilaAuditoria = { id: number; en: string; usuario: string; tabla: string; accion: string; clave: string | null; cambios: Record<string, unknown> | null; antes: unknown; despues: unknown };
/** Parámetros: (1) tabla o null, (2) usuario o null, (3) desde (timestamptz) o null, (4) límite. */
export const AUDITORIA_ADMIN: Consulta<FilaAuditoria> = {
  nombre: 'admin-auditoria',
  rol: 'app',
  descripcion: 'Cambios de administración, del más nuevo al más viejo, con sólo los campos que cambiaron.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['id', 'en', 'usuario', 'tabla', 'accion', 'clave', 'cambios', 'antes', 'despues'],
  sql: `
    select a.id, a.en::text, a.usuario, a.tabla, a.accion, a.clave,
           (select jsonb_object_agg(d.key, jsonb_build_object('antes', a.antes -> d.key, 'despues', d.value))
              from jsonb_each(a.despues) d where a.antes is not null and a.antes -> d.key is distinct from d.value) as cambios,
           a.antes, a.despues
      from app.auditoria a
     where ($1::text is null or a.tabla = $1) and ($2::text is null or a.usuario = $2)
       and ($3::timestamptz is null or a.en >= $3)
     order by a.en desc, a.id desc
     limit $4`,
};

// ── Calidad de datos ───────────────────────────────────────────────────────────────────────────────
export type FilaCasoResumen = { codigo: string; titulo: string; severidad: string; tratamiento: string; abiertos: number; confirmados: number; descartados: number; resueltos_solos: number; ultima_vez: string | null };
export const CASOS_RESUMEN: Consulta<FilaCasoResumen> = {
  nombre: 'admin-casos-resumen',
  rol: 'app',
  descripcion: 'Casos de datos por tipo, graves primero, con lo que la plataforma hace con cada uno.',
  plan: 'agregado',
  presupuestoMs: 150,
  columnas: ['codigo', 'titulo', 'severidad', 'tratamiento', 'abiertos', 'confirmados', 'descartados', 'resueltos_solos', 'ultima_vez'],
  sql: `
    select codigo, titulo, severidad, tratamiento, abiertos::int, confirmados::int, descartados::int, resueltos_solos::int,
           ultima_vez::text
      from ops.casos_resumen
     order by case severidad when 'grave' then 1 when 'aviso' then 2 else 3 end, abiertos desc, codigo`,
};

export type FilaCaso = {
  id: number; codigo: string; titulo: string; severidad: string; entidad: string; estado: string; tratamiento: string;
  detalle: Record<string, unknown>; detectado_en: string; visto_en: string; revisado_por: string | null; nota: string | null;
  federacion: string | null; competicion: string | null; temporada: string | null; url: string | null;
};
/** Parámetros: (1) código o null, (2) estado o null (por defecto la web pasa 'abierto'), (3) federación o null, (4) límite. */
export const CASOS_LISTA: Consulta<FilaCaso> = {
  nombre: 'admin-casos-lista',
  rol: 'app',
  descripcion: 'Casos de datos uno a uno con enlace a lo afectado (partido, edición o persona).',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['id', 'codigo', 'titulo', 'severidad', 'entidad', 'estado', 'tratamiento', 'detalle', 'detectado_en', 'visto_en',
    'revisado_por', 'nota', 'federacion', 'competicion', 'temporada', 'url'],
  sql: `
    select c.id, c.codigo, c.titulo, c.severidad, c.entidad, c.estado, c.tratamiento, c.detalle, c.detectado_en::text,
           c.visto_en::text, c.revisado_por, c.nota, f.codigo as federacion, ce.nombre_publicado as competicion, se.etiqueta as temporada,
           case when c.match_id is not null then '/partido/' || c.match_id
                when c.competition_edition_id is not null then '/competicion/' || c.competition_edition_id
                when c.person_id is not null then '/admin/identidades?persona=' || c.person_id end as url
      from ops.caso_dato c
      left join core.competition_edition ce on ce.id = c.competition_edition_id
      left join core.federation f on f.id = ce.federation_id
      left join core.season se on se.id = ce.season_id
     where ($1::text is null or c.codigo = $1) and ($2::text is null or c.estado = $2)
       and ($3::text is null or f.codigo = $3)
     order by case c.severidad when 'grave' then 1 when 'aviso' then 2 else 3 end, c.detectado_en desc
     limit $4`,
};

export type FilaCobertura = {
  federacion: string; nombre: string; temporada: string; ediciones: number; partidos: number;
  pct_resultado: number | null; pct_alineacion: number | null; pct_cambios: number | null; pct_tarjetas: number | null;
  pct_minuto_gol: number | null; pct_arbitro: number | null; pct_posicion: number | null;
  ediciones_completas: number; ediciones_alineaciones: number; ediciones_solo_resultados: number;
};
/** Parámetros: (1) temporada (etiqueta, p. ej. '2025-26') o null = la más reciente de cada federación. */
export const COBERTURA_FEDERACIONES: Consulta<FilaCobertura> = {
  nombre: 'cobertura-por-federacion',
  rol: 'app',
  descripcion: 'Qué datos da cada federación (cambios, tarjetas, minuto de gol…), medido sobre lo importado.',
  plan: 'agregado',
  presupuestoMs: 250,
  columnas: ['federacion', 'nombre', 'temporada', 'ediciones', 'partidos', 'pct_resultado', 'pct_alineacion', 'pct_cambios',
    'pct_tarjetas', 'pct_minuto_gol', 'pct_arbitro', 'pct_posicion', 'ediciones_completas', 'ediciones_alineaciones',
    'ediciones_solo_resultados'],
  sql: `
    select federacion, nombre, temporada, ediciones::int, partidos::int, pct_resultado, pct_alineacion, pct_cambios, pct_tarjetas,
           pct_minuto_gol, pct_arbitro, pct_posicion, ediciones_completas::int, ediciones_alineaciones::int,
           ediciones_solo_resultados::int
      from (select fc.*, row_number() over (partition by fc.federacion order by fc.orden desc) as rn
              from analytics.federacion_capacidad fc) x
     where ($1::text is null and x.rn = 1) or x.temporada = $1
     order by x.federacion`,
};

// ── Salud (complementa la pantalla 12) ─────────────────────────────────────────────────────────────
export type FilaChequeo = { nombre: string; area: string; estado: string; valor: number | null; umbral: number | null; detalle: unknown; alerta_desde: string | null; silenciada_hasta: string | null };
/** Todos los chequeos ahora mismo, con la alerta abierta si la hay. Sin parámetros. Tarda lo que ops.chequeos(). */
export const CHEQUEOS_AHORA: Consulta<FilaChequeo> = {
  nombre: 'admin-chequeos-ahora',
  rol: 'app',
  descripcion: 'Estado de cada chequeo en este momento (no el último guardado) y su alerta abierta.',
  plan: 'agregado',
  presupuestoMs: 1500,
  columnas: ['nombre', 'area', 'estado', 'valor', 'umbral', 'detalle', 'alerta_desde', 'silenciada_hasta'],
  sql: `
    select c.nombre, c.area, c.estado, c.valor, c.umbral, c.detalle, a.abierta_en::text as alerta_desde, a.silenciada_hasta::text
      from ops.chequeos() c left join ops.alerta a on a.nombre = c.nombre and a.estado = 'abierta'
     order by case c.estado when 'fallo' then 1 when 'aviso' then 2 when 'info' then 3 else 4 end, c.area, c.nombre`,
};

// ── Avisos ─────────────────────────────────────────────────────────────────────────────────────────
export type FilaAvisosDia = { dia: string; tipo: string; creados: number; leidos: number; por_push: number; por_correo: number };
/** Parámetros: (1) días hacia atrás. */
export const AVISOS_POR_DIA: Consulta<FilaAvisosDia> = {
  nombre: 'admin-avisos-por-dia',
  rol: 'app',
  descripcion: 'Avisos generados por día y tipo, y cuántos se leyeron o salieron por push y correo.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['dia', 'tipo', 'creados', 'leidos', 'por_push', 'por_correo'],
  sql: `
    select (n.creada_en at time zone 'Europe/Madrid')::date::text as dia, n.tipo, count(*)::int as creados,
           count(n.leida_en)::int as leidos, count(n.push_en)::int as por_push, count(n.correo_en)::int as por_correo
      from app.notificacion n
     where n.creada_en > now() - make_interval(days => $1::int)
     group by 1, 2 order by 1 desc, 3 desc`,
};

// ── Publicidad ─────────────────────────────────────────────────────────────────────────────────────
// 0042: «impresiones» = servidas; «vistas» = visibles de verdad (50 % del anuncio 1 s en pantalla), que es lo
// que se cobra; CTR = clics / impresiones (como AdSense).
export type FilaEspacio = { codigo: string; pagina: string; posicion: string; formato: string; proveedor: string; activo: boolean; campanas_vigentes: number; impresiones_30d: number; vistas_30d: number; clics_30d: number; pct_visible_30d: number | null };
export const ESPACIOS_ANUNCIO: Consulta<FilaEspacio> = {
  nombre: 'admin-espacios-anuncio',
  rol: 'app',
  descripcion: 'Huecos de anuncio con proveedor, estado, campañas vigentes y rendimiento de 30 días (servidas, vistas, clics).',
  plan: 'agregado',
  presupuestoMs: 120,
  columnas: ['codigo', 'pagina', 'posicion', 'formato', 'proveedor', 'activo', 'campanas_vigentes', 'impresiones_30d', 'vistas_30d', 'clics_30d', 'pct_visible_30d'],
  sql: `
    with d as (select espacio, sum(impresiones) imp, sum(vistas) vis, sum(clics) cl
                 from ops.anuncio_dia where dia > current_date - 30 group by espacio)
    select e.codigo, e.pagina, e.posicion, e.formato, e.proveedor, e.activo,
           (select count(*) from app.campana_anuncio c where c.activa and e.codigo = any(c.espacios)
               and current_date between c.desde and c.hasta)::int as campanas_vigentes,
           coalesce(d.imp, 0)::int as impresiones_30d, coalesce(d.vis, 0)::int as vistas_30d, coalesce(d.cl, 0)::int as clics_30d,
           round(100.0 * d.vis / nullif(d.imp, 0), 1)::float8 as pct_visible_30d
      from app.espacio_anuncio e left join d on d.espacio = e.codigo
     order by e.codigo`,
};

export type FilaCampana = { id: number; patrocinador: string; titulo: string; espacios: string[]; desde: string; hasta: string; activa: boolean; estado: string; reparto: string; impresiones: number; vistas: number; clics: number; ctr: number | null; ritmo: number | null; ritmo_estado: string; ingresos: number | null };
/** `ritmo`: servidas / las que tocarían por días transcurridos (1 = al día). `ritmo_estado`: 'al día', 'retrasada' (< 0,8 con más de un tercio de campaña), 'adelantada' o '—' (sin tope). */
export const CAMPANAS_ANUNCIO: Consulta<FilaCampana> = {
  nombre: 'admin-campanas-anuncio',
  rol: 'app',
  descripcion: 'Patrocinios directos con su estado, ritmo de entrega, rendimiento acumulado e importe.',
  plan: 'agregado',
  presupuestoMs: 120,
  columnas: ['id', 'patrocinador', 'titulo', 'espacios', 'desde', 'hasta', 'activa', 'estado', 'reparto', 'impresiones', 'vistas', 'clics', 'ctr', 'ritmo', 'ritmo_estado', 'ingresos'],
  sql: `
    select c.id, c.patrocinador, c.titulo, c.espacios, c.desde::text, c.hasta::text, c.activa,
           case when not c.activa then 'pausada' when current_date < c.desde then 'programada'
                when current_date > c.hasta then 'terminada' else 'en curso' end as estado,
           c.reparto,
           coalesce(s.imp, 0)::int as impresiones, coalesce(s.vis, 0)::int as vistas, coalesce(s.cl, 0)::int as clics,
           round(100.0 * s.cl / nullif(s.imp, 0), 2)::float8 as ctr,
           app.ritmo_campana(c, coalesce(s.imp, 0)::bigint, least(current_date, c.hasta))::float8 as ritmo,
           case when c.tope_impresiones is null or current_date < c.desde then '—'
                when app.ritmo_campana(c, coalesce(s.imp, 0)::bigint, least(current_date, c.hasta)) > 1.1 then 'adelantada'
                when app.ritmo_campana(c, coalesce(s.imp, 0)::bigint, least(current_date, c.hasta)) < 0.8
                 and (least(current_date, c.hasta) - c.desde + 1) * 3 > (c.hasta - c.desde + 1) then 'retrasada'
                else 'al día' end as ritmo_estado,
           round(coalesce(c.precio_cpm * s.vis / 1000, c.importe_fijo), 2)::float8 as ingresos
      from app.campana_anuncio c
      left join (select campana_id, sum(impresiones) imp, sum(vistas) vis, sum(clics) cl from ops.anuncio_dia
                  where campana_id <> 0 group by campana_id) s on s.campana_id = c.id
     order by (current_date between c.desde and c.hasta and c.activa) desc, c.desde desc`,
};

export type FilaInformeAnuncios = { espacio: string; campana_id: number; patrocinador: string | null; impresiones: number; vistas: number; clics: number; pct_visible: number | null; ctr: number | null; ingresos: number | null; estimado: boolean };
/** Parámetros: (1) desde, (2) hasta (fechas 'YYYY-MM-DD'). Exportable a CSV para facturar a cada patrocinador. */
export const INFORME_ANUNCIOS: Consulta<FilaInformeAnuncios> = {
  nombre: 'admin-informe-anuncios',
  rol: 'app',
  descripcion: 'Informe de publicidad por hueco y campaña en un periodo: servidas, vistas, clics, % visible, CTR e ingresos (AdSense estimado).',
  plan: 'agregado',
  presupuestoMs: 150,
  columnas: ['espacio', 'campana_id', 'patrocinador', 'impresiones', 'vistas', 'clics', 'pct_visible', 'ctr', 'ingresos', 'estimado'],
  sql: `
    select espacio, campana_id::int, patrocinador, impresiones::int, vistas::int, clics::int,
           pct_visible::float8, ctr::float8, ingresos::float8, estimado
      from ops.informe_anuncios($1::date, $2::date)`,
};

export type FilaAnunciosDia = { dia: string; impresiones: number; vistas: number; clics: number; ingresos_estimados: number };
/** Parámetros: (1) días hacia atrás. Serie para el gráfico del panel (días sin datos = 0: no hubo anuncios). */
export const ANUNCIOS_POR_DIA: Consulta<FilaAnunciosDia> = {
  nombre: 'admin-anuncios-por-dia',
  rol: 'app',
  descripcion: 'Serie diaria de publicidad: servidas, vistas, clics e ingresos estimados (patrocinios por CPM + AdSense estimado).',
  plan: 'agregado',
  presupuestoMs: 120,
  columnas: ['dia', 'impresiones', 'vistas', 'clics', 'ingresos_estimados'],
  sql: `
    select g.dia::date::text as dia, coalesce(sum(a.impresiones), 0)::int as impresiones, coalesce(sum(a.vistas), 0)::int as vistas,
           coalesce(sum(a.clics), 0)::int as clics,
           round(coalesce(sum(a.vistas * case when a.campana_id = 0 then ops.p('adsense_rpm_estimado') else c.precio_cpm end) / 1000, 0), 2)::float8
             as ingresos_estimados
      from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') g(dia)
      left join ops.anuncio_dia a on a.dia = g.dia::date
      left join app.campana_anuncio c on c.id = a.campana_id
     group by g.dia order by g.dia`,
};

// ── Accesos sensibles ──────────────────────────────────────────────────────────────────────────────
export type FilaAccesoSensible = { user_id: string; nombre: string | null; capacidad: string; accesos: number; entidades: number; primero: string; ultimo: string };
/** Parámetros: (1) días hacia atrás. */
export const ACCESOS_SENSIBLES: Consulta<FilaAccesoSensible> = {
  nombre: 'admin-accesos-sensibles',
  rol: 'app',
  descripcion: 'Quién vio nombres de menores o exportó datos, cuántas veces y a cuántas fichas.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['user_id', 'nombre', 'capacidad', 'accesos', 'entidades', 'primero', 'ultimo'],
  sql: `
    select r.user_id, u.nombre_visible as nombre, r.capacidad, count(*)::int as accesos, count(distinct r.entidad)::int as entidades,
           min(r.en)::text as primero, max(r.en)::text as ultimo
      from app.registro_acceso r left join app.usuario u on u.user_id = r.user_id
     where r.en > now() - make_interval(days => $1::int)
     group by r.user_id, u.nombre_visible, r.capacidad order by accesos desc`,
};

// ── Procesos ───────────────────────────────────────────────────────────────────────────────────────
export type FilaProcesos = { proceso: string; ultima: string | null; detalle: string | null };
export const PROCESOS: Consulta<FilaProcesos> = {
  nombre: 'admin-procesos',
  rol: 'app',
  descripcion: 'Última vez que corrió cada proceso automático (proyector, avisos, copia, restauración, vigilancia).',
  plan: 'agregado',
  presupuestoMs: 200,
  columnas: ['proceso', 'ultima', 'detalle'],
  sql: `
    select 'proyector' as proceso, max(proyectado_en)::text as ultima,
           (select count(*) from analytics.proyeccion_pendiente)::text || ' grupos pendientes' as detalle from analytics.proyeccion_grupo
    union all select 'avisos', ultima_pasada::text, pasadas::text || ' pasadas' from app.estado_generador
    union all select 'copia', max(terminada_en)::text, null from ops.copia where tipo = 'copia' and correcta
    union all select 'restauracion de prueba', max(terminada_en)::text, null from ops.copia where tipo = 'restauracion_prueba' and correcta
    union all select 'vigilancia', max(ultima_vez)::text, (select count(*) from ops.alerta where estado = 'abierta')::text || ' alertas abiertas' from ops.alerta
    union all select 'casos de datos', max(visto_en)::text, null from ops.caso_dato`,
};

// ── Uso (0039) ─────────────────────────────────────────────────────────────────────────────────────
export type FilaUsoDia = { dia: string; vistas: number; usuarios: number; pct_cache: number | null; ms_medio: number | null; activos_7d: number };
/** Parámetros: (1) días. Una fila por día (también los días sin visitas, con 0). */
export const USO_POR_DIA: Consulta<FilaUsoDia> = {
  nombre: 'admin-uso-por-dia',
  rol: 'app',
  descripcion: 'Páginas vistas, usuarios, acierto de caché y tiempo medio por día; activos en 7 días.',
  plan: 'agregado',
  presupuestoMs: 100,
  columnas: ['dia', 'vistas', 'usuarios', 'pct_cache', 'ms_medio', 'activos_7d'],
  sql: `select dia::text, vistas::int, usuarios::int, pct_cache::float8, ms_medio::float8, activos_7d::int from ops.uso_resumen($1)`,
};
export type FilaUsoPantalla = { ruta: string; vistas: number; pct_cache: number | null; ms_medio: number | null; dias_con_uso: number };
/** Parámetros: (1) días. Qué pantallas se usan, de más a menos. */
export const USO_POR_PANTALLA: Consulta<FilaUsoPantalla> = {
  nombre: 'admin-uso-por-pantalla',
  rol: 'app',
  descripcion: 'Qué pantallas se usan de verdad (y cuáles no), con acierto de caché y tiempo medio.',
  plan: 'agregado',
  presupuestoMs: 100,
  columnas: ['ruta', 'vistas', 'pct_cache', 'ms_medio', 'dias_con_uso'],
  sql: `select ruta, vistas::int, pct_cache::float8, ms_medio::float8, dias_con_uso::int from ops.uso_por_pantalla($1)`,
};

export const PARAMETROS_ADMIN: Record<string, readonly unknown[]> = {
  'admin-panel-resumen': [],
  'admin-usuarios': [null, null, 100],
  'admin-invitaciones': [false, 100],
  'admin-cuentas-resumen': [],
  'admin-caducidades': [30],
  'admin-auditoria': [null, null, null, 100],
  'admin-casos-resumen': [],
  'admin-casos-lista': [null, 'abierto', null, 100],
  'cobertura-por-federacion': [null],
  'admin-chequeos-ahora': [],
  'admin-avisos-por-dia': [30],
  'admin-espacios-anuncio': [],
  'admin-campanas-anuncio': [],
  'admin-informe-anuncios': ['2026-10-01', '2026-10-31'],
  'admin-anuncios-por-dia': [30],
  'admin-accesos-sensibles': [30],
  'admin-procesos': [],
  'admin-uso-por-dia': [14],
  'admin-uso-por-pantalla': [30],
};

export const CONSULTAS_ADMIN = [PANEL_RESUMEN, USUARIOS_ADMIN, CUENTAS_RESUMEN, CADUCIDADES, INVITACIONES_ADMIN, AUDITORIA_ADMIN, CASOS_RESUMEN, CASOS_LISTA,
  COBERTURA_FEDERACIONES, CHEQUEOS_AHORA, AVISOS_POR_DIA, ESPACIOS_ANUNCIO, CAMPANAS_ANUNCIO, INFORME_ANUNCIOS, ANUNCIOS_POR_DIA, ACCESOS_SENSIBLES, PROCESOS,
  USO_POR_DIA, USO_POR_PANTALLA] as const;

/**
 * ESCRITURAS del panel (Server Actions; rol facylf_app; en una transacción que empieza con
 * `select set_config('facylf.usuario', $sesion, true)` para que la auditoría tenga autor):
 *
 *  Usuarios
 *   · aprobar:           select app.aprueba_usuario($user, $admin, $paquete)
 *   · rechazar:          select app.cambia_estado_usuario($admin, $user, 'rechazado', $motivo)   (sólo pendientes; motivo obligatorio)
 *   · bloquear:          select app.cambia_estado_usuario($admin, $user, 'bloqueado', $motivo)   (corta sus sesiones)
 *   · reactivar:         select app.cambia_estado_usuario($admin, $user, 'activo')
 *                        (0043; errores: SIN_PERMISO, FALTA_MOTIVO, NO_A_UNO_MISMO, ULTIMO_ADMINISTRADOR, SOLO_PENDIENTES)
 *   · paquete/caducidad: update app.usuario set paquete = $2, valido_hasta = $3 where user_id = $1
 *   · hacer admin:       update app.usuario set rol = 'administrador' where user_id = $1   (pide 2FA y confirmar dos veces)
 *   · permiso suelto:    insert into app.usuario_capacidad (user_id, capacidad, concedida_por, hasta, motivo)
 *                        values ($1,$2,$admin,$3,$4) on conflict (user_id, capacidad) do update set hasta = excluded.hasta, motivo = excluded.motivo
 *   · quitar permiso:    delete from app.usuario_capacidad where user_id = $1 and capacidad = $2
 *   · dar de baja:       update app.usuario set estado = 'baja', activo = false where user_id = $1
 *                        (y en Better Auth: revocar sesiones del usuario). Nunca se borra la fila: la auditoría la referencia.
 *  Invitaciones
 *   · crear:   select app.crea_invitacion($admin, $paquete, $usos, $dias, $correo_o_null, $nota)  → el código (0043)
 *              con correo = personal y de un uso; la web manda el correo con el enlace /registro?codigo=…
 *   · anular:  select app.anula_invitacion($admin, $codigo)
 *  Registro
 *   · modo:    update app.ajuste set valor = $1 where clave = 'registro_modo'   ($1 ∈ invitacion | aprobacion | abierto)
 *  Casos de datos
 *   · revisar: select ops.revisa_caso($id, $estado, $usuario, $nota)   ($estado ∈ confirmado | corregido | descartado)
 *  Alertas
 *   · silenciar 24 h: update ops.alerta set silenciada_hasta = now() + interval '24 hours' where nombre = $1
 *                     (las de área «copias» no se pueden silenciar: la web no enseña el botón)
 *  Publicidad
 *   · encender un hueco: update app.espacio_anuncio set activo = true, proveedor = $2 where codigo = $1
 *   · apagar todo:       update app.espacio_anuncio set activo = false     (botón rojo, sin confirmación doble)
 *   · campaña:           insert/update app.campana_anuncio (...)
 */
