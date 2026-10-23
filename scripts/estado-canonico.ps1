# ── ESTADO ACTUAL DEL CANÓNICO, EN UNA PANTALLA ─────────────────────────────────────────────────────────
#
# Reúne en un sitio lo que hasta ahora había que sacar a mano con `db:psql` y cuatro consultas sueltas: qué hay
# cargado, cuánto de cada temporada está COMPLETO (que es lo único que puede entrar en un informe) y cuánto de
# cada federación. Sirve para tres cosas concretas:
#
#   · saber si una temporada puede usarse en un informe (`visibility_state = 'completa'`);
#   · ver si el importador va avanzando y por dónde va;
#   · tener la foto del canónico en un traspaso sin depender de la memoria de nadie.
#
# Va en PowerShell porque el canónico vive en este PC y **aquí no hay bash** (el del PATH es el de WSL y falla
# con `Bash/Service/0x8007274c`, sin dar error visible dentro de una tubería). Ver `mide-resumen-canonico.ps1`.
#
# Uso:  & .\scripts\estado-canonico.ps1

$ErrorActionPreference = 'Stop'
# La consola de Windows no está en UTF-8 por defecto y los acentos y las rayas salían como «â €â€». Esto no
# cambia ningún dato: es sólo para que lo que se lee aquí se pueda leer.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$raiz = Split-Path -Parent $PSScriptRoot
$linea = Get-Content (Join-Path $raiz '.env') | Where-Object { $_ -like 'DATABASE_URL_LECTOR=*' } | Select-Object -First 1
if (-not $linea) { throw 'no encuentro DATABASE_URL_LECTOR en .env' }
$url = $linea -replace '^DATABASE_URL_LECTOR=', ''
if ($url -notmatch '://([^:]+):([^@]*)@([^:/]+):(\d+)/(\w+)') { throw 'URL del rol de lectura ilegible' }
$usuario = $matches[1]
$base = $matches[5]
$contenedor = if ($env:FACYLF_CONTENEDOR_POSTGRES) { $env:FACYLF_CONTENEDOR_POSTGRES } else { 'facylf-postgres' }
# `-e PGPASSWORD` sin valor: la contraseña va por el entorno del cliente, no en la línea de órdenes.
$env:PGPASSWORD = $matches[2]

function Consulta([string]$titulo, [string]$sql) {
  Write-Host ""
  Write-Host "── $titulo ──"
  & docker exec -e PGPASSWORD $contenedor psql -U $usuario -d $base -X -q -c $sql 2>&1 | Where-Object { $_ -notmatch '^\s*$' }
}

Consulta 'volumen total' @'
select (select count(*) from core.federation) as federaciones,
       (select count(*) from core.season) as temporadas,
       (select count(*) from core.competition_edition) as ediciones,
       (select count(*) from core.phase_group) as grupos,
       (select count(*) from core.team_entry) as inscripciones,
       (select count(*) from core.match) as partidos,
       (select count(*) from core.match_report) as actas,
       (select count(*) from core.appearance) as participaciones,
       (select count(*) from core.match_event) as eventos,
       (select count(*) from core.person) as personas;
'@

Consulta 'por temporada (completas = lo único que entra entero en un informe)' @'
select s.etiqueta as temporada,
       count(*) as ediciones,
       sum(case when ce.visibility_state = 'completa' then 1 else 0 end) as completas,
       round(100.0 * sum(case when ce.visibility_state = 'completa' then 1 else 0 end) / count(*)) as pct
from core.competition_edition ce
join core.season s on s.id = ce.season_id
group by s.etiqueta
order by s.etiqueta desc;
'@

Consulta 'por federación (las 19 territoriales)' @'
select f.codigo,
       count(distinct ce.id) as ediciones,
       count(distinct case when ce.visibility_state = 'completa' then ce.id end) as completas,
       count(distinct m.id) as partidos,
       count(distinct mr.match_id) as actas
from core.federation f
left join core.competition_edition ce on ce.federation_id = f.id
left join core.phase_group pg on pg.competition_edition_id = ce.id
left join core.match m on m.phase_group_id = pg.id
left join core.match_report mr on mr.match_id = m.id
group by f.codigo
order by partidos desc nulls last;
'@

Consulta 'lo más reciente importado (¿sigue avanzando el importador?)' @'
select max(calculado_en) as ultimo_calculo_de_cobertura,
       count(*) as grupos_con_punto_de_control,
       sum(case when visibility_state = 'completa' then 1 else 0 end) as grupos_completos
from ops.coverage_checkpoint;
'@
