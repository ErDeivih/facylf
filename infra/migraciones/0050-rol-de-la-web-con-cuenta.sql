-- 0050 · El rol de la web para las páginas con cuenta (`facylf_app`) puede leer lo mismo que el público.
--
-- Decidido el 23/10/2026 (ESTADO-DEEPSEEK, bloque de las 12:55): la web tendrá DOS conexiones:
--   · `facylf_lector` para todo lo público (fichas, clasificaciones, rankings…);
--   · `facylf_app` para las páginas con cuenta (Mi panel, avisos, Mi cuenta, panel de administración).
-- Medido el 23/10 con `pruebas/sql/m50.mjs` (cada consulta con su rol): con `facylf_app` fallaban las consultas
-- que MEZCLAN datos de usuario con el modelo de lectura (p. ej. `admin-casos-lista` une casos con
-- competiciones; `admin-procesos`, el generador de avisos con la proyección), y todas las públicas, porque
-- `facylf_app` sólo podía leer `app.*`.
--
-- Arreglo: `facylf_app` HEREDA los permisos de lectura de `facylf_lector` (que sólo tiene SELECT: la web sigue
-- sin poder escribir en `core` ni en `analytics`). Los roles se crearon NOINHERIT (0001, 0027) a propósito; desde
-- PostgreSQL 16 la herencia se decide por concesión, así que se activa sólo para ésta (`with inherit true`) y
-- sin `set` (la web no puede hacerse pasar por el lector). Más los tres objetos de vigilancia que lee el panel.

grant facylf_lector to facylf_app with inherit true, set false;

grant select on app.estado_generador, ops.alerta, ops.copia to facylf_app;

-- La portada del panel enseña los chequeos en vivo. `ops.chequeos()` lee tablas de operación que la web no ve
-- (lotes, copias, estadísticas): se ejecuta con los permisos de su dueño y sólo devuelve el resultado.
alter function ops.chequeos() security definer set search_path = ops, app, analytics, core, public, pg_temp;
grant execute on function ops.chequeos() to facylf_app;
