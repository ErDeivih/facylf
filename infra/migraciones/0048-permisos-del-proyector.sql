-- 0048 · El proyector recalcula tablas derivadas con TRUNCATE y le faltaban permisos.
--
-- Medido el 23/10/2026 contra la base real: la primera proyección de Canarias escribió sus 48 grupos y
-- después falló en `analytics.recalcula_frecuencias()` con «permission denied for table
-- frecuencia_nombre». Las funciones de recálculo son `security invoker` (no `security definer`), así que
-- el rol que proyecta (`facylf_publicador`) necesita TRUNCATE además de DELETE/INSERT/UPDATE. Sólo
-- `analytics.ojeo_jugador` lo tenía (0036); las cinco tablas que se vacían con TRUNCATE en 0024, 0026 y
-- 0029 no.
--
-- No se tocan las funciones: el permiso que falta es el de la tabla, y TRUNCATE sobre una tabla DERIVADA
-- que el proyector reescribe entera no da acceso a nada que no tuviera ya (podía borrarla fila a fila).

grant truncate on analytics.frecuencia_nombre, analytics.linea_equipo_temporada, analytics.zona_familia,
                  analytics.arbitro_persona, analytics.arbitro_temporada
  to facylf_publicador;
