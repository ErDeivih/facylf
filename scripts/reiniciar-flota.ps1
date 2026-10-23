# Reinicia el SUPERVISOR UNICO de la flota para que adopte la lista de federaciones nueva.
#
# Sustituye a `scripts/reiniciar-recolectores.ps1`, que apunta a las 19 tareas antiguas
# (`FACyLF recolector *`) y ya no sirve con la arquitectura de un solo supervisor.
#
# Es seguro cortar a mitad: el recolector devuelve a 'pendiente' lo que quedara 'en_curso' al empezar
# cada ciclo, y el supervisor nuevo cierra los navegadores huerfanos al arrancar.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reiniciar-flota.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reiniciar-flota.ps1 -Simular

param([switch]$Simular)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot
$registro = Join-Path $raiz 'registros\supervisor-flota.log'

function Procesos-De-La-Flota {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'supervisor-flota\.mjs' -or $_.CommandLine -match 'ejecutar-oculto-nodo\.vbs') }
}

# Se corta el arbol entero, hojas -> raiz: matar solo `node` deja vivo al lanzador `wscript`, que
# volveria a arrancar el supervisor viejo con el entorno anterior.
$todos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$orden = New-Object System.Collections.Generic.List[int]
function Agrega-Descendientes([int]$padre) {
  foreach ($hijo in $todos | Where-Object ParentProcessId -eq $padre) {
    Agrega-Descendientes $hijo.ProcessId
    if (-not $orden.Contains([int]$hijo.ProcessId)) { $orden.Add([int]$hijo.ProcessId) }
  }
}
$raices = @($todos | Where-Object {
  $_.CommandLine -and $_.CommandLine -match 'supervisor-flota\.mjs' -and $_.ParentProcessId -notin ($todos | Where-Object { $_.CommandLine -and $_.CommandLine -match 'supervisor-flota\.mjs' }).ProcessId
})
foreach ($r in $raices) {
  Agrega-Descendientes $r.ProcessId
  if (-not $orden.Contains([int]$r.ProcessId)) { $orden.Add([int]$r.ProcessId) }
}
# Tambien el lanzador oculto del Programador, que es el padre del supervisor.
foreach ($p in $todos | Where-Object { $_.CommandLine -and $_.CommandLine -match 'ejecutar-oculto-nodo\.vbs' }) {
  if (-not $orden.Contains([int]$p.ProcessId)) { $orden.Add([int]$p.ProcessId) }
}

Write-Host ("Procesos a cortar: {0}" -f $orden.Count) -ForegroundColor Cyan
foreach ($idCorte in $orden) {
  $p = $todos | Where-Object ProcessId -eq $idCorte
  $linea = [string]$p.CommandLine
  Write-Host ("  {0,-8} {1}" -f $idCorte, $linea.Substring(0, [Math]::Min(90, $linea.Length)))
}

if ($Simular) { Write-Host '[SIMULACION] no se corta nada.'; exit 0 }

Stop-ScheduledTask -TaskName 'FACyLF flota' -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
foreach ($idCorte in $orden) { Stop-Process -Id $idCorte -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item (Join-Path $raiz '.supervisor-flota.lock') -Force -ErrorAction SilentlyContinue

Start-ScheduledTask -TaskName 'FACyLF flota'
Start-Sleep -Seconds 12

Write-Host ''
Write-Host '=== tarea ===' -ForegroundColor Cyan
Get-ScheduledTask -TaskName 'FACyLF flota' | Select-Object TaskName, State | Format-Table -AutoSize | Out-String -Width 200

Write-Host '=== procesos de recoleccion vivos ===' -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'supervisor-flota|recolector' } |
  Select-Object ProcessId, ParentProcessId, @{ n = 'cmd'; e = { $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)) } } |
  Format-Table -AutoSize | Out-String -Width 240

Write-Host '=== ultimas lineas del registro del supervisor ===' -ForegroundColor Cyan
Get-Content $registro -Tail 8
