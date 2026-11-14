# actualizacion-semanal.ps1 -- pasada semanal completa de CyL: importa la cola del PC Y lo traido del servidor,
# comprueba que no duplica y republica la demo. Pensada para una tarea programada semanal (domingo por la manana),
# despues del ciclo diario. No cambia pausas ni workers.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-semanal.ps1 -Simular
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-semanal.ps1
param([switch]$Simular)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$Raiz = (Get-Location).Path
$Estado = Join-Path $Raiz 'estado'
$Log = Join-Path $Estado 'actualizacion-semanal.log'
$Marca = Join-Path $Estado 'actualizacion-semanal.json'
$Candado = Join-Path $Estado 'actualizacion.lock'
New-Item -ItemType Directory -Force -Path $Estado | Out-Null

function Log([string]$t) { $l = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $t; Add-Content $Log $l; Write-Output $l }

# Candado compartido con la tarea horaria: si hay una importacion en curso (menos de 45 min), no se solapan.
if (Test-Path $Candado) {
  $edad = ((Get-Date) - (Get-Item $Candado).LastWriteTime).TotalHours
  if ($edad -lt 0.75) { Log ("ya hay una actualizacion en curso (candado de {0:N1} h); se sale sin tocar nada" -f $edad); exit 0 }
}
Set-Content $Candado (Get-Date -Format 'o') -Encoding ASCII

try {
  & docker inspect -f '{{.State.Running}}' facylf-postgres 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'FALLO: PostgreSQL no esta disponible'; exit 2 }
  if ((& docker inspect -f '{{.State.Running}}' facylf-postgres).Trim() -ne 'true') { Log 'FALLO: PostgreSQL no esta arrancado'; exit 2 }

  $cuenta = 'select (select count(*) from core.match) || ''|'' || (select count(*) from core.match_report) || ''|'' || (select count(*) from core.appearance)'
  $antes = (& docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc $cuenta | Out-String).Trim()
  Log "antes: partidos|actas|apariciones = $antes"

  if ($Simular) {
    Log 'SIMULACION: se ejecutaria scripts\ciclo-diario-cyl.ps1 -Detallado (incluye traer del servidor) y, si la app esta viva, tmp\publica-demo.ps1; no se escribe nada'
    exit 0
  }

  # 1) ciclo completo (PC + servidor). Es el mismo que corre a diario; ahora tambien en la pasada semanal.
  Log 'importando: powershell scripts\ciclo-diario-cyl.ps1 -Detallado'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Raiz 'scripts\ciclo-diario-cyl.ps1') -Detallado 2>&1 | ForEach-Object { Log $_ }
  $codigo = $LASTEXITCODE
  if ($codigo -ne 0) { Log "FALLO: el ciclo diario devolvio $codigo"; exit 3 }

  $despues = (& docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc $cuenta | Out-String).Trim()
  Log "despues: partidos|actas|apariciones = $despues"

  # 2) publicar la demo si la app responde; si no, avisar (el canonico ya esta importado)
  $publica = Join-Path $Raiz 'tmp\publica-demo.ps1'
  $appViva = $false
  try { $appViva = (Invoke-WebRequest -Uri 'http://127.0.0.1:3100/' -UseBasicParsing -TimeoutSec 8).StatusCode -eq 200 } catch { }
  if (-not (Test-Path $publica)) { Log 'AVISO: falta tmp\publica-demo.ps1' }
  elseif (-not $appViva) { Log 'AVISO: la app no responde en :3100; demo NO republicada (se reintenta la proxima semana)' }
  else {
    Log 'publicando demo'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publica 2>&1 | ForEach-Object { Log $_ }
  }

  @{ antes = $antes; despues = $despues; ejecutado_en = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') } | ConvertTo-Json | Set-Content $Marca -Encoding ASCII
  Log 'hecho: pasada semanal completada'
} finally {
  Remove-Item $Candado -Force -ErrorAction SilentlyContinue
}
exit 0
