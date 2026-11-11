# panel-calidad.ps1 - Reglas de coherencia por grupo de CyL y recuento OK/KO (panel de calidad).
#
# Reglas que comprueba, por grupo y calculadas desde los partidos:
#   1. PJ = V + E + D
#   2. puntos = 3V + E
#   3. suma de goles a favor = suma de goles en contra
#
# Uso:  powershell -File scripts/claude/panel-calidad.ps1 -Temporada 2026-27
# Salida: una linea con grupos/OK/KO, el detalle de los KO y estado/panel-calidad-<temporada>.json

param(
  [string]$Temporada = '2026-27',
  [string]$Contenedor = 'facylf-postgres',
  [string]$Base = 'facylf'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$sql = @"
with resultados as (
  select m.phase_group_id gid, m.home_team_entry_id te, m.goles_local gf, m.goles_visitante gc
    from core.match m
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition e on e.id = g.competition_edition_id
    join core.season s on s.id = e.season_id
    join core.federation f on f.id = e.federation_id
   where f.nombre ilike '%castilla%' and s.etiqueta = '$Temporada'
     and m.goles_local is not null and m.goles_visitante is not null
  union all
  select m.phase_group_id, m.away_team_entry_id, m.goles_visitante, m.goles_local
    from core.match m
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition e on e.id = g.competition_edition_id
    join core.season s on s.id = e.season_id
    join core.federation f on f.id = e.federation_id
   where f.nombre ilike '%castilla%' and s.etiqueta = '$Temporada'
     and m.goles_local is not null and m.goles_visitante is not null
),
calc as (
  select gid, te, count(*) jugados,
         count(*) filter (where gf > gc) ganados,
         count(*) filter (where gf = gc) empatados,
         count(*) filter (where gf < gc) perdidos,
         sum(gf) gf, sum(gc) gc,
         sum(case when gf > gc then 3 when gf = gc then 1 else 0 end) puntos
    from resultados group by 1, 2
),
grupo as (
  select gid,
         sum(jugados - (ganados + empatados + perdidos)) descuadre_pj,
         sum(puntos - (3 * ganados + empatados)) descuadre_puntos,
         sum(gf) - sum(gc) descuadre_goles,
         count(*) equipos
    from calc group by 1
)
select count(*)::int grupos,
       count(*) filter (where descuadre_pj = 0 and descuadre_puntos = 0 and descuadre_goles = 0)::int ok,
       count(*) filter (where descuadre_pj <> 0 or descuadre_puntos <> 0 or descuadre_goles <> 0)::int ko
  from grupo;
"@

$fila = ($sql | docker exec -i $Contenedor psql -U facylf_admin -d $Base -At -F '|') -split '\|'
$resultado = [pscustomobject]@{
  temporada = $Temporada
  grupos    = [int]$fila[0]
  ok        = [int]$fila[1]
  ko        = [int]$fila[2]
  cuando    = (Get-Date).ToString('s')
}

if ($resultado.ko -gt 0) {
  Write-Host ("PANEL DE CALIDAD {0}: grupos {1} - OK {2} - KO {3}" -f $Temporada, $resultado.grupos, $resultado.ok, $resultado.ko) -ForegroundColor Red
} else {
  Write-Host ("PANEL DE CALIDAD {0}: grupos {1} - OK {2} - KO {3}" -f $Temporada, $resultado.grupos, $resultado.ok, $resultado.ko) -ForegroundColor Green
}

$salida = Join-Path $raiz ("estado\panel-calidad-{0}.json" -f $Temporada)
$resultado | ConvertTo-Json | Set-Content -LiteralPath $salida -Encoding utf8
Write-Host ("detalle: {0}" -f $salida)
if ($resultado.ko -gt 0) { exit 1 } else { exit 0 }
