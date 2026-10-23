-- 0025 · División (escalón) de cada edición, para los desplegables y para cruzar federaciones
--
-- Por qué: hoy se puede filtrar por categoría («juvenil») pero no por escalón («División de Honor», «Liga
-- Nacional», «Primera», «Segunda»…), y cada federación lo escribe distinto y en su lengua. `nivel` y
-- `provincia` existían desde la 0002 pero nadie los rellenaba.
--
-- Qué guarda:
--   · `division`: etiqueta comparable entre federaciones (lista cerrada abajo), sacada del nombre publicado;
--   · `nivel` (columna existente): orden ORIENTATIVO dentro de la categoría (1 = el más alto), sólo para
--     ordenar; no es una equivalencia oficial entre federaciones;
--   · `provincia` (columna existente): cuando el nombre la cita («(JAÉN)», «Castelló», «Salamanca»).
-- Medido el 21/10/2026 sobre 12.841 nombres: división en el 52 % (el resto son sobre todo copas, torneos y
-- ligas de base de un solo escalón, que no tienen división) y provincia en el 49 %.
-- Lo rellena el importador (`resuelveEdicion`) y, para lo ya importado, `pnpm lectura:reclasificar`.

alter table core.competition_edition
  add column if not exists division text not null default 'desconocida';

alter table core.competition_edition
  drop constraint if exists competition_edition_division_check;
alter table core.competition_edition
  add constraint competition_edition_division_check check (division in (
    'primera-federacion', 'segunda-federacion', 'tercera-federacion',
    'superliga', 'division-honor', 'liga-nacional', 'division-honor-regional',
    'preferente', 'autonomica', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'desconocida'));

comment on column core.competition_edition.division is
  'Escalón de la competición, normalizado desde el nombre publicado en castellano, catalán o euskera. '
  'El literal sigue en nombre_publicado. desconocida = el nombre no lo dice (copas, torneos, ligas de base).';

-- Desplegables: federación → temporada → categoría → división → grupo; y el cruce entre federaciones
-- (todas las «División de Honor juvenil» de 2025-26).
create index if not exists edition_categoria_division_idx
  on core.competition_edition (federation_id, season_id, categoria, division);
create index if not exists edition_cruce_federaciones_idx
  on core.competition_edition (season_id, categoria, division, federation_id);
