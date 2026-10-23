import type { Consulta } from './contratos';

/**
 * Consultas de la cuenta del usuario (migración 0031): Mi panel, bandeja de avisos y favoritos.
 * Todas reciben el user_id de la SESIÓN (nunca de la URL) como primer parámetro.
 */

export type FilaAcceso = {
  id: number; tipo: string; etiqueta: string; url: string; orden: number; avisar: boolean;
  ultimo: string | null; ultimo_url: string | null; proximo: string | null; proximo_url: string | null;
};

/** «Mi panel»: los favoritos con su nombre actual, lo último y lo próximo. Parámetros: (1) user_id. */
export const MIS_ACCESOS: Consulta<FilaAcceso> = {
  nombre: 'mis-accesos',
  descripcion: 'Favoritos del usuario con su enlace actual, último resultado y próximo partido.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['id', 'tipo', 'etiqueta', 'url', 'orden', 'avisar', 'ultimo', 'ultimo_url', 'proximo', 'proximo_url'],
  sql: `select * from app.mis_accesos($1)`,
};

export type FilaAviso = { id: number; tipo: string; titulo: string; cuerpo: string | null; url: string | null; creada_en: string; leida: boolean; sin_leer: number };

/** Bandeja de avisos. Parámetros: (1) user_id, (2) límite. */
export const BANDEJA_AVISOS: Consulta<FilaAviso> = {
  nombre: 'bandeja-avisos',
  descripcion: 'Últimos avisos del usuario y cuántos tiene sin leer.',
  plan: 'indexado',
  presupuestoMs: 80,
  columnas: ['id', 'tipo', 'titulo', 'cuerpo', 'url', 'creada_en', 'leida', 'sin_leer'],
  sql: `
    select n.id, n.tipo, n.titulo, n.cuerpo, n.url, n.creada_en::text, n.leida_en is not null as leida,
           (select count(*) from app.notificacion x where x.user_id = $1 and x.leida_en is null)::int as sin_leer
      from app.notificacion n where n.user_id = $1
     order by n.creada_en desc limit $2`,
};

export const PARAMETROS_USUARIO: Record<string, readonly unknown[]> = {
  'mis-accesos': ['admin'],
  'bandeja-avisos': ['admin', 30],
};

export const CONSULTAS_USUARIO = [MIS_ACCESOS, BANDEJA_AVISOS] as const;

/**
 * Escrituras (desde Server Actions con el rol facylf_app; siempre con el user_id de la sesión):
 *  · guardar favorito:   insert into app.favorito (user_id, tipo, entidad_id, etiqueta) values ($1,$2,$3,$4)
 *                        on conflict (user_id, tipo, entidad_id, clave) do nothing
 *    (para un equipo, entidad_id = team_season: el disparador calcula la línea y lo seguirá cada temporada)
 *  · quitar:             delete from app.favorito where id = $2 and user_id = $1
 *  · reordenar:          update app.favorito set orden = $3 where id = $2 and user_id = $1
 *  · avisar sí/no:       update app.favorito set avisar = $3 where id = $2 and user_id = $1
 *  · marcar leído(s):    update app.notificacion set leida_en = now() where user_id = $1 and leida_en is null [and id = $2]
 *  · preferencias:       insert into app.preferencia_aviso (...) values (...) on conflict (user_id) do update set ...
 *  · suscripción push:   insert into app.suscripcion_push (user_id, endpoint, p256dh, auth, agente) values (...)
 *                        on conflict (endpoint) do update set user_id = excluded.user_id, fallos = 0
 * El Service Worker (public/sw.js) recibe {titulo, cuerpo, url}, muestra la notificación y al pulsarla abre url.
 */
