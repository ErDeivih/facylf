# ── CUÁNTO TARDA DE VERDAD EL RESUMEN DEL CANÓNICO ──────────────────────────────────────────────────────
#
# La prueba de contrato de `apps/web/test/consultas.test.ts` falla por tiempo agotado, y el aviso decía «5 s»
# cuando esa consulta declara 20. Antes de tocar nada hay que saber cuánto tarda de verdad: si son 6 s, sobra
# presupuesto y el problema era sólo el mensaje; si son 40, la consulta ya no sirve para una web y hay que
# sustituirla por los agregados de `analytics.*`, que es lo que el propio comentario de `RESUMEN_CANONICO`
# anticipa.
#
# ── POR QUÉ ESTÁ EN POWERSHELL Y NO EN `.sh` (29/09/2026) ───────────────────────────────────────────────
#
# Porque en este PC **no hay bash**: el `bash` que aparece en el PATH es el de WSL, y falla con
# «Bash/Service/0x8007274c» (el servicio de WSL no está levantado). Un `.sh` aquí no se ejecuta y encima no da
# error visible si va dentro de una tubería. El canónico de la web vive en ESTE PC, así que la herramienta es de
# aquí, y aquí se escribe en lo que sí funciona. Los `.sh` de `scripts/servidor/` son otra cosa: esos corren en
# el servidor, que sí tiene bash.
#
# Se ejecuta con `psql` DENTRO del contenedor y con el ROL DE LECTURA, el mismo que usa la web. El SQL de los
# recuentos se escribe aquí a mano a propósito: es una medición de dónde se va el tiempo, no la consulta que
# sirve la web, y esas dos cosas no deben compartir texto (si compartieran, una medición podría "arreglar" la
# consulta sin que nadie se enterara).
#
# Uso:  pwsh -File scripts/mide-resumen-canonico.ps1 [-Veces 2]

param([int]$Veces = 2)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$envArchivo = Join-Path $raiz '.env'

$linea = Get-Content $envArchivo | Where-Object { $_ -like 'DATABASE_URL_LECTOR=*' } | Select-Object -First 1
if (-not $linea) { throw "no encuentro DATABASE_URL_LECTOR en $envArchivo" }
$url = $linea -replace '^DATABASE_URL_LECTOR=', ''
if ($url -notmatch '://([^:]+):([^@]*)@([^:/]+):(\d+)/(\w+)') { throw 'no se pudo leer la URL del rol de lectura' }
# Los grupos, contados: 1 usuario · 2 contraseña · 3 host · 4 puerto · 5 base. Equivocarse aquí no falla en
# silencio —psql dice «database "5433" does not exist»—, pero conviene no equivocarse.
$usuario = $matches[1]
$base = $matches[5]

# `docker exec -e PGPASSWORD` SIN valor hereda la variable del entorno del cliente: así la contraseña no viaja
# dentro de la línea de órdenes (donde la vería cualquiera que liste procesos).
$env:PGPASSWORD = $matches[2]
$contenedor = if ($env:FACYLF_CONTENEDOR_POSTGRES) { $env:FACYLF_CONTENEDOR_POSTGRES } else { 'facylf-postgres' }

$sql = @'
\timing on
\echo -- competition_edition (distinct federación)
select count(distinct federation_id) from core.competition_edition;
\echo -- competition_edition
select count(*) from core.competition_edition;
\echo -- phase_group
select count(*) from core.phase_group;
\echo -- match
select count(*) from core.match;
\echo -- match_report
select count(*) from core.match_report;
\echo -- appearance
select count(*) from core.appearance;
\echo -- match_event
select count(*) from core.match_event;
\echo -- person
select count(*) from core.person;
\echo -- coverage_checkpoint completos
select count(*) from ops.coverage_checkpoint where visibility_state = 'completa';
\echo -- coverage_checkpoint calculado_en
select max(calculado_en) from ops.coverage_checkpoint;
'@

$temporal = Join-Path $env:TEMP 'facylf-mide-resumen.sql'
Set-Content -LiteralPath $temporal -Value $sql -Encoding ASCII
& docker cp $temporal "${contenedor}:/tmp/facylf-mide-resumen.sql" | Out-Null

Write-Host "canónico: $contenedor  ·  rol $usuario  ·  base $base"
for ($vuelta = 1; $vuelta -le $Veces; $vuelta++) {
  Write-Host ""
  Write-Host "════════ vuelta $vuelta de $Veces (psql con \timing) ════════"
  & docker exec -e PGPASSWORD $contenedor psql -U $usuario -d $base -X -q -f /tmp/facylf-mide-resumen.sql 2>&1 |
    Where-Object { $_ -match 'Time:|ERROR|FATAL|^--' }
}
Remove-Item -LiteralPath $temporal -ErrorAction SilentlyContinue
