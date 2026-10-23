#!/usr/bin/env powershell
<#
    ARREGLO DE MADRID (y de las otras tres del PC).

    LO QUE SE MIDIÓ EL 28/09/2026: Madrid tenía 119 de 360 minutos sin pedir nada, mientras Castilla y León
    sólo 7. Y no era su cola: tenía **40.120 trabajos disponibles** y no los pedía. La causa estaba en el
    gobernador del PC:

      · `entorno-flota.ps1` declara FACYLF_MEMORIA_GB = 3  →  plazas = (3 - 1,5) / 0,75 = **2 plazas**;
      · el PC recoge CUATRO federaciones (valencia, madrid, cataluna, federación);
      · con 2 plazas para 4 federaciones y un turno de 20 minutos, cada una pasa la mitad del tiempo esperando
        turno. Eso son exactamente los parones que se veían.

    Y había **6 fichas de plaza ocupadas** (slot-1, 7, 8, 9, 10 y 11) para un reparto de 2: son fichas viejas
    de cuando el PC declaraba más memoria, que nadie limpió. El gobernador las cuenta como ocupadas.

    ARREGLO: 4,5 GB declarados → **4 plazas, una por federación** (nunca hay que ceder el turno), limpiar las
    fichas huérfanas y reiniciar la flota para que el supervisor reparta el entorno nuevo.
#>
$ErrorActionPreference = 'Continue'
$raiz = 'F:\EspacioCodigo\facylf'
Set-Location $raiz

Write-Output '=== 1. FICHAS DE PLAZA Y SUS DUEÑOS ==='
$carpeta = Join-Path $raiz '.estado-workers\slots-chrome'
Get-ChildItem $carpeta -ErrorAction SilentlyContinue | ForEach-Object {
  $contenido = (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue)
  $pidTexto = if ($contenido) { ($contenido -split '\s+')[0] } else { '' }
  $vive = $false
  if ($pidTexto -match '^\d+$') { $vive = [bool](Get-Process -Id ([int]$pidTexto) -ErrorAction SilentlyContinue) }
  Write-Output ("  {0,-28} pid={1,-8} {2}" -f $_.Name, $pidTexto, $(if ($vive) { 'VIVO' } else { 'muerto o vacío' }))
}

Write-Output ''
Write-Output '=== 2. LIMPIAR FICHAS DE DUEÑOS QUE YA NO EXISTEN ==='
$borradas = 0
Get-ChildItem $carpeta -Filter 'slot-*.lock' -ErrorAction SilentlyContinue | ForEach-Object {
  $contenido = (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue)
  $pidTexto = if ($contenido) { ($contenido -split '\s+')[0] } else { '' }
  $vive = $false
  if ($pidTexto -match '^\d+$') { $vive = [bool](Get-Process -Id ([int]$pidTexto) -ErrorAction SilentlyContinue) }
  if (-not $vive) { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue; $borradas++ }
}
Write-Output "  fichas huérfanas borradas: $borradas"
Get-ChildItem $carpeta -Filter 'slot-*.lock' -ErrorAction SilentlyContinue | ForEach-Object { Write-Output "  queda: $($_.Name)" }

Write-Output ''
Write-Output '=== 3. SUBIR EL PRESUPUESTO DE PLAZAS A 4 (una por federación) ==='
$entorno = Join-Path $raiz 'scripts\entorno-flota.ps1'
$texto = Get-Content $entorno -Raw -Encoding UTF8
if ($texto -match "\`$env:FACYLF_MEMORIA_GB = '3'") {
  $nuevo = $texto -replace "\`$env:FACYLF_MEMORIA_GB = '3'", "`$env:FACYLF_MEMORIA_GB = '4.5'"
  # Se deja escrito el porqué, para que nadie lo baje otra vez sin saber lo que cuesta.
  $nota = @"

# ── POR QUÉ 4,5 GB Y NO 3 (28/09/2026) ──────────────────────────────────────────────────────────────────
# Con 3 GB salen 2 plazas de navegador: plazas = (memoria - 1,5) / 0,75. El PC recoge CUATRO federaciones,
# así que dos se quedaban esperando turno y se turnaban cada 20 minutos. Medido en Madrid: 119 de 360
# minutos sin pedir nada, con 40.120 trabajos disponibles en su cola. Con 4,5 GB salen 4 plazas y ninguna
# federación tiene que ceder el turno. El PC tiene 32 GB de memoria; esto es presupuesto del gobernador,
# no una reserva real.
"@
  if ($nuevo -notmatch 'POR QUÉ 4,5 GB') { $nuevo = $nuevo + $nota }
  Set-Content -Path $entorno -Value $nuevo -Encoding UTF8 -NoNewline
  Write-Output '  entorno-flota.ps1 actualizado'
} else {
  Write-Output '  (no se encontró la línea esperada; revisar a mano)'
}
Select-String -Path $entorno -Pattern "FACYLF_MEMORIA_GB = |FACYLF_TURNO_PLAZA_MIN = |FACYLF_RESERVA_GB = " | ForEach-Object { Write-Output ("  " + $_.Line.Trim()) }

Write-Output ''
Write-Output '=== 4. REINICIAR LA FLOTA PARA QUE TOME EL ENTORNO NUEVO ==='
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'supervisor-flota|recolector' } | ForEach-Object {
  Write-Output "  parando PID $($_.ProcessId)"
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 8
Write-Output '  relanzando la tarea programada...'
Start-ScheduledTask -TaskName 'FACyLF flota' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 30
Write-Output '  procesos de recolección ahora:'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'supervisor-flota|recolector' } | ForEach-Object {
  $m = if ($_.CommandLine -match 'recolector-([\w-]+)\.mjs') { $Matches[1] } elseif ($_.CommandLine -match 'supervisor') { 'SUPERVISOR' } else { '?' }
  Write-Output ("    {0,-16} PID {1}" -f $m, $_.ProcessId)
}
Get-ChildItem $carpeta -Filter 'slot-*.lock' -ErrorAction SilentlyContinue | ForEach-Object { Write-Output "  ficha: $($_.Name)" }
