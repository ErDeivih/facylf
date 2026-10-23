<#
  Trae al canonico del PC la temporada 2026-27 de CyL que recoge el servidor y genera el informe de
  U.D. Santa Marta de Tormes "B" juvenil (1a Provincial Salamanca, grupo 24218968) con PDF.
  ESCRIBE en el canonico (importacion): se lanza a mano, con Docker funcionando.

  Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\importa-y-genera-santa-marta.ps1
  ASCII a proposito (PowerShell 5.1).
#>
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

# 0. Docker tiene que contestar.
$p = Start-Process -FilePath docker -ArgumentList 'ps' -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\dps.txt"
if (-not $p.WaitForExit(30000)) { $p.Kill(); throw 'Docker no contesta: reinicia Docker Desktop y vuelve a lanzar esto.' }

# 1. Importar la temporada entera desde el paquete del servidor (no toca la cola viva del PC).
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2026-27 -Paquete _traspaso\cyl-2026-27.sqlite

# 2. La inscripcion del equipo.
$linea = Get-Content .env | Where-Object { $_ -like 'DATABASE_URL_LECTOR=*' } | Select-Object -First 1
$null = ($linea -replace '^DATABASE_URL_LECTOR=', '') -match '://([^:]+):([^@]*)@([^:/]+):(\d+)/(\w+)'
$env:PGPASSWORD = $matches[2]
$sql = "select te.id from core.team_entry te join core.phase_group pg on pg.id=te.phase_group_id join core.competition_edition ce on ce.id=pg.competition_edition_id join core.season s on s.id=ce.season_id where pg.codigo_externo='24218968' and s.etiqueta='2026-27' and te.nombre_en_fuente ilike '%santa marta%'"
$id = (& docker exec -e PGPASSWORD facylf-postgres psql -U $matches[1] -d $matches[5] -X -q -t -A -c $sql | Select-Object -First 1).Trim()
if (-not $id) { throw 'No encuentro la inscripcion de Santa Marta B en el grupo 24218968.' }
Write-Host "Inscripcion: $id" -ForegroundColor Cyan

# 3. Informe con PDF.
pnpm informe:dashboard --equipo $id --pdf
Get-ChildItem informes, output\pdf -Filter '*santa-marta*' -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 6 FullName, LastWriteTime
