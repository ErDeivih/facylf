-- 0020 - La tabla oficial: TRES estados más, porque «sin archivar» y «rechazada» no lo explicaban todo.
--
-- Medido el 25/09/2026, al ir a importar las 7.980 tablas oficiales archivadas y sin importar: baleares,
-- galicia y euskadi tienen la clasificación archivada y **cero** tablas oficiales dentro del canónico. La
-- causa no era ninguna de las tres anteriores:
--
--   · el archivo ESTÁ (`clasificacion.html.gz`, 20-170 KB), y trae la tabla de verdad —posición, equipo,
--     puntos, jugados, ganados…—;
--   · el lector que usa el importador (`parseaClasificacionHtml`, la maqueta PNFG) devuelve **cero filas**:
--     la federación publica la clasificación con OTRA maqueta (`NFG_VisClasificacion` del marco «nova2»).
--
-- Llamar a eso «sin_archivar» es falso (el archivo está) y llamarlo «rechazada» también (no es que la
-- federación la publique mal: es que no la sabemos leer, y eso es un problema NUESTRO, arreglable). Medido
-- con `scripts/mide-clasificaciones-archivadas.mts`: baleares 448 clasificaciones archivadas, 448 sin filas.
--
--   'sin_filas'  · hay archivo y no trae filas de clasificación (la federación aún no la publica, o la
--                  publica de una forma que no se archiva con tabla).
--   'ilegible'   · hay archivo y trae TABLA, pero el lector de hoy no saca ni una fila. Es un hueco del
--                  lector, no de la fuente, y por eso va aparte.
--   'sin_corte'  · la tabla se lee bien, pero el canónico no tiene ninguna jornada completa a la que
--                  colgarla (una temporada que acaba de empezar). Sin corte no se escribe la foto, porque
--                  hacerla pasar por «la tabla de J30» sería mentir sobre su fecha.
--
-- Los seis valores juntos responden a la única pregunta que importa: ¿por qué este grupo no tiene tabla
-- oficial? Y cada uno apunta a un sitio distinto: al recolector, a la federación, al lector, o a la jornada.

alter table ops.coverage_checkpoint
  drop constraint if exists coverage_tabla_oficial_estado_valido;

alter table ops.coverage_checkpoint
  add constraint coverage_tabla_oficial_estado_valido
  check (tabla_oficial_estado is null or tabla_oficial_estado in
    ('importada', 'rechazada', 'sin_archivar', 'sin_filas', 'ilegible', 'sin_corte'));

comment on column ops.coverage_checkpoint.tabla_oficial_estado is
  'importada | rechazada | sin_archivar | sin_filas | ilegible | sin_corte. Null = no calculado. '
  'Dice POR QUÉ no está la tabla oficial del grupo, y cada valor apunta a un sitio distinto.';
