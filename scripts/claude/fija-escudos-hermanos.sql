-- Copia el escudo a los clubes que son la MISMA entidad partida en varias filas de core.club y que no lo tienen.
-- Evidencia dura (no por parecido de nombre): la federación les da el mismo código de equipo
-- (core.team_entry.codigo_externo) que a la fila hermana que sí tiene escudo. Lista y razones, en
-- docs/plataforma-web/ESCUDOS-FALTAN.md §3.2.
--
-- Idempotente: sólo inserta si el club destino no tiene ya un escudo vigente. Se puede ejecutar dos veces.
-- No borra nada. Se aplicó el 10/11/2026 sobre facylf (PC) y sobre facylf_canonico_4 (publicada).
with pares(club_id, hermano) as (
  values (6, 84), (5414, 84), (5352, 5524), (17, 1516), (22587, 1522), (22637, 1517),
         (5533, 80), (12434, 1509), (37931, 1514), (39218, 80), (39253, 1481), (52187, 80)
)
insert into core.club_asset (club_id, tipo, mime_type, sha256, contenido, fuente_url, fuente_descripcion, observado_en, vigente)
select p.club_id, 'escudo', o.mime_type, o.sha256, o.contenido, o.fuente_url,
       'Copiado del club ' || p.hermano || ': mismo club partido en varias filas; la federación les da el mismo código de equipo',
       now(), true
  from pares p
  join core.club_asset o on o.club_id = p.hermano and o.tipo = 'escudo' and o.vigente
 where not exists (select 1 from core.club_asset x where x.club_id = p.club_id and x.tipo = 'escudo' and x.vigente)
returning club_id;
